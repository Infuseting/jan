/**
 * Lightweight node execution runtime for the Whiteboard.
 *
 * Responsibilities:
 * - Track running state per element id
 * - Provide a small API to run an executor for a specific element/node
 * - Emit lifecycle events (start, finish, error, cancel)
 * - Allow cancellation via AbortController (signal passed in context)
 *
 * This file is intentionally small and unopinionated — you can extend it
 * (persistence, queueing, concurrency limits, logging, UI hooks) as needed.
 */

export type NodeExecutor = (
  input?: any,
  meta?: Record<string, any>,
  context?: { [k: string]: any; signal?: AbortSignal }
) => Promise<any> | any

export type RunEventPayload = {
  elementId: string
  nodeId?: string
  result?: any
  error?: any
}

// standard executor return shape suggestion
export type ExecutorReturn = { portId?: string; output?: any } | any

type Listener = (payload: RunEventPayload) => void

class Emitter {
  private map = new Map<string, Set<Listener>>()

  on(event: string, fn: Listener) {
    const set = this.map.get(event) || new Set()
    set.add(fn)
    this.map.set(event, set)
    return () => this.off(event, fn)
  }

  off(event: string, fn: Listener) {
    const set = this.map.get(event)
    if (!set) return
    set.delete(fn)
    if (set.size === 0) this.map.delete(event)
  }

  emit(event: string, payload: RunEventPayload) {
    const set = this.map.get(event)
    if (!set) return
    for (const fn of Array.from(set)) {
      try { fn(payload) } catch (e) { console.error('nodeExecution emitter listener error', e) }
    }
  }
}

const emitter = new Emitter()

// currently running elementIds -> AbortController
const runningControllers = new Map<string, AbortController>()

/**
 * Return true if the element is currently executing.
 */
export function isRunning(elementId: string) {
  return runningControllers.has(elementId)
}

/**
 * Stop/cancel execution for an element (if running). This triggers an abort
 * on the signal that will be passed to the executor (if it uses it).
 */
export function stop(elementId: string) {
  const ctrl = runningControllers.get(elementId)
  if (!ctrl) return false
  try {
    console.debug('[nodeExecution] stop: aborting element', elementId)
    ctrl.abort()
  } catch (e) {
    console.error('[nodeExecution] stop: abort error for', elementId, e)
  }
  runningControllers.delete(elementId)
  emitter.emit('cancel', { elementId })
  console.info('[nodeExecution] stop: emitted cancel for', elementId)
  return true
}

/**
 * Run a node executor for a specific element.
 * - elementId: unique id of the board element (used for UI state)
 * - nodeId: optional registry id of the node (for events/logging)
 * - executor: the function to call
 * - input/meta/context: passed through to the executor
 *
 * Returns a Promise that resolves to the executor result or rejects with the error.
 */
export async function runExecutorForElement(
  elementId: string,
  nodeId: string | undefined,
  executor: NodeExecutor,
  input?: any,
  meta?: Record<string, any>,
  ctx?: Record<string, any>
) {
  if (!elementId) throw new Error('elementId required')
  if (runningControllers.has(elementId)) {
    throw new Error(`element ${elementId} is already running`)
  }

  const controller = new AbortController()
  runningControllers.set(elementId, controller)

  const context = Object.assign({}, ctx || {}, { signal: controller.signal })

  console.debug('[nodeExecution] runExecutorForElement: start', { elementId, nodeId })
  emitter.emit('start', { elementId, nodeId })

  try {
    const maybe = executor(input, meta, context)
    // support sync or promise
    const result = await Promise.resolve(maybe)
    // if execution wasn't aborted during await
    if (!controller.signal.aborted) {
      runningControllers.delete(elementId)
      emitter.emit('finish', { elementId, nodeId, result })
      console.debug('[nodeExecution] runExecutorForElement: finish', { elementId, nodeId, result })
    } else {
      // aborted
      emitter.emit('cancel', { elementId, nodeId })
      console.info('[nodeExecution] runExecutorForElement: canceled during await', { elementId, nodeId })
    }
    return result
  } catch (err) {
    runningControllers.delete(elementId)
    // emit error event
    emitter.emit('error', { elementId, nodeId, error: err })
    console.error('[nodeExecution] runExecutorForElement: error', { elementId, nodeId, error: err })
    throw err
  }
}

