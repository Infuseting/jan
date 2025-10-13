import React from 'react'

type Conn = { from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }

type Props = {
  containerRef: React.RefObject<HTMLElement | null>
  connections: Conn[]
  connectingRef: { current: { fromNode: string; fromPort: string; toScreen?: { x: number; y: number } } | null }
}

export default function ConnectionsSVG({ containerRef, connections, connectingRef }: Props) {
  return (
    <svg className="absolute inset-0" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {connections.map((c, i) => {
        try {
          const fromEl = document.querySelector(`[data-node-id="${c.from.nodeId}"][data-port-id="${c.from.portId}"]`) as HTMLElement | null
          const toEl = document.querySelector(`[data-node-id="${c.to.nodeId}"][data-port-id="${c.to.portId}"]`) as HTMLElement | null
          if (!fromEl || !toEl) return null
          const crect = containerRef.current!.getBoundingClientRect()
          const frect = fromEl.getBoundingClientRect()
          const trect = toEl.getBoundingClientRect()
          // use screen coords relative to container (no transform)
          const fx = frect.left + frect.width / 2 - crect.left
          const fy = frect.top + frect.height / 2 - crect.top
          const tx = trect.left + trect.width / 2 - crect.left
          const ty = trect.top + trect.height / 2 - crect.top
          return <line key={i} x1={fx} y1={fy} x2={tx} y2={ty} stroke="#ffffff" strokeWidth={1} strokeOpacity={0.9} />
        } catch (err) { console.debug('connections render error', err); return null }
      })}
      {connectingRef.current && (() => {
        try {
          const cur = connectingRef.current
          if (!cur) return null
          const crect = containerRef.current!.getBoundingClientRect()
          const fromEl = document.querySelector(`[data-node-id="${cur.fromNode}"][data-port-id="${cur.fromPort}"]`) as HTMLElement | null
          if (!fromEl || !cur.toScreen) return null
          const frect = fromEl.getBoundingClientRect()
          const fx = frect.left + frect.width / 2 - crect.left
          const fy = frect.top + frect.height / 2 - crect.top
          const tx = cur.toScreen.x
          const ty = cur.toScreen.y
          return <line x1={fx} y1={fy} x2={tx} y2={ty} stroke="#0ea5e9" strokeDasharray="4 2" strokeWidth={1} />
        } catch (err) { console.debug('connecting preview render error', err); return null }
      })()}
    </svg>
  )
}
