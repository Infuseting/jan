use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Runtime, Manager};

use crate::core::app::commands::get_jan_data_folder_path;
use crate::core::state::AppState;
use crate::core::publish::commands as publish_commands;
use chrono::{Datelike, Timelike, Local};

fn get_publish_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    let mut p = get_jan_data_folder_path(app.clone());
    p.push("publish");
    p
}

fn load_builders<R: Runtime>(app: &tauri::AppHandle<R>) -> Vec<(String, PathBuf)> {
    let mut res = Vec::new();
    let mut dir = get_publish_dir(app);
    dir.push("builders");
    if !dir.exists() {
        return res;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            if let Ok(fname) = e.file_name().into_string() {
                let mut path = e.path();
                path.push("board.json");
                if path.exists() {
                    res.push((fname, path));
                }
            }
        }
    }
    res
}

fn parse_cron_exprs_from_board(path: &PathBuf) -> Vec<(String, String)> {
    let mut s = String::new();
    if let Ok(mut f) = File::open(path) {
        if f.read_to_string(&mut s).is_ok() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                if let Some(els) = v.get("elements") {
                    if let Some(arr) = els.as_array() {
                        let mut out: Vec<(String, String)> = vec![];
                        for el in arr {
                            if let Some(meta) = el.get("meta") {
                                if let Some(node) = meta.get("_nodeId") {
                                    if node == "cron" {
                                        if let Some(cr) = meta.get("cron") {
                                            if let Some(crs) = cr.as_str() {
                                                if let Some(id) = el.get("id").and_then(|x| x.as_str()) {
                                                    out.push((id.to_string(), crs.to_string()));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        return out
                    }
                }
            }
        }
    }
    Vec::new()
}

fn matches_cron(expr: &str, dt: &chrono::DateTime<chrono::Local>) -> bool {
    // Very basic 5-field parser: minute hour day month weekday
    let parts: Vec<&str> = expr.trim().split_whitespace().collect();
    if parts.len() < 5 { return false }
    let minute = dt.minute() as i32;
    let hour = dt.hour() as i32;
    let day = dt.day() as i32;
    let month = dt.month() as i32;
    let weekday = dt.weekday().num_days_from_sunday() as i32; // 0 = sunday

    fn match_part(p: &str, v: i32) -> bool {
        if p == "*" { return true }
        if p.contains(',') {
            return p.split(',').any(|it| match_part(it, v))
        }
        if p.starts_with("*/") {
            if let Ok(n) = p[2..].parse::<i32>() { return n > 0 && (v % n) == 0 }
            return false
        }
        if let Ok(n) = p.parse::<i32>() { return n == v }
        false
    }

    match_part(parts[0], minute) && match_part(parts[1], hour) && match_part(parts[2], day) && match_part(parts[3], month) && match_part(parts[4], weekday)
}

pub async fn run_scheduler<R: Runtime>(app: tauri::AppHandle<R>) {
    // state file to avoid double-fires
    let mut state_path = get_publish_dir(&app);
    state_path.push("state.json");
    let mut last_fired: HashMap<String, String> = if state_path.exists() {
        if let Ok(mut f) = File::open(&state_path) {
            let mut s = String::new();
            if f.read_to_string(&mut s).is_ok() {
                serde_json::from_str(&s).unwrap_or_default()
            } else { HashMap::new() }
        } else { HashMap::new() }
    } else { HashMap::new() };

    loop {
            let now = Local::now();
        if now.second() == 0 {
            let builders = load_builders(&app);
            log::info!("publish scheduler: found {} builders", builders.len());
            for (builder_id, board_path) in builders {
                log::info!("publish scheduler: builder={} board_path={}", builder_id, board_path.display());
                // check metadata.json publish flag
                if let Some(parent) = board_path.parent() {
                    let mut meta_path = parent.to_path_buf();
                    meta_path.push("metadata.json");
                    if meta_path.exists() {
                        if let Ok(s) = fs::read_to_string(&meta_path) {
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                                if let Some(published) = v.get("publish").and_then(|x| x.as_bool()) {
                                    if !published { continue }
                                } else { continue }
                            } else { continue }
                        } else { continue }
                    } else { continue }
                }

                let exprs = parse_cron_exprs_from_board(&board_path);
                for (trigger_id, expr) in exprs {
                    log::debug!("publish scheduler: builder={} trigger={} expr={}", builder_id, trigger_id, expr);
                    if matches_cron(&expr, &now) {
                        log::info!("publish scheduler: cron matches builder={} trigger={} expr={}", builder_id, trigger_id, expr);
                        let minute_key = format!("{}-{}-{}-{}-{}", now.year(), now.month(), now.day(), now.hour(), now.minute());
                        let key = format!("{}::{}", builder_id, trigger_id);
                        if last_fired.get(&key).map(|v| v == &minute_key).unwrap_or(false) {
                            continue
                        }
                        // call execute_trigger function directly
                        let state = app.state::<AppState>();
                        log::info!("publish scheduler: calling execute_trigger for builder={} trigger={}", builder_id, trigger_id);
                        let res = publish_commands::execute_trigger(app.clone(), state, builder_id.clone(), trigger_id.clone()).await;
                        if let Err(e) = &res { log::error!("publish scheduler: execute_trigger returned error: {}", e) }
                        else { log::info!("publish scheduler: execute_trigger OK: {}", res.unwrap_or_default()) }
                        last_fired.insert(key, minute_key);
                    }
                }
            }
            // persist state
            if let Ok(mut f) = File::create(&state_path) {
                let _ = f.write_all(serde_json::to_string(&last_fired).unwrap_or_default().as_bytes());
            }
            // sleep a bit to avoid double-executing within same second
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}
