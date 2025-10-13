use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use chrono::Utc;
use tauri::{AppHandle, Runtime, State, Emitter};
use log::{info, error, debug, warn};

use crate::core::app::commands::get_jan_data_folder_path;
use crate::core::state::AppState;

fn ensure_publish_dirs<R: Runtime>(app_handle: tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let mut p = get_jan_data_folder_path(app_handle).clone();
    p.push("publish");
    if !p.exists() {
        fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    }
    let mut logs = p.clone();
    logs.push("logs");
    if !logs.exists() {
        fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    }
    info!("ensure_publish_dirs -> publish logs dir: {}", logs.display());
    Ok(logs)
}

fn get_builders_dir<R: Runtime>(app_handle: tauri::AppHandle<R>) -> PathBuf {
    let mut p = get_jan_data_folder_path(app_handle).clone();
    p.push("publish");
    p.push("builders");
    p
}

fn get_publish_root_dir<R: Runtime>(app_handle: tauri::AppHandle<R>) -> PathBuf {
    let mut p = get_jan_data_folder_path(app_handle).clone();
    p.push("publish");
    p
}

fn publish_list_path<R: Runtime>(app_handle: tauri::AppHandle<R>) -> PathBuf {
    let mut p = get_publish_root_dir(app_handle);
    p.push("publish.json");
    p
}

fn read_publish_list<R: Runtime>(app_handle: tauri::AppHandle<R>) -> Result<Vec<String>, String> {
    let path = publish_list_path(app_handle);
    if !path.exists() {
        // no publish list file -> default to empty (publish off by default)
        return Ok(vec![]);
    }
    match fs::read_to_string(&path) {
        Ok(s) => match serde_json::from_str::<Vec<String>>(&s) {
            Ok(v) => Ok(v),
            Err(e) => Err(format!("read_publish_list: invalid json {}: {}", path.display(), e)),
        },
        Err(e) => Err(format!("read_publish_list: failed to read {}: {}", path.display(), e)),
    }
}

fn write_publish_list<R: Runtime>(app_handle: tauri::AppHandle<R>, list: &Vec<String>) -> Result<(), String> {
    let dir = get_publish_root_dir(app_handle);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("write_publish_list: failed to create {}: {}", dir.display(), e))?;
    }
    let mut path = dir.clone();
    path.push("publish.json");
    let payload = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    match fs::write(&path, &payload) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("write_publish_list: failed to write {}: {}", path.display(), e)),
    }
}

