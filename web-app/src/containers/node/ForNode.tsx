import NodeBase from '@/containers/NodeBase'
import { portEnum } from '@/containers/whiteboard/portTypes'
import { IconRepeat } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'
import { evaluateExpression } from '@/lib/expression'
import SmartInput from '@/containers/SmartInput'
import { useEffect, useState } from 'react'

export default function Node({ id, selected, activePortId, activePortKind }: { id: string; selected?: boolean; activePortId?: string | null; activePortKind?: import('@/containers/whiteboard/portTypes').portEnum | null }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="For"
  // add a generic 'in' input alias so external nodes that target 'in' can connect
  inputs={[{ id: 'in', label: 'In', kind: portEnum.Input, showLabel: true }]}
  outputs={[{ id: 'iter', label: 'Iter', kind: portEnum.Output, showLabel: true }, { id: 'exit', label: 'Exit', kind: portEnum.Output, showLabel: true }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

  // executor for For node: if input (or configured sample) is an array, emit the first item
  // on port 'iter' with the remainder as 'rest'. If no items, emit 'exit'. This keeps
  // the node simple and lets the graph wiring feed the remaining items back into the
  // node to continue iteration.
  export async function execute(_input?: any, meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
    try {
  // default to range mode when meta.mode is not provided
  const mode = (meta && meta.mode) || 'range'
  // optional step for range mode
  const step = Number((meta && (meta.step !== undefined ? meta.step : 1)) || 1)
      // executors should be re-entrant and handle repeated runPath visits; limits
      // (if desired) are enforced by the orchestrator, not by the node itself.
      const sample = (meta && (meta.input || meta.sample)) || _input || {}

      // try to find an iterable: input array, sample.items, meta.items, or evaluate expr
          let iterable: any[] | undefined
          if (Array.isArray(_input)) iterable = _input
          else if (Array.isArray(sample)) iterable = sample
          else if (meta && Array.isArray((meta as any).items)) iterable = (meta as any).items
          else if (typeof sample === 'object' && Array.isArray((sample as any).items)) iterable = (sample as any).items
          // support mode: 'range' or 'array' (default to range when mode absent)
          else if (mode === 'range' || (meta && meta.mode === 'range')) {
            const s = Number((meta?.start) ?? 0)
            const e = Number((meta?.end) ?? 0)
            const st = Number((meta?.step) ?? step)
            if (!Number.isNaN(s) && !Number.isNaN(e) && !Number.isNaN(st) && st !== 0) {
              // compute count using step (inclusive of end when it fits the step sequence)
              const total = Math.floor((e - s) / Math.abs(st))
              const len = Math.max(0, total)
              iterable = Array.from({ length: len }, (_, i) => s + i * st)
            }
          } else if (meta && (meta.mode === 'array' || meta.expr)) {
            const exprStr = (meta && meta.expr) || ''
            if (exprStr && exprStr.trim()) {
              const res = evaluateExpression(exprStr, _input || {}, meta || {})
              if (Array.isArray(res)) iterable = res
            }
          }

      if (!iterable || iterable.length === 0) {
        return { portId: 'exit', output: { input: _input } }
      }

      const [first, ...rest] = iterable
      return { portId: 'iter', output: { item: first, rest } }
    } catch (e) {
      console.error('[ForNode] execute error', e)
      throw e
    }
  }

export function getNodeEntry() {
  return {
    id: 'for',
    title: 'For',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'Control/Loop',
    component: Node,
    config: NodeConfig,
    execute: execute,
    display: { Icon: IconRepeat, title: 'For', description: 'Iterate over a collection or range' },
  }
}

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const [mode, setMode] = useState<string>((meta && meta.mode) || 'range')
  const [start, setStart] = useState<string>((meta && meta.start) ? String(meta.start) : '0')
  const [end, setEnd] = useState<string>((meta && meta.end) ? String(meta.end) : '10')
  const [step, setStep] = useState<string>((meta && meta.step) ? String(meta.step) : '1')
  const [expr, setExpr] = useState<string>((meta && meta.expr) || '')

  useEffect(() => {
    if ((meta && meta.mode) !== mode) setMode((meta && meta.mode) || 'range')
    // keep local state in sync when meta changes externally
    if ((meta && String(meta.start)) !== start) setStart((meta && String(meta.start)) || '0')
    if ((meta && String(meta.end)) !== end) setEnd((meta && String(meta.end)) || '10')
  if ((meta && String(meta.step)) !== step) setStep((meta && String(meta.step)) || '1')
    if ((meta && meta.expr) !== expr) setExpr((meta && meta.expr) || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta && meta.mode, meta && meta.start, meta && meta.end, meta && meta.expr])

  const apply = (patch: Record<string, any>) => {
    try { setMeta({ ...(meta || {}), ...patch }) } catch {}
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button className={`px-2 py-1 rounded ${mode === 'range' ? 'bg-main-view-fg/10' : ''}`} onClick={() => { setMode('range'); apply({ mode: 'range' }) }}>Range</button>
        <button className={`px-2 py-1 rounded ${mode === 'array' ? 'bg-main-view-fg/10' : ''}`} onClick={() => { setMode('array'); apply({ mode: 'array' }) }}>Array / Expr</button>
      </div>
      {mode === 'range' ? (
        <div className="flex gap-2">
          <div style={{ flex: 1 }}>
            <label className="text-sm font-medium">Start</label>
            <SmartInput value={start} onChange={(v) => { setStart(v); apply({ start: v }) }} placeholder="e.g. 0" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="text-sm font-medium">End</label>
            <SmartInput value={end} onChange={(v) => { setEnd(v); apply({ end: v }) }} placeholder="e.g. 10" />
          </div>
        </div>
      ) : (
        <div>
          <label className="text-sm font-medium">Array expression</label>
          <SmartInput value={expr} onChange={(v) => { setExpr(v); apply({ expr: v }) }} placeholder="e.g. $input.items or [1,2,3]" />
        </div>
      )}
      
    </div>
  )
}
