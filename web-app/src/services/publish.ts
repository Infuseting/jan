import { isPlatformTauri } from '@/lib/platform';
import { getServiceHub, isServiceHubInitialized } from '@/hooks/useServiceHub';

export async function listPublishBuilders(): Promise<string[]> {
  if (isPlatformTauri()) {
    // wait for service hub to be initialized (avoid race on app startup)
    const deadline = Date.now() + 5000
    while (!isServiceHubInitialized() && Date.now() < deadline) {
      // small backoff
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
      console.info('[publish] listPublishBuilders: invoking list_publish_builders')
      const res = await getServiceHub().core().invoke<string[]>('list_publish_builders')
      console.info('[publish] listPublishBuilders: result count=', res?.length)
      return res
    } catch (err) {
      console.error('[publish] listPublishBuilders: failed', err)
      throw err
    }
  }
  // fallback: scan localStorage keys
  const res: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || '';
    const m = key.match(/^builder:(.+):board$/);
    if (m) res.push(m[1]);
  }
  return res;
}

export async function getBuilderBoard(builderId: string): Promise<string | null> {
  if (isPlatformTauri()) {
    const deadline = Date.now() + 5000
    while (!isServiceHubInitialized() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
      console.info(`[publish] getBuilderBoard: invoking get_builder_board builder=${builderId}`)
  try { await getServiceHub().core().invoke('client_invoke_log', { message: `get_builder_board builder=${builderId}` }) } catch {}
      const r = await getServiceHub().core().invoke<string | null>('get_builder_board', { builderId: builderId })
      if (r) {
        console.debug(`[publish] getBuilderBoard: loaded builder=${builderId} size=${r.length} snippet=${r.slice(0,256).replace(/\n/g, '\\n')}`)
        try { await getServiceHub().core().invoke('client_invoke_log', { message: `get_builder_board: received builder=${builderId} size=${r.length}` }) } catch {}
      } else {
        console.info(`[publish] getBuilderBoard: no board for builder=${builderId}`)
        try { await getServiceHub().core().invoke('client_invoke_log', { message: `get_builder_board: no board for builder=${builderId}` }) } catch {}
      }
      return r ?? null
    } catch (err) {
      console.error('[publish] getBuilderBoard: failed', builderId, err)
      throw err
    }
  }
  const key = `builder:${builderId}:board`;
  const s = localStorage.getItem(key);
  return s;
}

export async function setBuilderPublish(builderId: string, publish: boolean): Promise<void> {
  if (isPlatformTauri()) {
    const deadline = Date.now() + 5000
    while (!isServiceHubInitialized() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
  console.info(`[publish] setBuilderPublish: builder=${builderId} publish=${publish}`)
  await getServiceHub().core().invoke('set_builder_publish', { builderId: builderId, publish })
      console.info(`[publish] setBuilderPublish: succeeded builder=${builderId}`)
      return
    } catch (err) {
      console.error('[publish] setBuilderPublish: failed', builderId, publish, err)
      throw err
    }
  }
  localStorage.setItem(`builder:${builderId}:publish`, publish ? '1' : '0');
}

