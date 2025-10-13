import { getServiceHub, isServiceHubInitialized } from '@/hooks/useServiceHub'
import { nodeRegistry } from '@/containers/node/nodeRegistry'
import { runAndPropagate } from '@/lib/nodeExecution'
import { getBuilderBoard } from '@/services/publish'
import { useThreads } from '@/hooks/useThreads'

// Listen to 'message:created' events and dispatch matching published builder triggers
export async function startMessageTriggerDispatcher() {
  try {
    console.info('[messageTriggerDispatcher] start requested — ensuring ServiceHub is initialized')
    // wait for service hub initialization (avoid race on app startup)
    const deadline = Date.now() + 5000
    while (!isServiceHubInitialized() && Date.now() < deadline) {
      // small backoff
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!isServiceHubInitialized()) {
      console.error('[messageTriggerDispatcher] startup failed: ServiceHub not initialized within timeout')
      return
    }
    const hub = getServiceHub()
    console.info('[messageTriggerDispatcher] starting, registering listener for message:created')
  hub.events().listen('message:created', async (evt: any) => {
        console.info('[messageTriggerDispatcher] received event from hub.listen (handler entry)')
        console.debug('[messageTriggerDispatcher] raw event object:', evt)
      try {
        const msg = evt.payload
        console.info('[messageTriggerDispatcher] event payload extracted')
        console.debug('[messageTriggerDispatcher] message payload:', msg)
        if (!msg || !msg.thread_id) {
          console.info('[messageTriggerDispatcher] skipping event: missing payload or thread_id')
          return
        }
        // Only trigger after assistant (agent) messages
        const role = (msg.role  ) as string | undefined
        if (role && role !== 'assistant') {
          console.info('[messageTriggerDispatcher] skipping event: message role is not assistant', role, 'thread', msg.thread_id)
          return
        }
        console.info('[messageTriggerDispatcher] payload has thread_id:', msg.thread_id, 'role:', role)

        // Find published builders (scan localStorage fallback)
        const builders = await (async () => {
          try {
            // reuse publish list helper if available
            const { listPublishBuilders } = await import('@/services/publish')
            return await listPublishBuilders()
          } catch (e) {
            // fallback: scan localStorage
            const res: string[] = []
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i) || ''
              const m = key.match(/^builder:(.+):publish$/)
              if (m && localStorage.getItem(key) === '1') res.push(m[1])
            }
            return res
          }
        })()

  console.info('[messageTriggerDispatcher] discovered builders count:', Array.isArray(builders) ? builders.length : 0)
  console.debug('[messageTriggerDispatcher] builders list:', builders)
  if (!Array.isArray(builders) || builders.length === 0) return

        // For each builder, load board and scan for trigger elements
        for (const builderId of builders) {
          try {
            console.info('[messageTriggerDispatcher] loading board for builder:', builderId)
            const boardStr = await getBuilderBoard(builderId).catch((e) => { console.warn('[messageTriggerDispatcher] getBuilderBoard failed for', builderId, e); return null })
            if (!boardStr) continue
            console.info('[messageTriggerDispatcher] loaded board string length:', boardStr.length)
            let board: any
            try { board = JSON.parse(boardStr) } catch { continue }
            console.info('[messageTriggerDispatcher] parsed board json for builder:', builderId)
            const elements: any[] = Array.isArray(board.elements) ? board.elements : []
            const connections: any[] = Array.isArray(board.connections) ? board.connections : []
            console.info('[messageTriggerDispatcher] elements count:', elements.length, 'connections count:', connections.length)

            // find all elements of type thread_message
            const triggerEls = elements.filter((e) => (e.meta && (e.meta._nodeId)) && nodeRegistry.find((n) => n.id === e.meta._nodeId && n.id === 'thread_message'))
            console.info('[messageTriggerDispatcher] found trigger elements count:', triggerEls.length)
            for (const el of triggerEls) {
              console.info('[messageTriggerDispatcher] checking trigger element:', el.id)
              try {
                const meta = el.meta || {}
                const allowedThreads: string[] = Array.isArray(meta.threadId) ? meta.threadId : []
                const allowedFolders: string[] = Array.isArray(meta.folders) ? meta.folders : []

                // If threads or folders arrays are empty -> act as wildcard (match any)
                let threadMatch = true
                if (allowedThreads.length > 0) threadMatch = allowedThreads.includes(msg.thread_id)
                console.info('[messageTriggerDispatcher] allowedThreads:', allowedThreads, 'threadMatch:', threadMatch)

                let folderMatch = true
                if (allowedFolders.length > 0) {
                  // Try to resolve project id from message metadata, fallback to thread metadata
                  const thread = useThreads.getState().getThreadById(msg.thread_id)
                  const projectId = msg.metadata?.project?.id || msg.project_id || thread?.metadata?.project?.id || null
                  folderMatch = projectId ? allowedFolders.includes(projectId) : false
                }
                console.info('[messageTriggerDispatcher] allowedFolders:', allowedFolders, 'folderMatch:', folderMatch)

                if (!threadMatch || !folderMatch) continue
                console.info('[messageTriggerDispatcher] trigger element matches message (thread+folder) — preparing to execute', el.id)

                // execute the node via runtime
                const nodeId = el.meta._nodeId
                console.info('[messageTriggerDispatcher] nodeId from element meta:', nodeId)
                const entry = nodeRegistry.find((n) => n.id === nodeId)
                if (!entry) { console.warn('[messageTriggerDispatcher] no node registry entry for nodeId', nodeId); continue }
                if (!entry.execute) { console.warn('[messageTriggerDispatcher] node registry entry has no execute for nodeId', nodeId); continue }
                console.info('[messageTriggerDispatcher] found node entry, will invoke executor for node:', entry.id)

                const getOutgoing = (elId: string) => connections.filter((c) => c.from && c.from.nodeId === elId).map((c) => ({ fromPortId: c.from.portId, targetElementId: c.to.nodeId, targetPortId: c.to.portId }))
                const resolveTarget = (targetElementId: string) => {
                  const tgt = elements.find((ee) => ee.id === targetElementId)
                  if (!tgt) return null
                  const nid = (tgt.meta as any)?._nodeId
                  if (!nid) return null
                  const e = nodeRegistry.find((n) => n.id === nid)
                  if (!e || !e.execute) return null
                  return { executor: e.execute as any, nodeId: e.id, meta: tgt.meta }
                }
                
                // run and propagate with message payload as input
                ;(async () => {
                  console.info('[messageTriggerDispatcher] calling runAndPropagate for element', el.id)
                  try {
                    await runAndPropagate(
                      el.id,
                      entry.id,
                      entry.execute as any,
                      { message: msg },
                      el.meta || {},
                      {},
                      getOutgoing,
                      resolveTarget,
                      (r: any) => r
                    )
                    console.info('[messageTriggerDispatcher] runAndPropagate finished for element', el.id)
                  } catch (e) {
                    console.error('[messageTriggerDispatcher] runAndPropagate error for element', el.id, e)
                  }
                })()

              } catch (e) { console.error('[messageTriggerDispatcher] trigger element error', e) }
            }

          } catch (e) { console.error('[messageTriggerDispatcher] builder scan error', e) }
        }

      } catch (e) { console.error('[messageTriggerDispatcher] handler error', e) }
    }).catch((e: any) => { console.error('[messageTriggerDispatcher] listen failed', e) })
    // Register listener for thread creation triggers
    console.info('[messageTriggerDispatcher] registering listener for thread:created')
    hub.events().listen('thread:created', async (evt: any) => {
      console.info('[messageTriggerDispatcher] thread:created event received')
      console.debug('[messageTriggerDispatcher] raw thread event:', evt)
      try {
        const thread = evt.payload
        if (!thread || !thread.id) {
          console.info('[messageTriggerDispatcher] skipping thread event: missing payload or id')
          return
        }

        // Find published builders
        const builders = await (async () => {
          try {
            const { listPublishBuilders } = await import('@/services/publish')
            return await listPublishBuilders()
          } catch (e) {
            const res: string[] = []
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i) || ''
              const m = key.match(/^builder:(.+):publish$/)
              if (m && localStorage.getItem(key) === '1') res.push(m[1])
            }
            return res
          }
        })()

        if (!Array.isArray(builders) || builders.length === 0) return

        for (const builderId of builders) {
          try {
            const boardStr = await getBuilderBoard(builderId).catch(() => null)
            if (!boardStr) continue
            let board: any
            try { board = JSON.parse(boardStr) } catch { continue }
            const elements: any[] = Array.isArray(board.elements) ? board.elements : []
            const connections: any[] = Array.isArray(board.connections) ? board.connections : []

            const triggerEls = elements.filter((e) => (e.meta && (e.meta._nodeId)) && nodeRegistry.find((n) => n.id === e.meta._nodeId && n.id === 'thread_created'))
            for (const el of triggerEls) {
              try {
                const meta = el.meta || {}
                const allowedFolders: string[] = Array.isArray(meta.folders) ? meta.folders : []

                // If folders array empty -> wildcard match
                let folderMatch = true
                if (allowedFolders.length > 0) {
                  const projectId = thread.metadata?.project?.id || thread.project_id || null
                  folderMatch = projectId ? allowedFolders.includes(projectId) : false
                }
                if (!folderMatch) continue

                const nodeId = el.meta._nodeId
                const entry = nodeRegistry.find((n) => n.id === nodeId)
                if (!entry || !entry.execute) continue

                const getOutgoing = (elId: string) => connections.filter((c) => c.from && c.from.nodeId === elId).map((c) => ({ fromPortId: c.from.portId, targetElementId: c.to.nodeId, targetPortId: c.to.portId }))
                const resolveTarget = (targetElementId: string) => {
                  const tgt = elements.find((ee) => ee.id === targetElementId)
                  if (!tgt) return null
                  const nid = (tgt.meta as any)?._nodeId
                  if (!nid) return null
                  const e = nodeRegistry.find((n) => n.id === nid)
                  if (!e || !e.execute) return null
                  return { executor: e.execute as any, nodeId: e.id, meta: tgt.meta }
                }

                ;(async () => {
                  try {
                    await runAndPropagate(
                      el.id,
                      entry.id,
                      entry.execute as any,
                      { thread },
                      el.meta || {},
                      {},
                      getOutgoing,
                      resolveTarget,
                      (r: any) => r
                    )
                  } catch (e) {
                    console.error('[messageTriggerDispatcher] runAndPropagate error for thread-created element', el.id, e)
                  }
                })()

              } catch (e) { console.error('[messageTriggerDispatcher] thread trigger element error', e) }
            }

          } catch (e) { console.error('[messageTriggerDispatcher] thread builders scan error', e) }
        }

      } catch (e) { console.error('[messageTriggerDispatcher] thread handler error', e) }
    }).catch((e: any) => { console.error('[messageTriggerDispatcher] listen failed for thread:created', e) })
  } catch (e) { console.error('[messageTriggerDispatcher] startup failed', e) }
}

export default { startMessageTriggerDispatcher }
