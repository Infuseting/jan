import NodeBase from '@/containers/NodeBase'
import { useState } from 'react'
import { IconMessage } from '@tabler/icons-react'

export default function ThreadMessageTrigger({ id, meta, onMetaChange, selected }: { id: string; meta?: Record<string, any>; onMetaChange?: (m: Record<string, any>) => void; selected?: boolean }) {
  const [threadId, setThreadId] = useState<string>((meta && meta.threadId) || '')
  const [match, setMatch] = useState<string>((meta && meta.match) || '')
  return (
    <NodeBase id={id} selected={selected} title="Thread Message Trigger" inputs={[]} outputs={[{ id: 'out', label: 'Trigger' }]}>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <input value={threadId} onChange={(e) => { setThreadId(e.target.value); onMetaChange?.({ ...(meta || {}), threadId: e.target.value }) }} placeholder="Thread ID" style={{ flex: 1, padding: '6px 8px', borderRadius: 6 }} />
        <input value={match} onChange={(e) => { setMatch(e.target.value); onMetaChange?.({ ...(meta || {}), match: e.target.value }) }} placeholder="Match" style={{ flex: 1, padding: '6px 8px', borderRadius: 6 }} />
      </div>
    </NodeBase>
  )
}

export function ThreadMessageTriggerConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Thread ID</label>
      <input value={(meta && meta.threadId) || ''} onChange={(e) => setMeta({ ...(meta || {}), threadId: e.target.value })} className="p-2 rounded border" />
      <label className="text-sm font-medium">Match</label>
      <input value={(meta && meta.match) || ''} onChange={(e) => setMeta({ ...(meta || {}), match: e.target.value })} className="p-2 rounded border" />
    </div>
  )
}

export const nodeEntry = {
  id: 'thread_message',
  title: 'Thread Message Trigger',
  type: 'note' as const,
  category: 'Trigger',
  component: ThreadMessageTrigger,
  config: ThreadMessageTriggerConfig,
  defaultMeta: { threadId: '', match: '' },
  display: { Icon: IconMessage, title: 'Thread Message', description: 'Trigger when a thread message matches' },
}
