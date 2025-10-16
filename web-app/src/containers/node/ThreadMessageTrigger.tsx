import NodeBase from '@/containers/NodeBase'
import { portEnum } from '@/containers/whiteboard/portTypes'
import { useMemo, useState } from 'react'
import { IconMessage, IconCheck } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useThreadManagement } from '@/hooks/useThreadManagement'
import { useThreads } from '@/hooks/useThreads'

export default function Node({ id, meta, onMetaChange, selected, activePortId, activePortKind }: { id: string; meta?: Record<string, any>; onMetaChange?: (m: Record<string, any>) => void; selected?: boolean; activePortId?: string | null; activePortKind?: import('@/containers/whiteboard/portTypes').portEnum | null }) {
  const [selectedThreads, setSelectedThreads] = useState<string[]>((meta && meta.threadId) || [])
  const [selectedFolders, setSelectedFolders] = useState<string[]>((meta && meta.folders) || [])

  const { folders } = useThreadManagement()
  const threadsMap = useThreads((s) => s.threads)
  const allThreads = useMemo(() => Object.values(threadsMap || {}), [threadsMap])

  const threadsForDropdown = useMemo(() => {
    if (!selectedFolders || selectedFolders.length === 0) return allThreads
    const setIds = new Set(selectedFolders)
    return allThreads.filter((t: any) => setIds.has(t.metadata?.project?.id))
  }, [allThreads, selectedFolders])
  return (
  <NodeBase id={id} selected={selected} title="Thread Message Trigger" inputs={[]} outputs={[{ id: 'out', label: 'Trigger', kind: portEnum.Output, showLabel: true }]} activePortId={activePortId} activePortKind={activePortKind}>
      
    </NodeBase>
  )
}

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const { folders } = useThreadManagement()
  const threadsMap = useThreads((s) => s.threads)
  const allThreads = useMemo(() => Object.values(threadsMap || {}), [threadsMap])
  const selectedFolders: string[] = (meta && meta.folders) || []
  const threadsForDropdown = useMemo(() => {
    if (!selectedFolders || selectedFolders.length === 0) return allThreads
    const setIds = new Set(selectedFolders)
    return allThreads.filter((t: any) => setIds.has(t.metadata?.project?.id))
  }, [allThreads, selectedFolders])
  

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Projects</label>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="p-2 rounded border w-full text-left">{selectedFolders.length === 0 ? 'All projects' : `${selectedFolders.length} selected`}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" className="w-56 max-h-60 overflow-y-auto z-[95]">
            <DropdownMenuItem onSelect={(e: any) => { e.preventDefault(); setMeta({ ...(meta || {}), folders: [] }) }}>
              <div className="flex items-center justify-between w-full">
                <span className="truncate max-w-[220px]">Any Project</span>
              </div>
            </DropdownMenuItem>
            {folders && folders.map((f: any) => {
              const selected = selectedFolders.includes(f.id)
              return (
                <DropdownMenuItem key={f.id} onSelect={(e: any) => { e.preventDefault(); const next = selected ? selectedFolders.filter((id) => id !== f.id) : [...selectedFolders, f.id]; setMeta({ ...(meta || {}), folders: next }) }}>
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate max-w-[220px]">{f.name}</span>
                    {selected && <IconCheck size={14} className="text-main-view-fg/80" />}
                  </div>
                </DropdownMenuItem>
              )
            })}
            
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <label className="text-sm font-medium">Threads</label>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="p-2 rounded border w-full text-left">{(meta && meta.threadId && (meta.threadId as string[]).length > 0) ? `${(meta.threadId as string[]).length} selected` : 'All threads'}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" className="w-56 max-h-60 overflow-y-auto z-[95]">
            <DropdownMenuItem onSelect={(e: any) => { e.preventDefault(); setMeta({ ...(meta || {}), threadId: [] }) }}>
              <span className="truncate">Any Thread</span>
            </DropdownMenuItem>
            {threadsForDropdown.map((t: any) => {
              const selected = (meta && meta.threadId && Array.isArray(meta.threadId) && (meta.threadId as string[]).includes(t.id))
              return (
                <DropdownMenuItem key={t.id} onSelect={(e: any) => { e.preventDefault(); const prev: string[] = (meta && meta.threadId) || []; const next = prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]; setMeta({ ...(meta || {}), threadId: next }) }}>
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate max-w-[220px]">{t.title || t.metadata?.title || t.id}</span>
                    {selected && <IconCheck size={14} className="text-main-view-fg/80" />}
                  </div>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function getNodeEntry() {
  return {
    id: 'thread_message',
    title: 'Thread Message Trigger',
    nodeType: NodeType.Trigger,
    type: 'note' as const,
    category: 'Trigger',
    component: Node,
    config: NodeConfig,
    defaultMeta: { threadId: [], folders: [] },
    display: { Icon: IconMessage, title: 'Thread Message', description: 'Trigger when a thread message matches' },
    // runtime executor for this trigger node
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execute: async (input: any, meta: any, ctx: any) => {
      // reference meta/ctx to satisfy linters (no-op)
      void meta
      void ctx
      // dispatcher ensures only matching messages call this executor
      // simply return the message payload so downstream nodes receive it
      return { portId: 'out', output: { message: input?.message ?? null } }
    },
  }
}
