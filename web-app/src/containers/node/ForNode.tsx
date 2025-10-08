import NodeBase from '@/containers/NodeBase'
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
