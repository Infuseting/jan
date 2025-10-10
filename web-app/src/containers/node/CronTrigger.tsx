import NodeBase from '@/containers/NodeBase'
import { useState, useEffect } from 'react'
import { IconClock } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'

function encodeCronForUrl(cron: string) {
  // crontab.guru expects spaces replaced by underscores in the fragment, but
  // encodeURIComponent is safer for other characters.
  return encodeURIComponent(cron.replace(/\s+/g, '_'))
}

export default function Node({ id, meta, selected, activePortId, activePortKind }: { id: string; meta?: Record<string, any>; onMetaChange?: (m: Record<string, any>) => void; selected?: boolean; activePortId?: string | null; activePortKind?: 'input' | 'output' | null }) {
  const initial = (meta && meta.cron) || '0 * * * *'
  const [cron, setCron] = useState<string>(initial)

  // keep local cron in sync when meta.cron changes externally (dialog save)
  useEffect(() => {
    const m = (meta && meta.cron) || ''
    if (m !== cron) setCron(m)
  }, [meta?.cron])

  return (
    <NodeBase id={id} selected={selected} title="Cron Trigger" inputs={[]} outputs={[{ id: 'out', label: 'Trigger' }]} activePortId={activePortId} activePortKind={activePortKind} />
  )
}
export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const current = (meta && meta.cron) || ''
  const [local, setLocal] = useState<string>(current)
  useEffect(() => {
    if (current !== local) setLocal(current)
  }, [current])
  return (
    <div>
      <label className="text-sm font-medium">Expression cron</label>
      <input
        className="mt-2 w-full p-2 rounded border"
        value={local}
        onChange={(e) => {
          const v = e.target.value
          setLocal(v)
          setMeta({ ...(meta || {}), cron: v })
        }}
      />
      <div className={`mt-2 text-sm`}>
        <a href={`https://crontab.guru/#${encodeCronForUrl(local)}`} target="_blank" rel="noopener noreferrer" className="underline">
          Voir la documentation
        </a>
      </div>
    </div>
  )
}

export function getNodeEntry() {
  return {
    id: 'cron',
    title: 'Cron Trigger',
    nodeType: NodeType.Trigger,
    type: 'note' as const,
    category: 'Trigger',
    component: Node,
    config: NodeConfig,
    // executor: when cron fires, this executor will be called by the runtime
    execute: async (_input: any, meta?: Record<string, any>) => {
      // Cron trigger simply returns the 'out' port selection so propagation happens
      return { portId: 'out', output: { firedAt: Date.now(), meta } }
    },
    defaultMeta: { cron: '0 * * * *' },
    display: { Icon: IconClock, title: 'Cron Trigger', description: 'Trigger on a cron schedule' },
  }
}
