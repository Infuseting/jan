import NodeBase from '@/containers/NodeBase'
import { portEnum } from '@/containers/whiteboard/portTypes'
import { IconMessageCircle } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'
import SmartInput from '@/containers/SmartInput'
import { useEffect, useState } from 'react'

export default function Node({ id, selected, activePortId, activePortKind }: { id: string; selected?: boolean; activePortId?: string | null; activePortKind?: import('@/containers/whiteboard/portTypes').portEnum | null }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="Print"
  inputs={[{ id: 'in', label: 'In', kind: portEnum.Input, showLabel: true }]}
  outputs={[{ id: 'out', label: 'Out', kind: portEnum.Output, showLabel: true }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

export async function execute(_input?: any, meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
  try {
    // allow meta.template to format output; otherwise just console.log the input
    const template = (meta && meta.template) || ''
    let output = _input
    if (template && typeof template === 'string') {
      // simple replacement of $input or $meta keys
      try {
        output = template.replace(/\$input/g, JSON.stringify(_input)).replace(/\$meta/g, JSON.stringify(meta || {}))
      } catch (e) { /* ignore */ }
    }
    console.info('[PrintNode]', { input: _input, meta, output })
    return { portId: 'out', output }
  } catch (e) {
    console.error('[PrintNode] execute error', e)
    throw e
  }
}

export function getNodeEntry() {
  return {
    id: 'print',
    title: 'Print',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'Utilities',
    component: Node,
    config: NodeConfig,
    execute: execute,
    display: { Icon: IconMessageCircle, title: 'Print', description: 'Log or format a value to console and forward it' },
  }
}

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const [template, setTemplate] = useState<string>((meta && (meta.template as string)) || '')
  useEffect(() => { if ((meta && (meta.template as string)) !== template) setTemplate((meta && (meta.template as string)) || '') }, [meta && meta.template])
  const apply = (next: Record<string, any>) => { try { setMeta({ ...(meta || {}), ...next }) } catch {} }
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Template</label>
      <SmartInput value={template} onChange={(v) => { setTemplate(v); apply({ template: v }) }} placeholder="Use $input and $meta" />
    </div>
  )
}
