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

// Basic sanitization for replaced expressions before eval.
// This is defensive — it rejects expressions that contain disallowed
// tokens or obvious code-execution patterns. It aims to allow property
// access, literals, operators and `new Date(...)` while blocking
// function definitions, calls (except Date constructor), imports,
// and access to dangerous globals.
function isExpressionSafe(replaced: string): boolean {
  if (!replaced || typeof replaced !== 'string') return false

  // Disallow backticks and template literal usage
  if (replaced.includes('`')) return false

  // Disallow block characters and array/object literals which could
  // be used to smuggle code: { } [ ]
  if (/[\{\}\[\]]/.test(replaced)) return false

  // Disallow semicolons and backslash which are often used to chain
  // or escape into other statements
  if (replaced.includes(';') || replaced.includes('\\')) return false

  // Disallow keywords that can access runtime or define functions
  const bannedKeywords = [
    'function', '=>', 'constructor', 'prototype', '__proto__', 'require', 'process', 'global', 'window', 'document', 'import', 'export', 'eval'
  ]
  for (const k of bannedKeywords) if (replaced.includes(k)) return false

  // Disallow suspicious use of `new` except for `new Date(...)`.
  if (/\bnew\b/.test(replaced) && !/\bnew\s+Date\s*\(/.test(replaced)) return false

  // Disallow function calls on identifiers/properties. Allow numeric and
  // boolean literals, string literals, operators and simple property access
  // like a.b.c or globalVar.prop
  // This is conservative: any parentheses that look like a call are rejected
  // unless they're the Date(...) after new which was handled above.
  if (/([a-zA-Z0-9_$\.])+\s*\(/.test(replaced)) return false

  // Allow only a restricted set of characters: alphanum, whitespace, quotes,
  // dots, parentheses (only for new Date which is checked), commas, math and
  // comparison operators, boolean operators and colon/question for ternary
  // Note: strings and numbers are already produced by literalFor.
  const allowedPattern = /^[0-9a-zA-Z_\s\.'"\$\.\(\)\+\-\*\/\%\!\=\<\>\&\|\?:,]*$/
  if (!allowedPattern.test(replaced)) return false

  return true
}

function safeEval(replaced: string) {
  if (!isExpressionSafe(replaced)) throw new Error('Unsafe expression')
  // eslint-disable-next-line no-eval
  return eval(replaced)
}

export function evaluateExpressionToBoolean(expr: string, sample: any = {}, meta: any = {}) {
  try {
    const replaced = replaceTokensForEval(expr, sample, meta)
    if (!replaced) return false
    // quick checks for trivial keywords
    if (replaced.includes('isTrue')) return true
    if (replaced.includes('isFalse')) return false
    const res = safeEval(replaced)
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
    return safeEval(replaced)
  } catch (e) {
    return undefined
  }
}
