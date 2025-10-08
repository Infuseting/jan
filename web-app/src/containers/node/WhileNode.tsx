import NodeBase from '@/containers/NodeBase'
import { IconRepeat } from '@tabler/icons-react'

export default function WhileNode({ id, selected }: { id: string; selected?: boolean }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="While"
      inputs={[{ id: 'cond', label: 'Condition' }]}
      outputs={[{ id: 'loop', label: 'Loop' }, { id: 'exit', label: 'Exit' }]}
    />
  )
}

export const nodeEntry = {
  id: 'while',
  title: 'While',
  type: 'note' as const,
  category: 'Control/Loop',
  component: WhileNode,
  config: null,
  display: { Icon: IconRepeat, title: 'While', description: 'Loop while a condition holds' },
}