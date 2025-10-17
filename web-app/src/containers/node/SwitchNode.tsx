import NodeBase from '@/containers/NodeBase'
import { portEnum } from '@/containers/whiteboard/portTypes'
import { useState, useEffect } from 'react'
import SmartInput from '@/containers/SmartInput'
import { NodeType } from '@/lib/node'
import { IconArrowsLeftRight } from '@tabler/icons-react'
import { evaluateExpression } from '@/lib/expression'
import { resolveGlobal } from '@/lib/globals'

export default function Node({ id, meta, selected, activePortId, activePortKind }: { id: string; meta?: Record<string, any>; selected?: boolean; activePortId?: string | null; activePortKind?: import('@/containers/whiteboard/portTypes').portEnum | null }) {
  const cases: string[] = (meta && meta.cases) || []
  // build outputs based on cases so ports update when meta changes
  const outputs = cases.map((c, i) => ({ id: String(i), label: c || `case ${i}`, kind: portEnum.Output, showLabel: true }))
  // always include default fallback
  outputs.push({ id: 'default', label: 'Default', kind: portEnum.Output, showLabel: true })

  return (
    <NodeBase
      id={id}
      selected={selected}
      title="Switch"
      inputs={[{ id: 'in', label: 'Value', kind: portEnum.Input, showLabel: true }]}
      outputs={outputs}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const [cases, setCases] = useState<string[]>((meta && meta.cases) || [])
  const [valueExpr, setValueExpr] = useState<string>((meta && meta.value) || '')

  useEffect(() => {
    try { setCases((meta && meta.cases) || []) } catch {}
    try { setValueExpr((meta && meta.value) || '') } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta && meta.cases])

  const write = (next: Record<string, any>) => {
    try { setMeta({ ...(meta || {}), ...next }) } catch {}
  }

  const addCase = (v = '') => {
    const n = [...cases, v]
    setCases(n)
    write({ cases: n })
  }

  const updateCase = (idx: number, v: string) => {
    const n = [...cases]
    n[idx] = v
    setCases(n)
    write({ cases: n })
  }

  const removeCase = (idx: number) => {
    const n = cases.filter((_, i) => i !== idx)
    setCases(n)
    write({ cases: n })
  }

  return (
    <div className="flex flex-col gap-3" style={{ position: 'relative' }}>
      <label className="text-sm font-medium">Value to test</label>
      <SmartInput value={valueExpr} onChange={(v) => { setValueExpr(v); write({ value: v }) }} placeholder="$input.value or $meta.foo" suggestionsSource={[]} sample={{}} meta={{}} />

      <div className="flex items-center gap-2">
        <IconArrowsLeftRight size={16} className="text-main-view-fg/80" />
        <div className="text-sm font-medium">Switch cases (equality)</div>
      </div>

      <div className="flex flex-col gap-2">
        {cases.map((c, i) => (
          <div key={i} className="flex gap-2 items-start">
            <SmartInput value={c} onChange={(v) => updateCase(i, v)} suggestionsSource={[]} placeholder={`case ${i}`} sample={{}} meta={{}} />
            <button onClick={() => removeCase(i)} className="px-2 py-1 rounded bg-red-500 text-white">Remove</button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-2">
        <button onClick={() => addCase('')} className="px-3 py-1 rounded bg-main-view-fg/10">Add case</button>
      </div>

      <div className="mt-2">
        <div className="text-sm font-medium">Preview</div>
        <div className="mt-2 p-2 rounded border bg-main-view-fg/6">
          <div style={{ fontFamily: 'monospace' }}>
            {cases.length === 0 ? <div className="text-xs text-main-view-fg/50">No cases defined — only 'Default' output will be available</div> : (
              <div>
                {cases.map((c, i) => <div key={i}>{i}: {String(c)}</div>)}
                <div className="mt-1">default: (fallback)</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export async function execute(input?: any, meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
  const cases: string[] = (meta && meta.cases) || []
  const sample = (meta && (meta.input || meta.sample)) || input || {}
  const metaSample = meta || {}

  // helper for deep-ish equality: primitives by ===, objects/arrays via JSON.stringify fallback
  const equal = (a: any, b: any) => {
    if (a === b) return true
    if (a == null || b == null) return false
    const ta = typeof a
    const tb = typeof b
    if (ta !== tb) return String(a) === String(b)
    if (ta === 'object') {
      try {
        return JSON.stringify(a) === JSON.stringify(b)
      } catch (e) {
        return String(a) === String(b)
      }
    }
    return a === b
  }

  let valueToTest: any = input
  // helper to format value to JS literal suitable for eval/re-eval
  const literalFor = (val: any) => {
    if (val === null) return 'null'
    if (val === undefined) return 'undefined'
    if (val instanceof Date) return `new Date(${JSON.stringify(val.toISOString())})`
    if (typeof val === 'string') return JSON.stringify(val)
    try { return JSON.stringify(val) } catch { return JSON.stringify(String(val)) }
  }

  // replace $tokens (optionally followed by parentheses) with literals by resolving against sample/meta/globals
  const replaceDollarTokens = (exprStr: string) => {
    if (!exprStr || typeof exprStr !== 'string') return exprStr
    return exprStr.replace(/\$[a-zA-Z0-9_\.]+(?:\([^)]*\))?/g, (m: string) => {
      const tokenOnly = m.replace(/\([^)]*\)$/, '')
      const hasParens = /\([^)]*\)$/.test(m)
      const varName = tokenOnly.substring(1)
      const segs = varName.split('.')
      let baseVal: any = undefined
      try {
        if (segs[0] === 'input') baseVal = segs.slice(1).reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), sample)
        else if (segs[0] === 'meta') baseVal = segs.slice(1).reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), metaSample)
        else {
          baseVal = segs.reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), sample)
          if (baseVal === undefined) baseVal = segs.reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), metaSample)
          if (baseVal === undefined) baseVal = resolveGlobal(segs[0])
        }
      } catch {}

      // if last segment is a function call or callable property, call it
      if (segs.length > 1 && baseVal !== undefined) {
        const last = segs[segs.length - 1]
        try {
          const maybe = (baseVal as any)[last]
          if (typeof maybe === 'function') {
            try {
              const res = maybe.call(baseVal)
              return literalFor(res)
            } catch {}
          }
        } catch {}
      }

      // if parentheses were present but we couldn't call, attempt to evaluate the token expression by using evaluateExpression on the token (safe for simple tokens)
      try {
        const ev = evaluateExpression(m, sample, metaSample)
        if (ev !== undefined) return literalFor(ev)
      } catch {}

      // fallback: resolve tokenOnly to a literal if possible
      const varName2 = tokenOnly.substring(1)
      const segs2 = varName2.split('.')
      let val: any = undefined
      if (segs2[0] === 'input') {
        val = segs2.slice(1).reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), sample)
      } else if (segs2[0] === 'meta') {
        val = segs2.slice(1).reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), metaSample)
      } else {
        val = segs2.reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), sample)
        if (val === undefined) val = segs2.reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), metaSample)
        if (val === undefined) {
          const g = resolveGlobal(segs2[0])
          if (g !== undefined) val = g
        }
      }
      if (val === undefined) return m
      return literalFor(val)
    })
  }

  try {
    const rawValExpr = (meta && meta.value) || ''
    if (rawValExpr) {
      const replaced = replaceDollarTokens(rawValExpr)
      const ev = evaluateExpression(replaced, sample, metaSample)
      if (ev !== undefined) valueToTest = ev
      else valueToTest = rawValExpr
    }
  } catch (e) {
    // ignore and fall back to input
  }

  try {
    for (let i = 0; i < cases.length; i++) {
      const caseExpr = cases[i]
      let caseVal: any = caseExpr
      try {
        const replacedCase = replaceDollarTokens(caseExpr)
        const ev = evaluateExpression(replacedCase, sample, metaSample)
        if (ev !== undefined) caseVal = ev
      } catch (e) {
        // ignore and use raw caseExpr
      }
      console.log('SwitchNode: comparing', valueToTest, 'to case', caseVal)
      if (equal(valueToTest, caseVal)) {
        return { portId: String(i), output: { matched: true, caseIndex: i, input, value: valueToTest } }
      }
    }
  } catch (e) {
    // on any error, fall through to default
  }

  return { portId: 'default', output: { matched: false, input, value: valueToTest } }
}

export function getNodeEntry() {
  return {
    id: 'switch',
    title: 'Switch',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'Control/Conditional',
    component: Node,
    config: NodeConfig,
    execute: execute,
    display: { Icon: IconArrowsLeftRight, title: 'Switch', description: 'Match input value to cases and route to matching output' },
  }
}
