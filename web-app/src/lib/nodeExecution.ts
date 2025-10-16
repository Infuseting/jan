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
): Promise<{ portId?: string; output?: any } | undefined> {
  if (!visited) visited = new Set()
  // use a composite visited key that includes the elementId and the current runPath
  // this allows revisiting the same element on a different runPath (intended for loops)
  const currentPath = path || []
  const myPathForKey = [...currentPath, elementId]
  const runPathKeyForVisited = myPathForKey.join('>')
  const visitedKey = `${elementId}::${runPathKeyForVisited}`
  if (visited.has(visitedKey)) {
    console.debug('[nodeExecution] runAndPropagate: already visited', { visitedKey })
    return
  }
  visited.add(visitedKey)
  try {
    // small debug snapshot (do not stringify huge sets)
    const sample = Array.from(visited).slice(-10)
    console.debug('[nodeExecution] runAndPropagate: add visited', { visitedKey, recentVisited: sample })
  } catch {}

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

  console.debug('[nodeExecution] runAndPropagate: initial result', { elementId, resultPortId, resultOutput })

  if (!getOutgoing || !resolveTarget) return

  const outs = getOutgoing(elementId) || []
  const loopPorts = new Set(['loop', 'iter'])

  // If the initial result is loop-like, delegate propagation to the orchestrator
  if (resultPortId && loopPorts.has(resultPortId)) {
    try {
      const orchestratorResult = await orchestrateLoop(resultPortId, resultOutput)
      // return the orchestrator final result to the caller so upstream can react to 'exit'
      return orchestratorResult
    } catch (err) {
      console.error('[nodeExecution] runAndPropagate: orchestrateLoop error for', elementId, err)
      return
    }
  }
  for (const out of outs) {
    // only propagate if the outgoing's fromPortId matches the chosen resultPortId, or if resultPortId is undefined (no specific port chosen)
    if (resultPortId !== undefined && out.fromPortId !== undefined && out.fromPortId !== resultPortId) continue

    const target = resolveTarget(out.targetElementId)
    if (!target || !target.executor) continue
    // compute the visited key for the target when it would be invoked on this path
    const targetPath = [...myPath, out.targetElementId]
    const targetVisitedKey = `${out.targetElementId}::${targetPath.join('>')}`
    const isAncestor = myPath.includes(out.targetElementId)
    // debug decision info
    if (isAncestor) {
      console.debug('[nodeExecution] runAndPropagate: target is ancestor, allowing propagation', { from: elementId, to: out.targetElementId, myPath, targetVisitedKey })
    } else if (visited.has(targetVisitedKey)) {
      console.debug('[nodeExecution] runAndPropagate: skipping visited target', { from: elementId, to: out.targetElementId, targetVisitedKey })
      continue
    } else {
      console.debug('[nodeExecution] runAndPropagate: target not visited, will propagate', { from: elementId, to: out.targetElementId, targetVisitedKey })
    }

    const nextInput = mapResultToInput ? mapResultToInput(resultOutput, resultPortId, elementId, out.targetElementId, out.targetPortId) : resultOutput
    try {
      console.debug('[nodeExecution] runAndPropagate: propagating from', elementId, 'to', out.targetElementId, { fromPortId: out.fromPortId, toPortId: out.targetPortId })
      const childResult = await runAndPropagate(out.targetElementId, target.nodeId, target.executor, nextInput, target.meta, ctxWithPath, getOutgoing, resolveTarget, mapResultToInput, visited, myPath)
      // If the child returned a meaningful result (for example an 'exit' from an orchestrated loop), bubble it up
      if (childResult && typeof childResult === 'object' && ('portId' in childResult)) {
        console.debug('[nodeExecution] runAndPropagate: bubbling child result up', { from: out.targetElementId, childResult })
        try {
          // Treat the child's returned port as if *this* element returned it: propagate via our outs that match the portId
          const crPort = childResult.portId
          const crOutput = childResult.output
          const matchingOuts = getOutgoing ? getOutgoing(elementId).filter((o) => o.fromPortId === crPort) : []
          if (matchingOuts.length > 0) {
            console.debug('[nodeExecution] runAndPropagate: propagating bubbled result from current element', { elementId, crPort, matchingOuts })
            const visitedForBubbled = new Set<string>()
            const bubbledPath = [...myPath, `${elementId}#bubbled`]
            for (const mo of matchingOuts) {
              const tgt = resolveTarget(mo.targetElementId)
              if (!tgt || !tgt.executor) continue
              const nextInputB = mapResultToInput ? mapResultToInput(crOutput, crPort, elementId, mo.targetElementId, mo.targetPortId) : crOutput
              try {
                const childRes = await runAndPropagate(mo.targetElementId, tgt.nodeId, tgt.executor, nextInputB, tgt.meta, ctxWithPath, getOutgoing, resolveTarget, mapResultToInput, visitedForBubbled, bubbledPath)
                if (childRes && typeof childRes === 'object' && ('portId' in childRes)) {
                  // if further bubbling occurs down this path, bubble up that final result immediately
                  console.debug('[nodeExecution] runAndPropagate: bubbled downstream returned result, passing up', { childRes })
                  return childRes
                }
              } catch (e) { console.error('[nodeExecution] runAndPropagate: error propagating bubbled result to', mo.targetElementId, e) }
            }
          }
        } catch (e) { console.error('[nodeExecution] runAndPropagate: error while bubbling child result', e) }
        return childResult
      }
    } catch (e) {
      // errors are already emitted by runExecutorForElement
      console.error('[nodeExecution] runAndPropagate: error propagating to', out.targetElementId, e)
    }
  }

  // Return this element's normalized result so upstream callers receive the executor's choice
  return resultPortId ? { portId: resultPortId, output: resultOutput } : undefined

  // Helper: orchestrate loop-like nodes safely by sequential iterations.
  async function orchestrateLoop(initialPort: string | undefined, initialOutput: any) {
    const loopPorts = new Set(['loop', 'iter'])
    if (!initialPort || !loopPorts.has(initialPort)) return
  // proceed with orchestrating iterations even if no 'exit' outgoing is defined;
  // downstream consumers may only be interested in the 'iter' outputs.
    // derive a reasonable max iteration count:
    // 1) prefer explicit meta.maxIterations / meta.maxLoop when provided
    // 2) if node meta indicates a range, compute exact count from start/end/step
    // 3) if initialOutput contains a `rest` array (ForNode), use its length + 1
    // 4) otherwise fall back to 1000
    const defaultMax = 1000
    let maxIter = defaultMax
    if (meta && (meta.maxIterations || meta.maxLoop)) {
      maxIter = Number(meta.maxIterations || meta.maxLoop) || defaultMax
    } else {
      try {
        // derive from meta.range when possible
        if (meta && meta.mode === 'range') {
          const s = Number((meta.start ?? 0))
          const e = Number((meta.end ?? 0))
          const st = Number((meta.step ?? 1)) || 1
          if (!Number.isNaN(s) && !Number.isNaN(e) && st !== 0) {
            const total = Math.floor((e - s) / Math.abs(st)) + 1
            if (total > 0) maxIter = Math.max(0, total)
          }
        }
        // prefer to use the remaining-rest length if provided by the node's initial output
        if (initialOutput && typeof initialOutput === 'object' && Array.isArray((initialOutput as any).rest)) {
          const remaining = ((initialOutput as any).rest.length || 0) + 1
          if (remaining > 0) maxIter = Math.min(maxIter || defaultMax, remaining)
        }
      } catch (e) { /* ignore and fallback to defaultMax */ }
    }
    let iter = 0
    let lastOutput = initialOutput
    let lastPort = initialPort

  console.debug('[nodeExecution] orchestrateLoop: start', { elementId, initialPort, maxIter })
  // First, propagate the initial loop output to downstream loop targets
    try {
      const initialLoopOuts = getOutgoing ? getOutgoing(elementId).filter((o) => o.fromPortId === initialPort) : []
      if (initialLoopOuts.length > 0) {
        console.debug('[nodeExecution] orchestrateLoop: initialLoopOuts', { initialLoopOuts })
        const visitedForInitial = new Set<string>()
        const pathForInitial = [...myPath, `${elementId}#iter0`]
        for (const out0 of initialLoopOuts) {
          if (!resolveTarget) continue
          const t0 = resolveTarget(out0.targetElementId)
          if (!t0 || !t0.executor) continue
          const nextInput0 = mapResultToInput ? mapResultToInput(initialOutput, initialPort, elementId, out0.targetElementId, out0.targetPortId) : initialOutput
          try {
            console.debug('[nodeExecution] orchestrateLoop: propagating initial loop output to', out0.targetElementId, { nextInput0, runPath: `${runPathKey}>${elementId}` })
            await runAndPropagate(out0.targetElementId, t0.nodeId, t0.executor, nextInput0, t0.meta, Object.assign({}, ctx || {}, { runPath: `${runPathKey}>${elementId}` }), getOutgoing, resolveTarget, mapResultToInput, visitedForInitial, pathForInitial)
            console.debug('[nodeExecution] orchestrateLoop: propagated initial to', out0.targetElementId)
          } catch (e) {
            console.error('[nodeExecution] orchestrateLoop: error propagating initial loop output to', out0.targetElementId, e)
          }
        }
      }
  } catch (e) { console.error('[nodeExecution] orchestrateLoop: initial propagation error', e) }

    // small helper to yield to the event loop so long orchestrations don't block the UI
    const yieldToEventLoop = () => new Promise((res) => setTimeout(res, 0))

    // maintain an iterative runPath that appends the elementId each iteration so executors
    // that count occurrences of the element in runPath can detect repeated visits
    let iterRunPath = runPathKey
  while (iter < maxIter) {
      iter++
      // append one more occurrence of the elementId for this iteration
      iterRunPath = `${iterRunPath}>${elementId}`
      const ctxIter = Object.assign({}, ctx || {}, { runPath: iterRunPath })

      // Determine input for re-evaluation: allow mapResultToInput to map previous output back to node input
      const reevalInput = mapResultToInput ? mapResultToInput(lastOutput, lastPort, elementId, elementId, undefined) : input

      let resultRawIter: any
      try {
        console.debug('[nodeExecution] orchestrateLoop: re-eval', { iter, runPath: ctxIter.runPath, reevalInput })
        const metaIter = Object.assign({}, meta || {}, { sample: reevalInput, input: reevalInput })
        resultRawIter = await runExecutorForElement(elementId, nodeId, executor, reevalInput, metaIter, ctxIter)
        console.debug('[nodeExecution] orchestrateLoop: re-eval result', { iter, resultRawIter })
      } catch (err) {
        console.error('[nodeExecution] orchestrateLoop: executor error on re-eval', elementId, err)
        break
      }

      const resultPortIter = (resultRawIter && typeof resultRawIter === 'object' && ('portId' in resultRawIter)) ? resultRawIter.portId : undefined
      const resultOutputIter = (resultRawIter && typeof resultRawIter === 'object' && ('output' in resultRawIter)) ? resultRawIter.output : resultRawIter

      // if still loop-like, propagate loop outs for this iteration
      if (resultPortIter && loopPorts.has(resultPortIter)) {
  const loopOuts = getOutgoing ? getOutgoing(elementId).filter((o) => o.fromPortId === resultPortIter) : []
        // use a fresh visited set for propagation of this iteration to avoid interfering with other paths
        const visitedForIteration = new Set<string>()
  const iterPathForPropagation = [...myPath, elementId, `iter${iter}`]
        console.debug('[nodeExecution] orchestrateLoop: propagating loop iteration', { iter, loopOuts })
        for (const out2 of loopOuts) {
          if (!resolveTarget) continue
          const target2 = resolveTarget(out2.targetElementId)
          if (!target2 || !target2.executor) continue
          const nextInput2 = mapResultToInput ? mapResultToInput(resultOutputIter, resultPortIter, elementId, out2.targetElementId, out2.targetPortId) : resultOutputIter
          try {
            await runAndPropagate(out2.targetElementId, target2.nodeId, target2.executor, nextInput2, target2.meta, ctxIter, getOutgoing, resolveTarget, mapResultToInput, visitedForIteration, iterPathForPropagation)
          } catch (e) {
            console.error('[nodeExecution] orchestrateLoop: error propagating loop iteration to', out2.targetElementId, e)
          }
        }
        // set last output/port and continue to next iteration
        lastOutput = resultOutputIter
        lastPort = resultPortIter
        // yield to the event loop to keep the UI responsive between iterations
        try { await yieldToEventLoop() } catch {}
        continue
      }

  // if the node returned 'exit' or another non-loop port, propagate that and stop
  if (resultPortIter) {
  const exitOuts = getOutgoing ? getOutgoing(elementId).filter((o) => o.fromPortId === resultPortIter) : []
        const visitedForExit = new Set<string>()
  const exitPathForPropagation = [...myPath, elementId, `exit${iter}`]
        console.debug('[nodeExecution] orchestrateLoop: propagating exit', { iter, exitOuts })
        for (const out3 of exitOuts) {
          if (!resolveTarget) continue
          const target3 = resolveTarget(out3.targetElementId)
          if (!target3 || !target3.executor) continue
          const nextInput3 = mapResultToInput ? mapResultToInput(resultOutputIter, resultPortIter, elementId, out3.targetElementId, out3.targetPortId) : resultOutputIter
          try {
            await runAndPropagate(out3.targetElementId, target3.nodeId, target3.executor, nextInput3, target3.meta, ctxIter, getOutgoing, resolveTarget, mapResultToInput, visitedForExit, exitPathForPropagation)
          } catch (e) {
            console.error('[nodeExecution] orchestrateLoop: error propagating exit to', out3.targetElementId, e)
          }
        }
      }
      // stop after propagating exit
      // yield once before finishing to allow UI to update
      try { await yieldToEventLoop() } catch {}
      // return the final result to caller (so upstream can see the exit)
      return { portId: resultPortIter, output: resultOutputIter }
    }

    if (iter >= maxIter) console.warn('[nodeExecution] orchestrateLoop: reached max iterations for', elementId, 'max=', maxIter)
    if (iter >= maxIter) {
      // propagate a forced exit to downstream 'exit' outs so upstream callers see an exit
      try {
        const errOutput = { error: 'iteration limit reached', count: iter, maxIter }
  const exitOuts = getOutgoing ? getOutgoing(elementId).filter((o) => o.fromPortId === 'exit') : []
        if (exitOuts.length > 0) {
          console.debug('[nodeExecution] orchestrateLoop: propagating forced exit after maxIter', { elementId, iter, maxIter, exitOuts })
          const visitedForExit = new Set<string>()
          const exitPathForPropagation = [...myPath, elementId, `exit_max${iter}`]
          for (const outX of exitOuts) {
            if (!resolveTarget) continue
            const tX = resolveTarget(outX.targetElementId)
            if (!tX || !tX.executor) continue
            const nextInputX = mapResultToInput ? mapResultToInput(errOutput, 'exit', elementId, outX.targetElementId, outX.targetPortId) : errOutput
            try {
              await runAndPropagate(outX.targetElementId, tX.nodeId, tX.executor, nextInputX, tX.meta, Object.assign({}, ctx || {}, { runPath: `${runPathKey}>${elementId}` }), getOutgoing, resolveTarget, mapResultToInput, visitedForExit, exitPathForPropagation)
            } catch (e) { console.error('[nodeExecution] orchestrateLoop: error propagating forced exit to', outX.targetElementId, e) }
          }
        }
        return { portId: 'exit', output: errOutput }
      } catch (e) { console.error('[nodeExecution] orchestrateLoop: forced exit propagation error', e) }
    }
  }

  // If initial result was loop-like and there's an exit, start orchestrator
  try {
    await orchestrateLoop(resultPortId, resultOutput)
  } catch (err) {
    console.error('[nodeExecution] runAndPropagate: orchestrateLoop error for', elementId, err)
  }

    // no structured loop handling here — propagation already invoked loop branch above
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
