import NodeBase from '@/containers/NodeBase'
import { portEnum } from '@/containers/whiteboard/portTypes'
import { useState } from 'react'
import { IconPointer } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'

export default function Node({ id, meta, onMetaChange, selected, activePortId, activePortKind }: { id: string; meta?: Record<string, any>; onMetaChange?: (m: Record<string, any>) => void; selected?: boolean; activePortId?: string | null; activePortKind?: import('@/containers/whiteboard/portTypes').portEnum | null }) {
  const [threadId, setThreadId] = useState<string>((meta && meta.threadId) || '')
  const [match, setMatch] = useState<string>((meta && meta.match) || '')
  return (
  <NodeBase id={id} selected={selected} title="Manual Trigger" inputs={[]} outputs={[{ id: 'out', label: 'Trigger', kind: portEnum.Output, showLabel: true }]} activePortId={activePortId} activePortKind={activePortKind}>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <input value={threadId} onChange={(e) => { setThreadId(e.target.value); onMetaChange?.({ ...(meta || {}), threadId: e.target.value }) }} placeholder="Thread ID" style={{ flex: 1, padding: '6px 8px', borderRadius: 6 }} />
        <input value={match} onChange={(e) => { setMatch(e.target.value); onMetaChange?.({ ...(meta || {}), match: e.target.value }) }} placeholder="Match" style={{ flex: 1, padding: '6px 8px', borderRadius: 6 }} />
      </div>
    </NodeBase>
  )
}
async function execute(_input?: any, _meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
  // simple manual trigger executor — return the 'out' port so propagation continues
  // include useful info in output so downstream nodes can consume it
  try {
    return { portId: 'out', output: { success: true, input: _input, meta: _meta } }
  } catch (e) {
    // surface errors
    console.error('[ManualTrigger] execute error', e)
    throw e
  }
}
export function getNodeEntry() {
  return {
    id: 'manual',
    title: 'Manual Trigger',
    nodeType: NodeType.Trigger,
    type: 'note' as const,
    category: 'Trigger',
    component: Node,
    config: null,
    execute: execute,
    display: { Icon: IconPointer, title: 'Manual Trigger', description: 'Trigger when left click on IT' },
  }
}
