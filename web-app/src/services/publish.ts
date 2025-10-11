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
  if (isPlatformTauri()) {
    const deadline = Date.now() + 5000
    while (!isServiceHubInitialized() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
      console.info(`[publish] upsertBuilderBoard: builder=${builderId} size=${board.length} snippet=${board.slice(0,256).replace(/\n/g, '\\n')}`)
      // small debug: log client intent to native side so we can confirm invocation
  try { await getServiceHub().core().invoke('client_invoke_log', { message: `upsert_builder_board builder=${builderId} size=${board.length}` }) } catch {}
  await getServiceHub().core().invoke('upsert_builder_board', { payload: { builderId: builderId, board } })
      console.info(`[publish] upsertBuilderBoard: succeeded builder=${builderId}`)
      return
    } catch (err) {
      console.error('[publish] upsertBuilderBoard: failed', builderId, err)
      throw err
    }
  }
  localStorage.setItem(`builder:${builderId}:board`, board);
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
