import NodeBase from '@/containers/NodeBase'
import { IconRepeat } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'

export default function Node({ id, selected, activePortId, activePortKind }: { id: string; selected?: boolean; activePortId?: string | null; activePortKind?: 'input' | 'output' | null }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="While"
      inputs={[{ id: 'cond', label: 'Condition' }]}
      outputs={[{ id: 'loop', label: 'Loop' }, { id: 'exit', label: 'Exit' }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

export function getNodeEntry() {
  return {
    id: 'while',
    title: 'While',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'Control/Loop',
    component: Node,
    config: null,
    display: { Icon: IconRepeat, title: 'While', description: 'Loop while a condition holds' },
  }
}