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
      title="Do While"
  // provide generic 'in' input to allow upstream connections
  inputs={[{ id: 'in', label: 'In', kind: portEnum.Input, showLabel: true }]}
  outputs={[{ id: 'loop', label: 'Loop', kind: portEnum.Output, showLabel: true }, { id: 'exit', label: 'Exit', kind: portEnum.Output, showLabel: true }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

// executor for DoWhile node: always emit 'loop' at least once; when called with context.runPath indicating
// subsequent iterations, evaluate condition and emit 'loop' or 'exit'. This keeps semantics simple for graph wiring.
export async function execute(_input?: any, meta?: Record<string, any>, context?: { [k: string]: any; signal?: AbortSignal }) {
  try {
    const expr = (meta && meta.expr) || ''
    const maxIter = Number((meta && (meta.maxIterations || meta.maxLoop)) || 10000)
    const runPathVal = context && context.runPath
    if (runPathVal) {
      const parts = String(runPathVal).split('>')
      const cur = parts[parts.length - 1]
      const count = parts.filter((p) => p === cur).length
      if (count > maxIter) {
        console.warn('[DoWhileNode] iteration limit exceeded for', cur, 'count=', count, 'max=', maxIter)
        return { portId: 'exit', output: { error: 'iteration limit exceeded', count, maxIter } }
      }
    }
    const sample = (meta && (meta.input || meta.sample)) || _input || {}

    // If no expr, consider truthiness of input for subsequent iterations.
    // If runPath indicates this is not the first invocation, evaluate; otherwise always loop once.
    const runPath = context && context.runPath
    // determine how many times this node appears in the runPath; if <=1 it's the first visit
    let truthy = true
    if (runPath) {
      const parts = String(runPath).split('>')
      const cur = parts[parts.length - 1]
      const visitCount = parts.filter((p) => p === cur).length
      if (visitCount <= 1) {
        // first invocation -> always loop once
        truthy = true
      } else {
        console.log(expr);
        // subsequent invocations -> evaluate condition or truthiness of input
        if (expr) {
          const res = evaluateExpression(expr, sample, meta || {})
          truthy = Boolean(res)
        } else {
          truthy = !!_input
        }
      }
      console.log(truthy);
    } else {
      // no runPath provided: fallback to evaluating (still ensure at least one loop)
      if (expr) {
        const res = evaluateExpression(expr, sample, meta || {})
        truthy = Boolean(res)
      } else {
        truthy = !!_input
      }
    }

    const portId = truthy ? 'loop' : 'exit'
    return { portId, output: { matched: truthy, input: _input } }
  } catch (e) {
    console.error('[DoWhileNode] execute error', e)
    throw e
  }
}

export function getNodeEntry() {
  return {
    id: 'doWhile',
    title: 'Do While',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'Control/Loop',
    component: Node,
    config: NodeConfig,
    execute: execute,
    display: { Icon: IconRepeat, title: 'Do While', description: 'Run once then loop while condition holds' },
  }
}

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const [expr, setExpr] = useState<string>((meta && meta.expr) || '')
  useEffect(() => { if ((meta && meta.expr) !== expr) setExpr((meta && meta.expr) || '') }, [meta && meta.expr])
  const apply = (next: Record<string, any>) => { try { setMeta({ ...(meta || {}), ...next }) } catch {} }
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Condition expression</label>
      <SmartInput value={expr} onChange={(v) => { setExpr(v); apply({ expr: v }) }} placeholder="e.g. $input.count > 0 or $meta.keepLoop === true" />
    </div>
  )
}
