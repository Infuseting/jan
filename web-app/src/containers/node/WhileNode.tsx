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
      title="While"
  inputs={[{ id: 'in', label: 'In', kind: portEnum.Input, showLabel: true }]}
  outputs={[{ id: 'loop', label: 'Loop', kind: portEnum.Output, showLabel: true }, { id: 'exit', label: 'Exit', kind: portEnum.Output, showLabel: true }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

  // executor for While node: evaluate meta.expr or input to boolean, if true emit 'loop' otherwise 'exit'
  export async function execute(_input?: any, meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
    try {
        const expr = (meta && meta.expr) || ''
        const maxIter = Number((meta && (meta.maxIterations || meta.maxLoop)) || 10000)
        const runPath = _context && _context.runPath
        if (runPath) {
          const parts = String(runPath).split('>')
          const cur = parts[parts.length - 1]
          const count = parts.filter((p) => p === cur).length
          if (count > maxIter) {
            console.warn('[WhileNode] iteration limit exceeded for', cur, 'count=', count, 'max=', maxIter)
            return { portId: 'exit', output: { error: 'iteration limit exceeded', count, maxIter } }
          }
        }
      const sample = (meta && (meta.input || meta.sample)) || _input || {}
      let truthy = false
      if (!expr) {
        truthy = !!_input
      } else {
        const res = evaluateExpression(expr, sample, meta || {})
        truthy = Boolean(res)
      }
      const portId = truthy ? 'loop' : 'exit'
      return { portId, output: { matched: truthy, input: _input } }
    } catch (e) {
      console.error('[WhileNode] execute error', e)
      throw e
    }
  }

export function getNodeEntry() {
  return {
    id: 'while',
    title: 'While',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'Control/Loop',
    component: Node,
    config: NodeConfig,
    execute: execute,
    display: { Icon: IconRepeat, title: 'While', description: 'Loop while a condition holds' },
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