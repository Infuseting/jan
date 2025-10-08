import NodeBase from '@/containers/NodeBase'
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