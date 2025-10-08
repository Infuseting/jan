import IfNode, { IfNodeConfig } from './IfNode'
import WhileNode from './WhileNode'
import ForNode from './ForNode'
import CronTrigger, { CronTriggerConfig } from './CronTrigger'
import ThreadMessageTrigger, { ThreadMessageTriggerConfig } from './ThreadMessageTrigger'
import React from 'react'

// default fallbacks
export const DefaultNode: React.FC<{ id: string; meta?: Record<string, any>; selected?: boolean; onMetaChange?: (m: Record<string, any>) => void }> = ({ id, selected }) => {
  return (
    <div style={{ padding: 8, borderRadius: 6, background: '#eee', border: selected ? '2px solid #fb923c' : '1px solid #ccc' }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>Node: {id}</div>
    </div>
  )
}

export const DefaultConfig: React.FC<{ meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }> = ({ meta, setMeta }) => {
  return (
    <div>
      <div className="text-sm font-medium">Configuration</div>
      <pre className="mt-2 text-xs">{JSON.stringify(meta || {}, null, 2)}</pre>
      <div className="mt-2">
        <button onClick={() => setMeta({})} className="px-3 py-1 rounded bg-main-view-fg/10">Reset</button>
      </div>
    </div>
  )
}

export type NodeEntry = {
  id: string
  title: string
  type: 'note' | 'shape' | 'other'
  category?: string
  component: React.ComponentType<any>
  config?: React.ComponentType<any> | null
  defaultMeta?: Record<string, any>
}

const registry: NodeEntry[] = [
  { id: 'if', title: 'If', type: 'note', category: 'Control/Conditional', component: IfNode, config: IfNodeConfig },
  { id: 'while', title: 'While', type: 'note', category: 'Control/Loop', component: WhileNode, config: null },
  { id: 'for', title: 'For', type: 'note', category: 'Control/Loop', component: ForNode, config: null },
  { id: 'cron', title: 'Cron Trigger', type: 'note', category: 'Trigger', component: CronTrigger, config: CronTriggerConfig, defaultMeta: { cron: '0 * * * *' } },
  { id: 'thread_message', title: 'Thread Message Trigger', type: 'note', category: 'Trigger', component: ThreadMessageTrigger, config: ThreadMessageTriggerConfig, defaultMeta: { threadId: '', match: '' } },
]

export const nodeRegistry = registry

export const nodeMap: Record<string, NodeEntry> = registry.reduce((acc, cur) => ({ ...acc, [cur.id]: cur }), {})

// helper to get component/config with fallbacks
export function getNodeComponent(id: string) {
  const e = nodeMap[id]
  return e && e.component ? e.component : DefaultNode
}

export function getNodeConfig(id: string) {
  const e = nodeMap[id]
  return e && e.config ? e.config : DefaultConfig
}

export default nodeRegistry