fn ensure_builder_dir<R: Runtime>(app_handle: tauri::AppHandle<R>, builder_id: &str) -> Result<PathBuf, String> {
    let mut dir = get_builders_dir(app_handle);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    dir.push(builder_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

#[tauri::command]
pub async fn list_publish_builders<R: Runtime>(app_handle: AppHandle<R>) -> Result<Vec<String>, String> {
    // Read the root publish.json which contains the list of builder ids that should be published.
    match read_publish_list(app_handle) {
        Ok(list) => {
            info!("list_publish_builders -> returning {} published builders from publish.json", list.len());
            Ok(list)
        }
        Err(e) => {
            error!("list_publish_builders: failed to read publish list: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn get_builder_board<R: Runtime>(app_handle: AppHandle<R>, builder_id: String) -> Result<Option<String>, String> {
    let mut dir = get_builders_dir(app_handle);
    dir.push(&builder_id);
    dir.push("board.json");
    if !dir.exists() { 
        info!("get_builder_board: board not found for builder={} path={}", builder_id, dir.display());
        return Ok(None)
    }
    match fs::read_to_string(&dir) {
        Ok(s) => {
            let snippet: String = s.chars().take(512).collect();
            info!("get_builder_board: loaded builder={} path={} size={} snippet=\"{}\"", builder_id, dir.display(), s.len(), snippet.replace('\n', "\\n"));
            Ok(Some(s))
        }
        Err(e) => {
            error!("get_builder_board: failed to read {}: {}", dir.display(), e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn set_builder_publish<R: Runtime>(app_handle: AppHandle<R>, builder_id: String, publish: bool) -> Result<(), String> {
    // Update the central publish.json list: add or remove the builder id
    let mut list = read_publish_list(app_handle.clone()).map_err(|e| e.to_string())?;
    if publish {
        if !list.contains(&builder_id) {
            list.push(builder_id.clone())
        }
    } else {
        list.retain(|id| id != &builder_id)
    }
    write_publish_list(app_handle.clone(), &list).map_err(|e| e.to_string())?;

    // Also ensure builder dir and write metadata.json for compatibility with existing callers
    let dir = ensure_builder_dir(app_handle.clone(), &builder_id)?;
    let mut meta_path = dir.clone();
    meta_path.push("metadata.json");
    let mut meta = serde_json::Map::new();
    meta.insert("id".to_string(), serde_json::Value::String(builder_id.clone()));
    meta.insert("publish".to_string(), serde_json::Value::Bool(publish));
    let payload = serde_json::to_string_pretty(&serde_json::Value::Object(meta)).map_err(|e| e.to_string())?;
    info!("set_builder_publish: updated publish.json and wrote metadata for builder={} publish={} path={} payload_snippet=\"{}\"", builder_id, publish, meta_path.display(), payload.chars().take(512).collect::<String>().replace('\n', "\\n"));
    match fs::write(&meta_path, &payload) {
        Ok(_) => Ok(()),
        Err(e) => {
            error!("set_builder_publish: failed to write {}: {}", meta_path.display(), e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn upsert_builder_board<R: Runtime>(app_handle: AppHandle<R>, payload: serde_json::Value) -> Result<(), String> {
    // Accept either { builder_id, board } or { builderId, board } in payload
    let builder_id = payload.get("builder_id").or_else(|| payload.get("builderId")).and_then(|v| v.as_str()).map(|s| s.to_string())
        .ok_or_else(|| "upsert_builder_board: missing required field 'builder_id' / 'builderId'".to_string())?;
    let board = payload.get("board").or_else(|| payload.get("Board")).and_then(|v| v.as_str()).map(|s| s.to_string())
        .ok_or_else(|| "upsert_builder_board: missing required field 'board'".to_string())?;

    let dir = ensure_builder_dir(app_handle.clone(), &builder_id)?;
    let mut board_path = dir.clone();
    board_path.push("board.json");
    let snippet: String = board.chars().take(1024).collect();
    info!("upsert_builder_board: received incoming board for builder={} path={} size={} snippet=\"{}\"", builder_id, board_path.display(), board.len(), snippet.replace('\n', "\\n"));

    // Defensive guard: if the incoming board parses as JSON and has an empty `elements` array,
    // but an existing board file exists and has a non-empty `elements` array, skip writing to
    // avoid accidentally overwriting a populated board with an empty snapshot (common during
    // race conditions on mount/save).
    let incoming_may_be_empty = match serde_json::from_str::<serde_json::Value>(&board) {
        Ok(v) => {
            match v.get("elements") {
                Some(e) => e.as_array().map(|arr| arr.is_empty()).unwrap_or(false),
                None => false,
            }
        }
        Err(_) => false,
    };

    if incoming_may_be_empty && board_path.exists() {
        if let Ok(existing_raw) = fs::read_to_string(&board_path) {
            if let Ok(existing_json) = serde_json::from_str::<serde_json::Value>(&existing_raw) {
                let existing_has_elements = match existing_json.get("elements") {
                    Some(e) => e.as_array().map(|arr| !arr.is_empty()).unwrap_or(false),
                    None => false,
                };
                if existing_has_elements {
                    info!("upsert_builder_board: skipping write because incoming board is empty but existing board for builder={} has elements", builder_id);
                    return Ok(());
                }
            }
        }
    }

    info!("upsert_builder_board: writing board for builder={} path={} size={} snippet=\"{}\"", builder_id, board_path.display(), board.len(), snippet.replace('\n', "\\n"));
    match fs::write(&board_path, &board) {
        Ok(_) => Ok(()),
        Err(e) => {
            error!("upsert_builder_board: failed to write {}: {}", board_path.display(), e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn list_builders<R: Runtime>(app_handle: AppHandle<R>) -> Result<Vec<serde_json::Value>, String> {
    let dir = get_builders_dir(app_handle);
    if !dir.exists() {
        info!("list_builders: builders dir does not exist, creating: {}", dir.display());
        fs::create_dir_all(&dir).map_err(|e| { error!("list_builders: failed to create {}: {}", dir.display(), e); e.to_string() })?;
    }
    let mut out: Vec<serde_json::Value> = vec![];
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        if let Ok(e) = entry {
            if e.path().is_dir() {
                if let Some(name) = e.file_name().to_str() {
                    let mut meta_path = e.path().clone();
                    meta_path.push("metadata.json");
                    if meta_path.exists() {
                        match fs::read_to_string(&meta_path) {
                            Ok(s) => {
                                info!("list_builders: loaded metadata for {} from {}", name, meta_path.display());
                                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                                    out.push(v);
                                    continue;
                                }
                            }
                            Err(e) => {
                                error!("list_builders: failed to read metadata {}: {}", meta_path.display(), e);
                            }
                        }
                    }
                    // fallback metadata
                    let mut obj = serde_json::Map::new();
                    obj.insert("id".to_string(), serde_json::Value::String(name.to_string()));
                    obj.insert("name".to_string(), serde_json::Value::String(name.to_string()));
                    obj.insert("updated_at".to_string(), serde_json::Value::Number(serde_json::Number::from(0)));
                    out.push(serde_json::Value::Object(obj));
                }
            }
        }
    }
    info!("list_builders -> returning {} builder metadata entries", out.len());
    Ok(out)
}

#[tauri::command]
pub async fn save_builder_metadata<R: Runtime>(app_handle: AppHandle<R>, payload: serde_json::Value) -> Result<(), String> {
    // Accept a JSON payload and support both snake_case and camelCase keys from the frontend
    let builder_id = payload.get("builder_id").or_else(|| payload.get("builderId")).and_then(|v| v.as_str()).map(|s| s.to_string())
        .ok_or_else(|| "save_builder_metadata: missing required field 'builder_id' / 'builderId'".to_string())?;
    let name = payload.get("name").or_else(|| payload.get("Name")).and_then(|v| v.as_str()).map(|s| s.to_string())
        .unwrap_or_else(|| builder_id.clone());
    // updated_at may be provided as number (ms) — accept as i64; fallback to current time in ms
    let updated_at = payload.get("updated_at")
        .or_else(|| payload.get("updatedAt"))
        .and_then(|v| {
            if let Some(i) = v.as_i64() { Some(i) }
            else if let Some(f) = v.as_f64() { Some(f as i64) }
            else { None }
        })
        .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

    let dir = ensure_builder_dir(app_handle.clone(), &builder_id)?;
    let mut meta_path = dir.clone();
    meta_path.push("metadata.json");

    // preserve existing publish flag if present
    let mut meta_map = serde_json::Map::new();
    meta_map.insert("id".to_string(), serde_json::Value::String(builder_id.clone()));
    meta_map.insert("name".to_string(), serde_json::Value::String(name));
    meta_map.insert("updated_at".to_string(), serde_json::Value::Number(serde_json::Number::from(updated_at)));

    // try to merge existing publish
    let existing_publish = {
        let mut p = dir.clone(); p.push("metadata.json");
        if p.exists() {
            if let Ok(s) = fs::read_to_string(&p) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                    v.get("publish").and_then(|x| x.as_bool())
                } else { None }
            } else { None }
        } else { None }
    };
    if let Some(b) = existing_publish { meta_map.insert("publish".to_string(), serde_json::Value::Bool(b)); }

    let payload_str = serde_json::to_string_pretty(&serde_json::Value::Object(meta_map)).map_err(|e| e.to_string())?;
    info!("save_builder_metadata: writing metadata for builder={} path={} payload_snippet=\"{}\"", builder_id, meta_path.display(), payload_str.chars().take(512).collect::<String>().replace('\n', "\\n"));
    match fs::write(&meta_path, &payload_str) {
        Ok(_) => Ok(()),
        Err(e) => {
            error!("save_builder_metadata: failed to write {}: {}", meta_path.display(), e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn delete_builder<R: Runtime>(app_handle: AppHandle<R>, builder_id: String) -> Result<(), String> {
    let mut dir = get_builders_dir(app_handle);
    dir.push(builder_id);
    info!("delete_builder: removing builder dir {}", dir.display());
    if dir.exists() {
        match fs::remove_dir_all(&dir) {
            Ok(_) => info!("delete_builder: removed {}", dir.display()),
            Err(e) => { error!("delete_builder: failed removing {}: {}", dir.display(), e); return Err(e.to_string()) }
        }
    } else {
        warn!("delete_builder: builder dir does not exist: {}", dir.display());
    }
    Ok(())
}

#[tauri::command]
pub async fn log_publish_fire<R: Runtime>(
    app_handle: AppHandle<R>,
    _state: State<'_, AppState>,
    builder_id: String,
    trigger_id: String,
) -> Result<(), String> {
    let logs_dir = ensure_publish_dirs(app_handle.clone())?;
    let mut log_path = logs_dir.clone();
    log_path.push("publish.log");
    let now = Utc::now();
    let line = format!("{} | builder={} trigger={}\n", now.to_rfc3339(), builder_id, trigger_id);
    info!("log_publish_fire: append to {} entry=\"{}\"", log_path.display(), line.trim());
    match OpenOptions::new().create(true).append(true).open(&log_path) {
        Ok(mut f) => match f.write_all(line.as_bytes()) {
            Ok(_) => Ok(()),
            Err(e) => { error!("log_publish_fire: failed to write {}: {}", log_path.display(), e); Err(e.to_string()) }
        },
        Err(e) => { error!("log_publish_fire: failed to open {}: {}", log_path.display(), e); Err(e.to_string()) }
    }
}

/// Append a short client-provided message to publish/logs/client-invokes.log for debugging
#[tauri::command]
pub async fn client_invoke_log<R: Runtime>(app_handle: AppHandle<R>, message: String) -> Result<(), String> {
    let logs_dir = ensure_publish_dirs(app_handle.clone())?;
    let mut log_path = logs_dir.clone();
    log_path.push("client-invokes.log");
    let now = Utc::now();
    let line = format!("{} | {}\n", now.to_rfc3339(), message);
    info!("client_invoke_log: append to {} entry=\"{}\"", log_path.display(), line.trim());
    match OpenOptions::new().create(true).append(true).open(&log_path) {
        Ok(mut f) => match f.write_all(line.as_bytes()) {
            Ok(_) => Ok(()),
            Err(e) => { error!("client_invoke_log: failed to write {}: {}", log_path.display(), e); Err(e.to_string()) }
        },
        Err(e) => { error!("client_invoke_log: failed to open {}: {}", log_path.display(), e); Err(e.to_string()) }
    }
}

// Simple stub that logs and returns success. Later we will call into the executor.
#[tauri::command]
pub async fn execute_trigger<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, AppState>,
    builder_id: String,
    trigger_id: String,
) -> Result<String, String> {
    // for now just log the firing
    if let Err(e) = log_publish_fire(app_handle.clone(), state, builder_id.clone(), trigger_id.clone()).await {
        error!("execute_trigger: failed to log publish fire: {}", e);
    }
    // extra debugging: check board presence and metadata
    let mut board_path = get_builders_dir(app_handle.clone());
    board_path.push(&builder_id);
    board_path.push("board.json");
    let board_exists = board_path.exists();
    let mut meta_path = get_builders_dir(app_handle.clone()); meta_path.push(&builder_id); meta_path.push("metadata.json");
    let meta_content = if meta_path.exists() { fs::read_to_string(&meta_path).ok() } else { None };
    info!("execute_trigger: builder={} trigger={} board_exists={} metadata_exists={}", builder_id, trigger_id, board_exists, meta_path.exists());
    if let Some(ref m) = meta_content { debug!("execute_trigger: metadata snippet={}", m.chars().take(512).collect::<String>().replace('\n', "\\n")); }
    // Defensive: verify builder metadata says publish=true (scheduler already checks this,
    // but this prevents accidental execution if invoked elsewhere)
    let mut meta_path = get_builders_dir(app_handle.clone());
    meta_path.push(&builder_id);
    meta_path.push("metadata.json");
    let mut is_published = true;
    if meta_path.exists() {
        if let Ok(s) = fs::read_to_string(&meta_path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                if let Some(b) = v.get("publish").and_then(|x| x.as_bool()) {
                    is_published = b;
                }
            }
        }
    }

    if !is_published {
        warn!("execute_trigger: builder {} is not marked as published, refusing to dispatch trigger", builder_id);
        return Err(format!("builder {} is not published", builder_id));
    }

    // Emit an event so the frontend (which contains the existing node executor) can run the
    // corresponding node graph. Using emit allows any connected webview/window to pick up the
    // trigger and execute it via the existing JS runtime (runAndPropagate).
    let payload = serde_json::json!({"builder_id": builder_id.clone(), "trigger_id": trigger_id.clone()});
    match app_handle.emit("publish:trigger", payload) {
        Ok(_) => {
            info!("execute_trigger: emitted publish:trigger for builder={} trigger={}", builder_id, trigger_id);
            // Also write a short client-invoke-log entry for easier remote inspection
            if let Err(e) = client_invoke_log(app_handle.clone(), format!("emit publish:trigger builder={} trigger={} board_exists={}", builder_id, trigger_id, board_exists)).await {
                error!("execute_trigger: failed to write client_invoke_log: {}", e);
            }
            Ok(format!("dispatched builder={} trigger={}", builder_id, trigger_id))
        }
        Err(e) => {
            error!("execute_trigger: failed to emit publish:trigger: {}", e);
            Err(e.to_string())
        }
    }
}
