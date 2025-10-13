import React from 'react'
import { IconHandGrab, IconPointer } from '@tabler/icons-react'

type ToolbarProps = {
  activeTool: string
  setActiveTool: (t: string) => void
}

export default function Toolbar({ activeTool, setActiveTool }: ToolbarProps) {
  const tools: { id: string; title: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'pointer', title: 'Pointer', Icon: IconPointer },
    { id: 'hand', title: 'Hand', Icon: IconHandGrab },
  ]

  return (
    <div className='fixed mx-auto left-0 right-0 bottom-2 w-max z-50 px-2 py-1 rounded-md bg-main-view-fg/6 text-main-view-fg text-sm select-none shadow-md flex items-center'>
      {tools.map((t, idx) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setActiveTool(t.id)}
            title={t.title}
            className={`p-2 rounded-md ${activeTool === t.id ? 'bg-main-view-fg/20' : 'hover:bg-main-view-fg/10'}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <t.Icon className="inline-block" />
          </button>
          {idx < tools.length - 1 && (
            <div style={{ height: 20, width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 8px' }} />
          )}
        </div>
      ))}
    </div>
  )
}
