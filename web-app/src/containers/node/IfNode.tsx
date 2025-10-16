import NodeBase from '@/containers/NodeBase'
import { portEnum } from '@/containers/whiteboard/portTypes'
import { useState, useEffect } from 'react'
import SmartInput from '@/containers/SmartInput'
import { IconPlayerPlay } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'
import { GLOBAL_SUGGESTIONS, resolveGlobal } from '@/lib/globals'
import { evaluateExpression, replaceTokensForEval } from '@/lib/expression'

export default function Node({ id, selected, activePortId, activePortKind }: { id: string; selected?: boolean; activePortId?: string | null; activePortKind?: import('@/containers/whiteboard/portTypes').portEnum | null }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="If"
  inputs={[{ id: 'cond', label: 'Condition', kind: portEnum.Input, showLabel: true }]}
  outputs={[{ id: 'true', label: 'True', kind: portEnum.Output, showLabel: true }, { id: 'false', label: 'False', kind: portEnum.Output, showLabel: true }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

 

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const [expr, setExpr] = useState<string>((meta && meta.expr) || '')

  useEffect(() => {
    if ((meta && meta.expr) !== expr) setExpr((meta && meta.expr) || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta && meta.expr])

  const write = (next: string) => {
    setExpr(next)
    try { setMeta({ ...(meta || {}), expr: next }) } catch {}
  }

  // gather suggestion paths from provided meta/input/sample up to depth 3
  const gatherPaths = (obj: any, prefix = '', depth = 0, maxDepth = 3): string[] => {
    if (!obj || typeof obj !== 'object' || depth > maxDepth) return []
    const paths: string[] = []
    for (const k of Object.keys(obj)) {
      const val = obj[k]
      const p = prefix ? `${prefix}.${k}` : k
      paths.push(p)
      if (val && typeof val === 'object') {
        paths.push(...gatherPaths(val, p, depth + 1, maxDepth))
      }
    }
    return paths
  }

  const sample = (meta && (meta.input || meta.sample)) || {}
  const metaObj = meta || {}
  const suggestions = Array.from(new Set([...(gatherPaths(sample, 'input', 0, 2).map(p => `$${p}`)), ...(gatherPaths(metaObj, 'meta', 0, 2).map(p => `$${p}`)), ...GLOBAL_SUGGESTIONS]))



  // helper to render with $var substitution; returns array of { t: string, known: boolean, kind: string, raw?: any }
  const renderPreviewParts = () => {
    const inputSample = sample
    const metaSample = metaObj
    const text = expr || ''

    const parts: Array<{ t: string; known: boolean; kind?: string; raw?: any }> = []

    const formatValue = (val: any) => {
      if (val instanceof Date) return { text: val.toISOString(), kind: 'date' }
      if (val === null) return { text: 'null', kind: 'null' }
      if (val === undefined) return { text: 'undefined', kind: 'undefined' }
      if (typeof val === 'string') return { text: JSON.stringify(val), kind: 'string' }
      if (typeof val === 'number') return { text: String(val), kind: 'number' }
      if (typeof val === 'boolean') return { text: String(val), kind: 'boolean' }
      // objects and arrays -> pretty printed JSON
      try {
        const json = JSON.stringify(val, null, 2)
        return { text: json, kind: 'object' }
      } catch (e) {
        return { text: String(val), kind: 'unknown' }
      }
    }

    // Try evaluating the whole expression first. If it evaluates to a value, show
    // the raw expression followed by the evaluated result. This helps for expressions
    // like `$now.getMinutes() % 2 === 0` where token-level rendering alone misses the computed result.
    try {
      const whole = evaluateExpression(text, inputSample, metaSample)
      // debug: show evaluation inputs/outputs
      // eslint-disable-next-line no-console
      console.debug('[IfNode.preview] expr=', text, 'sample=', inputSample, 'meta=', metaSample, 'eval=', whole)
      if (whole !== undefined) {
        const formattedWhole = formatValue(whole)
        return [{ t: text + ' ', known: true, kind: 'text' }, { t: formattedWhole.text, known: true, kind: formattedWhole.kind, raw: whole }]
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.debug('[IfNode.preview] full-eval failed for expr=', text, 'err=', e)
      // fall through to token-level rendering
    }

    // split on $var occurrences
    const re = /\$[a-zA-Z0-9_\.]+/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const idx = m.index
      if (idx > lastIndex) parts.push({ t: text.substring(lastIndex, idx), known: true, kind: 'text' })
      const varName = m[0].substring(1)
      const segs = varName.split('.')
      let val: any = undefined
      if (segs[0] === 'input') {
        val = segs.slice(1).reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), inputSample)
      } else if (segs[0] === 'meta') {
        val = segs.slice(1).reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), metaSample)
      } else {
        // fallback: try input then meta then global; also support property access like $now.getMinutes()
        val = segs.reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), inputSample)
        if (val === undefined) val = segs.reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), metaSample)
        if (val === undefined) {
          // try to evaluate the whole token as an expression using globals (handles $now.getMinutes())
          try {
            // If the token is followed by '(', include the parentheses to evaluate the function call
            const rest = text.substring(idx + m[0].length)
            let exprToEval = m[0]
            let parenPart = ''
            if (rest.startsWith('(')) {
              // find matching closing paren
              let depth = 0
              let i = 0
              for (; i < rest.length; i++) {
                const ch = rest[i]
                if (ch === '(') depth++
                else if (ch === ')') {
                  depth--
                  if (depth === 0) { i++; break }
                }
              }
              parenPart = rest.substring(0, i)
              exprToEval = m[0] + parenPart
            }
            const evalRes = evaluateExpression(exprToEval, inputSample, metaSample)
              // debug: token-level eval attempt
              // eslint-disable-next-line no-console
              console.debug('[IfNode.preview.token] token=', m[0], 'exprToEval=', exprToEval, 'evalRes=', evalRes)
              if (evalRes !== undefined) {
                val = evalRes
              // if we consumed a parenPart, advance lastIndex accordingly so it isn't output as raw text
              if (parenPart) {
                lastIndex = idx + m[0].length + parenPart.length
                // continue to next iteration without pushing unknown token text
                parts.push({ t: formatValue(val).text, known: true, kind: formatValue(val).kind, raw: val })
                continue
              }
            } else {
              const g = resolveGlobal(segs[0])
              if (g !== undefined) val = g
            }
          } catch (err) {
            const g = resolveGlobal(segs[0])
            if (g !== undefined) val = g
          }
        }
      }
      const known = val !== undefined && val !== null
      if (known) {
        const formatted = formatValue(val)
        parts.push({ t: formatted.text, known: true, kind: formatted.kind, raw: val })
      } else {
        // unknown variable: show the literal token
        parts.push({ t: m[0], known: false, kind: 'unknown' })
      }
      lastIndex = idx + m[0].length
    }
    if (lastIndex < text.length) parts.push({ t: text.substring(lastIndex), known: true, kind: 'text' })
    return parts
  }

  const parts = renderPreviewParts()

  
  // reuse the existing inputRef for DOM access; SmartInput will manage suggestions

  return (
    <div className="flex flex-col gap-3" style={{ position: 'relative' }}>
      <label className="text-sm font-medium">Expression</label>
      <SmartInput
        value={expr}
        onChange={(v) => write(v)}
        suggestionsSource={suggestions}
        placeholder="e.g. Hello $user.name, got $input.count items"
        sample={sample}
        meta={metaObj}
      />

      <div>
        <div className="text-sm font-medium">Preview</div>
        <div className="mt-2 p-2 rounded border bg-main-view-fg/6">
          {parts.map((p, i) => {
            // objects/arrays -> render as inline pre/code with preserved whitespace
            if (p.kind === 'object') {
              return (
                <code
                  key={i}
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                    background: p.known ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                    color: 'inherit',
                    padding: '2px 6px',
                    borderRadius: 6,
                    margin: '0 2px'
                  }}
                >{p.t}</code>
              )
            }
            // strings already JSON.stringify-ed (includes quotes)
            const color = p.known ? '#10b981' : '#ef4444'
            return (
              <span key={i} style={{ color }}>{p.t}</span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// simple executor for the If node: evaluates the expression against the input (meta.input or provided input)
// and returns the chosen port id ('true' or 'false') along with the output payload.
export async function execute(input?: any, meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
  // expression stored in meta.expr; simple support for $var substitution using input object
  const expr = (meta && meta.expr) || ''
  let truthy = false
  try {
    if (!expr) {
      // if no expression, determine truthiness of input directly
      truthy = !!input
    } else {
      // Evaluate expression consistently using the shared helper which replaces tokens
      const sample = (meta && (meta.input || meta.sample)) || input || {}
      const metaSample = meta || {}
      // special keywords handling preserved
      if (expr.includes('isTrue') || expr.includes('isFalse')) {
        truthy = expr.includes('isTrue')
      } else {
        const res = evaluateExpression(expr, sample, metaSample)
        try {
          const replaced = replaceTokensForEval(expr, sample, metaSample)
          // eslint-disable-next-line no-console
          console.debug('[IfNode.execute] expr=', expr, 'replaced=', replaced, 'res=', res, 'type=', typeof res)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.debug('[IfNode.execute] expr=', expr, 'res=', res, 'type=', typeof res, 'replaceErr=', e)
        }
        truthy = Boolean(res)
      }
    }
  } catch (e) {
    truthy = false
  }

  const portId = truthy ? 'true' : 'false'
  return { portId, output: { matched: truthy, input } }
}

// node metadata exported so the registry can be assembled from each node file
export function getNodeEntry() {
  return {
    id: 'if',
    title: 'If',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'Control/Conditional',
    component: Node,
    config: NodeConfig,
    execute: execute,
    display: { Icon: IconPlayerPlay, title: 'If', description: 'Branch when a condition is true/false' },
  }
}
