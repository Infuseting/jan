// React import not required in modern JSX setups

import { portEnum, port as Port } from '@/containers/whiteboard/portTypes'

export type NodeProps = {
  id: string
  title?: string
  inputs?: Port[]
  outputs?: Port[]
  className?: string
  // optional: highlight a specific port (used to show which output was chosen)
  activePortId?: string | null
  activePortKind?: portEnum | null
  selected?: boolean
  onClick?: () => void
  children?: React.ReactNode
}

export default function NodeBase({ id, title = 'Node', inputs = [], outputs = [], className = '', activePortId = null, activePortKind = null, selected = false, onClick }: NodeProps) {
  return (
    <div
      data-node-id={id}
      onClick={onClick}
      className={`relative bg-main-view-fg/5 ${selected ? 'border-primary border' : 'border border-main-view-fg/10'} rounded-md p-3 shadow-sm inline-block ${className}`}
    >
      <div className="flex justify-between items-center w-40 h-40 cursor-pointer">
        <h1 className="text-md font-medium text-main-view-fg/80 text-center w-full ">{title}</h1>        
      </div>
        {inputs.length > 0 && (
          <>
            <div className="absolute left-0 top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none">
              {inputs.map((p, i) => {
                const isActiveInput = activePortKind === 'input' && activePortId === p.id
                return (
                  <div key={p.id || i} style={{ margin: 6, pointerEvents: 'auto' }}>
                    <div
                      data-node-id={id}
                      data-port-id={p.id}
                      data-port-kind="input"
                      className="flex items-center"
                      style={{ gap: 6 }}
                    >
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ background: isActiveInput ? '#10b981' : '#ffffff', border: '2px solid #fb923c' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* labels positioned outside the node box on the left */}
            <div className="absolute -left-14 top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none">
              {inputs.filter((p) => (p && (p.showLabel !== undefined ? p.showLabel : !!p.label))).map((p, i) => (
                <div key={(p.id || i) + '-label'} style={{ margin: 6 }}>
                  <span className="text-xs text-main-view-fg/80">{p.label || p.id}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {outputs.length > 0 && (
          <>
            <div className="absolute right-0 top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none">
              {outputs.map((p, i) => {
                const isActiveOutput = activePortKind === 'output' && activePortId === p.id
                return (
                  <div key={p.id || i} style={{ margin: 6, pointerEvents: 'auto' }}>
                    <div
                      data-node-id={id}
                      data-port-id={p.id}
                      data-port-kind="output"
                      className="flex items-center"
                      style={{ gap: 6 }}
                    >
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ background: isActiveOutput ? '#10b981' : '#ffffff', border: '2px solid #fb923c' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* labels positioned outside the node box on the right */}
            <div className="absolute -right-14 top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none">
              {outputs.filter((p) => (p && (p.showLabel !== undefined ? p.showLabel : !!p.label))).map((p, i) => (
                <div key={(p.id || i) + '-label'} style={{ margin: 6 }}>
                  <span className="text-xs text-main-view-fg/80">{p.label || p.id}</span>
                </div>
              ))}
            </div>
          </>
        )}
    </div>
  )
}
