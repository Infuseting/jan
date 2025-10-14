import { getServiceHub } from '@/hooks/useServiceHub'
import { nodeRegistry } from '@/containers/node/nodeRegistry'
import { runAndPropagate, onFinish, onError } from '@/lib/nodeExecution'

export async function handlePublishTrigger(builderId: string, triggerId: string) {
  try {
    if (!builderId || !triggerId) return
    // Ask backend for the persisted board snapshot
    const boardStr = await getServiceHub().core().invoke<string | null>('get_builder_board', { builderId })
    if (!boardStr) {
      console.warn('[publishExecutor] no board for builder', builderId)
      return
    }
    let board: any
    try { board = JSON.parse(boardStr) } catch (e) { console.error('[publishExecutor] invalid board json', e); return }
    const elements: any[] = Array.isArray(board.elements) ? board.elements : []
    const connections: any[] = Array.isArray(board.connections) ? board.connections : []

    const el = elements.find((e) => e.id === triggerId)
    if (!el) {
      console.warn('[publishExecutor] trigger element not found', triggerId, 'builder', builderId)
      return
    }

    const nodeId = (el.meta as any)?._nodeId
    const entry = nodeRegistry.find((n) => n.id === nodeId)
    if (!entry || !entry.execute) {
      console.warn('[publishExecutor] no executor for node', nodeId)
      return
    }

    const getOutgoing = (elId: string) => {
      return connections
        .filter((c) => c.from && c.from.nodeId === elId)
        .map((c) => ({ fromPortId: c.from.portId, targetElementId: c.to.nodeId, targetPortId: c.to.portId }))
    }

    const resolveTarget = (targetElementId: string) => {
      const tgt = elements.find((ee) => ee.id === targetElementId)
      if (!tgt) return null
      const nid = (tgt.meta as any)?._nodeId
      if (!nid) return null
      const e = nodeRegistry.find((n) => n.id === nid)
      if (!e || !e.execute) return null
      return { executor: e.execute as any, nodeId: e.id, meta: tgt.meta }
    }

  console.info('[publishExecutor] executing trigger', triggerId, 'for builder', builderId)
    // attach temporary listeners to capture the executor result and forward to backend logs
    let finishUnsub = () => {}
    let errorUnsub = () => {}
      try {
      // generate an execution id for this run so concurrent runs are distinct
      const executionId = require('uuid').v4()
      finishUnsub = onFinish(({ elementId, result, executionId: evId }) => {
        if (elementId !== el.id) return
        try {
          const msg = JSON.stringify({ type: 'finish', builderId, triggerId, elementId, executionId: evId, result: (result === undefined ? null : result) })
          getServiceHub().core().invoke('client_invoke_log', { message: `[publishExecutor] ${msg}` }).catch(() => {})
        } catch (e) {}
      })
      errorUnsub = onError(({ elementId, error, executionId: evId }) => {
        if (elementId !== el.id) return
        try {
          const msg = JSON.stringify({ type: 'error', builderId, triggerId, elementId, executionId: evId, error: String(error) })
          getServiceHub().core().invoke('client_invoke_log', { message: `[publishExecutor] ${msg}` }).catch(() => {})
        } catch (e) {}
      })

      await runAndPropagate(
        el.id,
        entry.id,
        entry.execute as any,
        undefined,
        el.meta || {},
        { executionId },
        getOutgoing,
        resolveTarget,
        (resultOutput: any) => resultOutput
      )
      console.info('[publishExecutor] finished trigger', triggerId, 'builder', builderId)
    } catch (e) {
      console.error('[publishExecutor] execution error for trigger', triggerId, e)
      try {
        getServiceHub().core().invoke('client_invoke_log', { message: `[publishExecutor] execution exception builder=${builderId} trigger=${triggerId} error=${String(e)}` }).catch(() => {})
      } catch (ee) {}
    } finally {
      try { finishUnsub && finishUnsub() } catch {}
      try { errorUnsub && errorUnsub() } catch {}
    }
  } catch (e) {
    console.error('[publishExecutor] unexpected error', e)
  }
}

export default { handlePublishTrigger }
