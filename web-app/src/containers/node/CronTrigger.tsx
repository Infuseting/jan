import NodeBase from '@/containers/NodeBase'
import { useState, useEffect } from 'react'

function encodeCronForUrl(cron: string) {
  // crontab.guru expects spaces replaced by underscores in the fragment, but
  // encodeURIComponent is safer for other characters.
  return encodeURIComponent(cron.replace(/\s+/g, '_'))
}

export default function CronTrigger({ id, meta, selected }: { id: string; meta?: Record<string, any>; onMetaChange?: (m: Record<string, any>) => void; selected?: boolean }) {
  const initial = (meta && meta.cron) || '0 * * * *'
  const [cron, setCron] = useState<string>(initial)

  // keep local cron in sync when meta.cron changes externally (dialog save)
  useEffect(() => {
    const m = (meta && meta.cron) || ''
    if (m !== cron) setCron(m)
  }, [meta?.cron])

  return (
    <NodeBase id={id} selected={selected} title="Cron Trigger" inputs={[]} outputs={[{ id: 'out', label: 'Trigger' }]} />
  )
}
export function CronTriggerConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
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