export async function upsertBuilderBoard(builderId: string, board: string): Promise<void> {
  // sanitize incoming board JSON string to remove ephemeral runtime fields that must not be persisted
  function sanitizeBoardString(rawBoard: string): string {
    try {
      const parsed = JSON.parse(rawBoard)
      if (parsed && Array.isArray(parsed.elements)) {
        parsed.elements = parsed.elements.map((el: any) => {
          if (el && el.meta && typeof el.meta === 'object') {
            const meta = { ...el.meta }
            // remove lastRun* and activePort* fields
            delete meta.lastRunStatus
            delete meta.lastRunAt
            delete meta.lastRunResult
            delete meta.lastRunError
            delete meta.activePortId
            delete meta.activePortKind
            return { ...el, meta }
          }
          return el
        })
      }
      return JSON.stringify(parsed)
    } catch (e) {
      // if parsing fails, return original (avoid data loss) and log
      console.warn('[publish] sanitizeBoardString: failed to parse board, skipping sanitization', e)
      return rawBoard
    }
  }

  if (isPlatformTauri()) {
    const deadline = Date.now() + 5000
    while (!isServiceHubInitialized() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
      // sanitize before logging/persisting
      const sanitized = sanitizeBoardString(board)
      console.info(`[publish] upsertBuilderBoard: builder=${builderId} size=${sanitized.length} snippet=${sanitized.slice(0,256).replace(/\n/g, '\\n')}`)
      // small debug: log client intent to native side so we can confirm invocation
  try { await getServiceHub().core().invoke('client_invoke_log', { message: `upsert_builder_board builder=${builderId} size=${sanitized.length}` }) } catch {}
  await getServiceHub().core().invoke('upsert_builder_board', { payload: { builderId: builderId, board: sanitized } })
      console.info(`[publish] upsertBuilderBoard: succeeded builder=${builderId}`)
      return
    } catch (err) {
      console.error('[publish] upsertBuilderBoard: failed', builderId, err)
      throw err
    }
  }
  try {
    const sanitized = sanitizeBoardString(board)
    localStorage.setItem(`builder:${builderId}:board`, sanitized)
  } catch (e) {
    // fallback: store raw board if sanitization fails
    localStorage.setItem(`builder:${builderId}:board`, board)
  }
}

export async function saveBuilderMetadata(builderId: string, name: string, updatedAt?: number): Promise<void> {
  if (isPlatformTauri()) {
    const deadline = Date.now() + 5000
    while (!isServiceHubInitialized() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
      console.info(`[publish] saveBuilderMetadata: builder=${builderId} name=${name} updated_at=${updatedAt}`)
      try { await getServiceHub().core().invoke('client_invoke_log', { message: `save_builder_metadata builder=${builderId} name=${name}` }) } catch {}
      await getServiceHub().core().invoke('save_builder_metadata', { payload: { builder_id: builderId, name, updated_at: updatedAt || Date.now() } })
      console.info(`[publish] saveBuilderMetadata: succeeded builder=${builderId}`)
      return
    } catch (err) {
      console.error('[publish] saveBuilderMetadata: failed', builderId, name, err)
      throw err
    }
  }
  // non-tauri fallback: merge into builder-management storage
  try {
    const raw = localStorage.getItem('builder-management')
    const parsed = raw ? JSON.parse(raw) : { builders: [] }
    const exists = (parsed.builders || []).some((b: any) => b.id === builderId)
    if (!exists) {
      parsed.builders = parsed.builders || []
      parsed.builders.push({ id: builderId, name, updated_at: updatedAt || Date.now() })
      localStorage.setItem('builder-management', JSON.stringify(parsed))
    }
  } catch (e) {
    // best-effort
  }
}

// Append a log entry for a builder execution. If running in Tauri, invoke native to append a file; otherwise persist to localStorage as JSON array.
export async function appendBuilderLog(builderId: string, executionId: string, message: string): Promise<void> {
  const timestamp = Date.now()
  if (isPlatformTauri()) {
    const deadline = Date.now() + 5000
    while (!isServiceHubInitialized() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
      // best-effort native append; native side may implement 'append_builder_log'
      await getServiceHub().core().invoke('append_builder_log', { builderId, executionId, timestamp, message })
      return
    } catch (err) {
      // fallback to localStorage below
      console.warn('[publish] appendBuilderLog native invoke failed, falling back to localStorage', err)
    }
  }

  try {
    const key = `builder:${builderId}:log:${executionId}`
    const raw = localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    arr.push({ timestamp, message })
    localStorage.setItem(key, JSON.stringify(arr))
  } catch (e) {
    console.error('[publish] appendBuilderLog fallback failed', e)
  }
}