/**
 * Run an executor for an element and propagate the result to downstream elements.
 *
 * Parameters:
 * - getOutgoing: (elementId) => Array<{ fromPortId?: string; targetElementId: string; targetPortId?: string }>
 * - resolveTarget: (targetElementId) => { executor?: NodeExecutor, nodeId?: string, meta?: Record, input?: any } | null
 * - mapResultToInput: (resultOutput, resultPortId, fromElementId, toElementId, toPort?) => any
 *
 * This function protects against cycles by tracking a `visited` set.
 */
export async function runAndPropagate(
  elementId: string,
  nodeId: string | undefined,
  executor: NodeExecutor,
  input?: any,
  meta?: Record<string, any>,
  ctx?: Record<string, any>,
  getOutgoing?: (elId: string) => Array<{ fromPortId?: string; targetElementId: string; targetPortId?: string }> ,
  resolveTarget?: (targetElementId: string) => { executor?: NodeExecutor; nodeId?: string; meta?: Record<string, any>; input?: any } | null,
  mapResultToInput?: (resultOutput: any, resultPortId: string | undefined, fromElementId: string, toElementId: string, toPort?: string) => any,
  visited?: Set<string>
) {
  if (!visited) visited = new Set()
  if (visited.has(elementId)) return
  visited.add(elementId)

  console.debug('[nodeExecution] runAndPropagate: executing element', elementId, { nodeId })

  let resultRaw: any
  try {
    resultRaw = await runExecutorForElement(elementId, nodeId, executor, input, meta, ctx)
  } catch (err) {
    // executor error already emitted by runExecutorForElement; stop propagation on this branch
    return
  }
  // normalize result: if executor returns an object with { portId?, output? } use that convention
  const resultPortId = (resultRaw && typeof resultRaw === 'object' && ('portId' in resultRaw)) ? resultRaw.portId : undefined
  const resultOutput = (resultRaw && typeof resultRaw === 'object' && ('output' in resultRaw)) ? resultRaw.output : resultRaw

  if (!getOutgoing || !resolveTarget) return

  const outs = getOutgoing(elementId) || []
  for (const out of outs) {
    // only propagate if the outgoing's fromPortId matches the chosen resultPortId, or if resultPortId is undefined (no specific port chosen)
    if (resultPortId !== undefined && out.fromPortId !== undefined && out.fromPortId !== resultPortId) continue

    const target = resolveTarget(out.targetElementId)
    if (!target || !target.executor) continue
    if (visited.has(out.targetElementId)) {
      console.debug('[nodeExecution] runAndPropagate: skipping visited target', out.targetElementId, 'from', elementId)
      continue
    }

    const nextInput = mapResultToInput ? mapResultToInput(resultOutput, resultPortId, elementId, out.targetElementId, out.targetPortId) : resultOutput
    try {
      console.debug('[nodeExecution] runAndPropagate: propagating from', elementId, 'to', out.targetElementId, { fromPortId: out.fromPortId, toPortId: out.targetPortId })
      await runAndPropagate(out.targetElementId, target.nodeId, target.executor, nextInput, target.meta, ctx, getOutgoing, resolveTarget, mapResultToInput, visited)
    } catch (e) {
      // errors are already emitted by runExecutorForElement
      console.error('[nodeExecution] runAndPropagate: error propagating to', out.targetElementId, e)
    }
  }
}

// convenience subscription helpers
export function onStart(fn: Listener) { return emitter.on('start', fn) }
export function onFinish(fn: Listener) { return emitter.on('finish', fn) }
export function onError(fn: Listener) { return emitter.on('error', fn) }
export function onCancel(fn: Listener) { return emitter.on('cancel', fn) }

// small utilities for external inspection
export function listRunningElements() { return Array.from(runningControllers.keys()) }

/**
 * Example usage (in comments):
 *
 * import { runExecutorForElement, onStart, onFinish } from '@/lib/nodeExecution'
 *
 * onStart(({ elementId }) => setRunningId(elementId))
 * onFinish(({ elementId }) => setRunningId(null))
 *
 * // to run:
 * runExecutorForElement(elId, nodeId, executorFn, input, meta).then(...)
 */

export default {
  runExecutorForElement,
  stop,
  isRunning,
  listRunningElements,
  onStart,
  onFinish,
  onError,
  onCancel,
}
