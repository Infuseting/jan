import { nodeEntry as ifNodeEntry } from './IfNode'
import { nodeEntry as whileNodeEntry } from './WhileNode'
import { nodeEntry as forNodeEntry } from './ForNode'
import { nodeEntry as cronNodeEntry } from './CronTrigger'
import { nodeEntry as threadMessageNodeEntry } from './ThreadMessageTrigger'
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
  // optional display metadata used by the UI (icon, short description)
  display?: {
    Icon?: React.ComponentType<any>
    title?: string
    description?: string
  }
}

// Build registry from node-local entries. This keeps node metadata colocated with the node implementation.
// the per-node files now export a full `nodeEntry` (including component & config)
const registry: NodeEntry[] = [ifNodeEntry, whileNodeEntry, forNodeEntry, cronNodeEntry, threadMessageNodeEntry]

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
