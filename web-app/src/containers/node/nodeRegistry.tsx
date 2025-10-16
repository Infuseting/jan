import { getNodeEntry as getIfNodeEntry } from './IfNode'
import { getNodeEntry as getWhileNodeEntry } from './WhileNode'
import { getNodeEntry as getForNodeEntry } from './ForNode'
import { getNodeEntry as getDoWhileNodeEntry } from './DoWhileNode'
import { getNodeEntry as getCronNodeEntry } from './CronTrigger'
import { getNodeEntry as getThreadMessageNodeEntry } from './ThreadMessageTrigger'
import { getNodeEntry as getThreadCreatedNodeEntry } from './ThreadCreatedTrigger'
import { getNodeEntry as getManualNodeEntry } from './ManualTrigger'
import { getNodeEntry as getHttpRequestNodeEntry } from './HttpRequestNode'
import { getNodeEntry as getPrintNodeEntry } from './PrintNode'
import React from 'react'
import { NodeType } from '@/lib/node'

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
  // nodeType indicates whether this is a trigger or a regular node
  nodeType: NodeType
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
  // optional executor for preview/publish: (input, meta, context) => any | Promise<any>
  execute?: (input: any, meta?: Record<string, any>, context?: Record<string, any>) => any | Promise<any>
}

// Build registry from node-local entries. This keeps node metadata colocated with the node implementation.
// assemble registry by calling each node's factory which keeps component and config inside the node file
const registry: NodeEntry[] = [
  getIfNodeEntry(),
  getWhileNodeEntry(),
  getForNodeEntry(),
  getDoWhileNodeEntry(),
  getCronNodeEntry(),
  getThreadMessageNodeEntry(),
  getThreadCreatedNodeEntry(),
  getManualNodeEntry(),
  getHttpRequestNodeEntry(),
  getPrintNodeEntry(),
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
  if (e && e.config === null) return null
  return e && e.config ? e.config : DefaultConfig
}

export default nodeRegistry
