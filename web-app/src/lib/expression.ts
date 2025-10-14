import { resolveGlobal } from './globals'

function literalFor(val: any): string {
  if (val === null) return 'null'
  if (val === undefined) return 'undefined'
  if (val instanceof Date) return `new Date(${JSON.stringify(val.toISOString())})`
  if (typeof val === 'string') return JSON.stringify(val)
  try { return JSON.stringify(val) } catch { return JSON.stringify(String(val)) }
}

// Replace tokens like $input.x, $meta.y, $now or $now.prop with JS literals that can be eval'd.
export function replaceTokensForEval(expr: string, sample: any = {}, meta: any = {}) {
  if (!expr || typeof expr !== 'string') return ''
  const re = /\$[a-zA-Z0-9_\.]+/g
  return expr.replace(re, (m: string) => {
    const varName = m.substring(1)
    const segs = varName.split('.')
    // try full resolution against sample (input) and meta
    const tryResolve = (root: any, parts: string[]) => {
      let cur = root
      for (const p of parts) {
        if (cur == null) return undefined
        if (cur[p] === undefined) return undefined
        cur = cur[p]
      }
      return cur
    }

    // input path
    if (segs[0] === 'input') {
      const v = tryResolve(sample, segs.slice(1))
      if (v !== undefined) return literalFor(v)
      return 'undefined'
    }
    if (segs[0] === 'meta') {
      const v = tryResolve(meta, segs.slice(1))
      if (v !== undefined) return literalFor(v)
      return 'undefined'
    }

    // try direct resolve on sample/meta for full path
    let v = tryResolve(sample, segs)
    if (v !== undefined) return literalFor(v)
    v = tryResolve(meta, segs)
    if (v !== undefined) return literalFor(v)

    // otherwise, if base is a global, build literal for base and append remaining property access
    const base = segs[0]
    const g = resolveGlobal(base)
    if (g !== undefined) {
      const lit = literalFor(g)
      if (segs.length > 1) {
        // append .prop1.prop2 etc — safe as string concatenation
        const tail = segs.slice(1).join('.')
        return `${lit}.${tail}`
      }
      return lit
    }

    return 'undefined'
  })
}

export function evaluateExpressionToBoolean(expr: string, sample: any = {}, meta: any = {}) {
  try {
    const replaced = replaceTokensForEval(expr, sample, meta)
    if (!replaced) return false
    // quick checks for trivial keywords
    if (replaced.includes('isTrue')) return true
    if (replaced.includes('isFalse')) return false
    // eslint-disable-next-line no-eval
    const res = eval(replaced)
    return Boolean(res)
  } catch (e) {
    return false
  }
}

// Evaluate expression and return raw value (may be any JS type). Uses the same replacement rules.
export function evaluateExpression(expr: string, sample: any = {}, meta: any = {}) {
  try {
    const replaced = replaceTokensForEval(expr, sample, meta)
    if (!replaced) return undefined
    // eslint-disable-next-line no-eval
    return eval(replaced)
  } catch (e) {
    return undefined
  }
}
