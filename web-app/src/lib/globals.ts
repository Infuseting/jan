// Common global variables available to expression inputs
export type GlobalResolver = () => any

export const GLOBALS: Record<string, GlobalResolver> = {
  now: () => new Date(),
  today: () => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  },
  timestamp: () => Date.now(),
  // runtime accessor for nodes meta populated by the executor/runtime
  // Usage in expressions: $getNode.<elementId>.output or $getNode.<elementId>.meta
  getNode: () => {
    try {
      // prefer per-execution context if present
      const exec = (globalThis as any).__JAN_EXEC_CONTEXT__
      if (exec && exec.nodes) return Object.assign({}, exec.nodes)
      const store = (globalThis as any).__JAN_RUNTIME_NODES__ || {}
      // return a shallow copy so consumers won't accidentally mutate internal store
      return Object.assign({}, store)
    } catch { return undefined }
  },
  // last node meta produced by the executor (runtime-populated)
  lastNode: () => {
    try {
      const exec = (globalThis as any).__JAN_EXEC_CONTEXT__
      if (exec && exec.lastNode !== undefined) return exec.lastNode
      return (globalThis as any).__JAN_LAST_NODE__
    } catch { return undefined }
  },
}

export const GLOBAL_SUGGESTIONS: string[] = Object.keys(GLOBALS).map(k => `$${k}`)

export function resolveGlobal(name: string) {
  const key = name.startsWith('$') ? name.substring(1) : name
  const fn = GLOBALS[key]
  if (!fn) return undefined
  try { return fn() } catch { return undefined }
}
