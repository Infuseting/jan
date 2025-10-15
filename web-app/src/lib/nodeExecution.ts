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

// currently running elementId (or compositeKey) -> AbortController
// compositeKey format: `${elementId}::${runKey}` when runKey provided in ctx
const runningControllers = new Map<string, AbortController>()

/**
 * Return true if the element is currently executing.
 */
export function isRunning(elementId: string, runKey?: string) {
  if (runKey) return runningControllers.has(`${elementId}::${runKey}`)
  // if no runKey provided, return true if any controller exists for elementId
  for (const k of runningControllers.keys()) {
    if (k === elementId || k.startsWith(elementId + '::')) return true
  }
  return false
}

/**
 * Stop/cancel execution for an element (if running). This triggers an abort
 * on the signal that will be passed to the executor (if it uses it).
 */
// stop by elementId and optional runKey. If runKey omitted, stop all runs for elementId.
export function stop(elementId: string, runKey?: string) {
  if (runKey) {
    const key = `${elementId}::${runKey}`
    const ctrl = runningControllers.get(key)
    if (!ctrl) return false
    try { ctrl.abort() } catch (e) { console.error('[nodeExecution] stop: abort error for', key, e) }
    runningControllers.delete(key)
    emitter.emit('cancel', { elementId })
    console.info('[nodeExecution] stop: emitted cancel for', key)
    return true
  }
  // stop all matching controllers for elementId
  let stopped = false
  for (const k of Array.from(runningControllers.keys())) {
    if (k === elementId || k.startsWith(elementId + '::')) {
      const ctrl = runningControllers.get(k)!
      try { ctrl.abort() } catch (e) { console.error('[nodeExecution] stop: abort error for', k, e) }
      runningControllers.delete(k)
      emitter.emit('cancel', { elementId })
      console.info('[nodeExecution] stop: emitted cancel for', k)
      stopped = true
    }
  }
  return stopped
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
  // allow multiple concurrent runs for same element if caller provides a runKey/runPath
  const runKey = ctx && (ctx.runPath || ctx.runKey || ctx.executionId || ctx.runId)
  const compositeKey = runKey ? `${elementId}::${runKey}` : elementId
  if (runningControllers.has(compositeKey)) {
    throw new Error(`element ${elementId} (run ${String(runKey)}) is already running`)
  }

  const controller = new AbortController()
  runningControllers.set(compositeKey, controller)

  // pass the controller signal and preserve any runKey/runPath in context
  const context = Object.assign({}, ctx || {}, { signal: controller.signal })

  console.debug('[nodeExecution] runExecutorForElement: start', { elementId, nodeId })
  emitter.emit('start', { elementId, nodeId })

  try {
    const maybe = executor(input, meta, context)
    // support sync or promise
    const result = await Promise.resolve(maybe)
    // if execution wasn't aborted during await
    if (!controller.signal.aborted) {
      runningControllers.delete(compositeKey)
      emitter.emit('finish', { elementId, nodeId, result })
      console.debug('[nodeExecution] runExecutorForElement: finish', { elementId, nodeId, result })
    } else {
      // aborted
      runningControllers.delete(compositeKey)
      emitter.emit('cancel', { elementId, nodeId })
      console.info('[nodeExecution] runExecutorForElement: canceled during await', { elementId, nodeId })
    }
    return result
  } catch (err) {
    runningControllers.delete(compositeKey)
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
  visited?: Set<string>,
  path?: string[]
) {
  if (!visited) visited = new Set()
  if (visited.has(elementId)) return
  visited.add(elementId)

  // maintain a path of element ids leading to this execution. This is used to
  // differentiate concurrent runs arriving at the same element from different
  // pre-paths. The path is added to ctx as `runPath` so downstream executors
  // and nodeExecution can use it to allow concurrent executions.
  if (!path) path = []
  const myPath = [...path, elementId]
  const runPathKey = myPath.join('>')
  const ctxWithPath = Object.assign({}, ctx || {}, { runPath: runPathKey })

  console.debug('[nodeExecution] runAndPropagate: executing element', elementId, { nodeId, runPathKey })

  let resultRaw: any
  try {
    resultRaw = await runExecutorForElement(elementId, nodeId, executor, input, meta, ctxWithPath)
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
      await runAndPropagate(out.targetElementId, target.nodeId, target.executor, nextInput, target.meta, ctxWithPath, getOutgoing, resolveTarget, mapResultToInput, visited, myPath)
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
