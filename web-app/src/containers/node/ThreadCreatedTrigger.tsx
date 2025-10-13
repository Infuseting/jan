import NodeBase from '@/containers/NodeBase'
import { useState } from 'react'
import { IconPlus, IconCheck } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useThreadManagement } from '@/hooks/useThreadManagement'
import { useThreads } from '@/hooks/useThreads'

export default function Node({ id, meta, onMetaChange, selected, activePortId, activePortKind }: { id: string; meta?: Record<string, any>; onMetaChange?: (m: Record<string, any>) => void; selected?: boolean; activePortId?: string | null; activePortKind?: 'input' | 'output' | null }) {
  const [selectedFolders, setSelectedFolders] = useState<string[]>((meta && meta.folders) || [])

  const { folders } = useThreadManagement()
  useThreads((s) => s.threads) // ensure hook subscription, value not needed here

  return (
    <NodeBase id={id} selected={selected} title="Thread Created Trigger" inputs={[]} outputs={[{ id: 'out', label: 'Trigger' }]} activePortId={activePortId} activePortKind={activePortKind}>
      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex' }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="px-2 py-1 text-sm rounded-md border border-main-view-fg/10 hover:bg-main-view-fg/3" style={{ background: 'transparent' }}>
                {selectedFolders.length === 0 ? 'Projects' : `${selectedFolders.length} selected`}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" className="w-56 max-h-60 overflow-y-auto z-[95]">
              <DropdownMenuItem onSelect={(e: any) => { e.preventDefault(); setSelectedFolders([]); onMetaChange?.({ ...(meta || {}), folders: [] }) }}>
                <div className="flex items-center justify-between w-full">
                  <span className="truncate max-w-[220px]">Any Project</span>
                </div>
              </DropdownMenuItem>
              {folders && folders.map((f: any) => {
                const selected = selectedFolders.includes(f.id)
                return (
                  <DropdownMenuItem key={f.id} onSelect={(e: any) => {
                    e.preventDefault()
                    setSelectedFolders((prev) => {
                      const next = prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                      onMetaChange?.({ ...(meta || {}), folders: next })
                      return next
                    })
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      {selected && <IconCheck size={14} className="text-main-view-fg/80" />}
                    </div>
                  </DropdownMenuItem>
                )
              })}
              {selectedFolders.length > 0 && (
                <DropdownMenuItem onSelect={(e: any) => { e.preventDefault(); setSelectedFolders([]); onMetaChange?.({ ...(meta || {}), folders: [] }) }}>
                  <span className="text-sm text-main-view-fg/60">Clear</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div style={{ display: 'flex', flex: 1 }}>
          <div className="px-2 py-1 text-sm rounded-md border border-main-view-fg/10" style={{ width: '100%', textAlign: 'left' }}>
            Trigger when a new thread is created{selectedFolders.length > 0 ? ` in ${selectedFolders.length} project(s)` : ''}
          </div>
        </div>
      </div>
    </NodeBase>
  )
}

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const { folders } = useThreadManagement()
  const selectedFolders: string[] = (meta && meta.folders) || []

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
    </div>
  )
}

export function getNodeEntry() {
  return {
    id: 'thread_created',
    title: 'Thread Created Trigger',
    nodeType: NodeType.Trigger,
    type: 'note' as const,
    category: 'Trigger',
    component: Node,
    config: NodeConfig,
    defaultMeta: { folders: [] },
  display: { Icon: IconPlus, title: 'Thread Created', description: 'Trigger when a new thread is created' },
    // runtime executor for this trigger node
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execute: async (input: any, meta: any, ctx: any) => {
      void meta
      void ctx
      return { portId: 'out', output: { thread: input?.thread ?? null } }
    },
  }
}
