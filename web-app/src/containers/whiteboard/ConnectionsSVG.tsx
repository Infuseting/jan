import React, { useState } from 'react'
import { createPortal } from 'react-dom'

type Conn = { from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }

type Props = {
  containerRef: React.RefObject<HTMLElement | null>
  connections: Conn[]
  connectingRef: { current: { fromNode: string; fromPort: string; toScreen?: { x: number; y: number } } | null }
  onDeleteConnection?: (c: Conn) => void
}

export default function ConnectionsSVG({ containerRef, connections, connectingRef, onDeleteConnection }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const deleteControls: React.ReactNode[] = []
  return (
    // svg must NOT block pointer events so underlying port dragging still works; lines are non-interactive
    <>
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
          const mx = (fx + tx) / 2
          const my = (fy + ty) / 2
          // render the non-interactive line inside the svg
          const lineEl = (
            <line key={`line-${i}`} x1={fx} y1={fy} x2={tx} y2={ty} stroke="#ffffff" strokeWidth={1} strokeOpacity={0.9} style={{ pointerEvents: 'none' }} />
          )
          // prepare a portal control for the delete button positioned at midpoint (screen coords)
          const pageX = crect.left + mx
          const pageY = crect.top + my
          const control = createPortal(
            <div
              key={`ctrl-${i}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); if (onDeleteConnection) onDeleteConnection(c) }}
              style={{
                position: 'absolute',
                left: pageX,
                top: pageY,
                transform: 'translate(-50%, -50%)',
                // place above nodes (z ~50) but below dialogs (z >=80)
                zIndex: 70,
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: 12,
                background: hovered === i ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
                cursor: 'pointer'
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1={6} y1={6} x2={18} y2={18} stroke={hovered === i ? '#ef4444' : '#ffffff'} strokeWidth={1.5} strokeLinecap="round" />
                <line x1={6} y1={18} x2={18} y2={6} stroke={hovered === i ? '#ef4444' : '#ffffff'} strokeWidth={1.5} strokeLinecap="round" />
              </svg>
            </div>,
            document.body
          )
          deleteControls.push(control)
          return lineEl
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
          return <line x1={fx} y1={fy} x2={tx} y2={ty} stroke="#0ea5e9" strokeDasharray="4 2" strokeWidth={1} style={{ pointerEvents: 'none' }} />
        } catch (err) { console.debug('connecting preview render error', err); return null }
      })()}
      </svg>
      {deleteControls}
    </>
  )
}
