// Common global variables available to expression inputs
export type GlobalResolver = () => any

export const GLOBALS: Record<string, GlobalResolver> = {
  now: () => new Date(),
  today: () => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  },
  timestamp: () => Date.now(),
}

export const GLOBAL_SUGGESTIONS: string[] = Object.keys(GLOBALS).map(k => `$${k}`)

export function resolveGlobal(name: string) {
  const key = name.startsWith('$') ? name.substring(1) : name
  const fn = GLOBALS[key]
  if (!fn) return undefined
  try { return fn() } catch { return undefined }
}
