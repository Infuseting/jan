import NodeBase from '@/containers/NodeBase'
import { IconRepeat } from '@tabler/icons-react'

export default function ForNode({ id, selected }: { id: string; selected?: boolean }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="For"
      inputs={[{ id: 'cond', label: 'Condition' }]}
      outputs={[{ id: 'iter', label: 'Iter' }, { id: 'exit', label: 'Exit' }]}
    />
  )
}

export const nodeEntry = {
  id: 'for',
  title: 'For',
  type: 'note' as const,
  category: 'Control/Loop',
  component: ForNode,
  config: null,
  display: { Icon: IconRepeat, title: 'For', description: 'Iterate over a collection or range' },
}
