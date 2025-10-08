import { useEffect, useRef, useState } from 'react'
import { nodeRegistry as centralNodeRegistry, getNodeComponent, getNodeConfig } from '@/containers/node/nodeRegistry'
import NodeConfigDialog from '@/containers/dialogs/NodeConfigDialog'
import { IconCursorOff, IconCursorText, IconHandGrab, IconMouse, IconPoint, IconPointer, IconPointerBolt, IconPointerCheck, IconPointerX, IconSelect } from '@tabler/icons-react';
// configs are provided by the node registry (nodeMap -> config)

type WhiteboardProps = { minScale?: number; maxScale?: number; initialScale?: number }
type BoardSnapshot = {
  elements: WBElement[]
  connections: Array<{ from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }>
  scale: number
  translate: { x: number; y: number }
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
type WBElementType = 'note' | 'shape' | 'image' | 'other'
type WBElement = { id: string; type: WBElementType; x: number; y: number; meta?: Record<string, any> }

export default function Whiteboard({ minScale = 0.1, maxScale = 10, initialScale = 1, ...rest }: WhiteboardProps & { builderId?: string; initialBoard?: BoardSnapshot | null; onRequestSave?: (s: BoardSnapshot) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [scale, setScale] = useState<number>(initialScale)
  const [translate, setTranslate] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const [elements, setElements] = useState<WBElement[]>([])
  const [placingMode] = useState(false)

  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null)
  const [cursorBoard, setCursorBoard] = useState<{ x: number; y: number } | null>(null)

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // active tool for the board (default: pointer)
  const [activeTool, setActiveTool] = useState<'pointer' | 'hand' | 'select' | 'text'>('pointer')

  const isPanning = useRef(false)
  const lastPanPos = useRef<{ x: number; y: number } | null>(null)

  const draggingIdsRef = useRef<string[] | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragStartPosMapRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const pointerDownRef = useRef<{
    id: string
    time: number
    startX: number
    startY: number
    selectionAtDown: string[]
    modifier: boolean
  } | null>(null)

  const rectSelectingRef = useRef(false)
  const rectStartRef = useRef<{ x: number; y: number } | null>(null)
  const potentialRectRef = useRef(false)
  const potentialRectStartRef = useRef<{ x: number; y: number } | null>(null)
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [connections, setConnections] = useState<Array<{ from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }>>([])
  const connectingRef = useRef<{ fromNode: string; fromPort: string; toScreen?: { x: number; y: number } } | null>(null)

  const BASE_CELL = 32

  const uid = () => `e_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`

  const updateElementMeta = (id: string, meta: Record<string, any>) => {
    pushHistory()
    setElements((arr) => arr.map((it) => (it.id === id ? { ...it, meta: { ...(it.meta || {}), ...(meta || {}) } } : it)))
  }

  // apply initialBoard when provided
  useEffect(() => {
    const ib = (rest as any).initialBoard as BoardSnapshot | undefined | null
    if (!ib) return
    setElements(ib.elements || [])
    setConnections(ib.connections || [])
    setScale(ib.scale || initialScale)
    setTranslate(ib.translate || { x: 0, y: 0 })
    // clear history on load
    historyRef.current.stack = []
  }, [(rest as any).initialBoard])

  // auto-save: debounce and call onRequestSave when elements/connections/scale/translate change
  useEffect(() => {
    const cb = (rest as any).onRequestSave as ((s: BoardSnapshot) => void) | undefined
    if (!cb) return
    const handle = setTimeout(() => {
      try {
        const snap: BoardSnapshot = { elements, connections, scale, translate }
        cb(snap)
      } catch {}
    }, 600)
    return () => clearTimeout(handle)
  }, [elements, connections, scale, translate, (rest as any).onRequestSave])
  const historyRef = useRef<{ stack: WBElement[][] }>({ stack: [] })
  const clipboardRef = useRef<WBElement[] | null>(null)

  const pushHistory = () => {
    try {
      const snap = elements.map((e) => ({ ...e }))
      historyRef.current.stack.push(snap)
      if (historyRef.current.stack.length > 100) historyRef.current.stack.shift()
    } catch {}
  }

  const undo = () => {
    const h = historyRef.current.stack
    if (h.length === 0) return
    const prev = h.pop()!
    setElements(prev.map((e) => ({ ...e })))
    setSelectedIds([])
  }

  const addElement = (type: WBElementType, x: number, y: number, meta?: Record<string, any>) => {
    pushHistory()
    setElements((s) => [...s, { id: uid(), type, x, y, meta }])
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const crect = el.getBoundingClientRect()
      const mouseX = e.clientX - crect.left
      const mouseY = e.clientY - crect.top
      const factor = Math.exp(-e.deltaY * 0.0015)
      setScale((prev) => {
        const newScaleRaw = clamp(prev * factor, minScale, maxScale)
        const newScale = Number(newScaleRaw.toFixed(6))
        setTranslate((t) => {
          const bx = (mouseX - t.x) / prev
          const by = (mouseY - t.y) / prev
          const nx = mouseX - bx * newScale
          const ny = mouseY - by * newScale
          return { x: nx, y: ny }
        })
        return newScale
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [minScale, maxScale, scale, translate.x, translate.y])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      if (activeTool === 'hand') {
        isPanning.current = true
        lastPanPos.current = { x: e.clientX, y: e.clientY }
        el.style.cursor = 'grabbing'
        return
      }

      // pointer tool (default): allow connecting, rectangle selection, and node interaction
      const crect = el.getBoundingClientRect()
      const sx = e.clientX - crect.left
      const sy = e.clientY - crect.top
      // determine click target: if user clicked on a node (or a port) we should let the node handle it;
      // otherwise treat as a board click (for deselect or rectangle selection)
      const targ = e.target as HTMLElement
      const portEl = targ.closest('[data-port-kind]') as HTMLElement | null
      const nodeEl = targ.closest('[data-node-id]') as HTMLElement | null

      // If clicked a port and it's an output, start connecting
      if (portEl) {
        const portKind = portEl.getAttribute('data-port-kind')
        const portId = portEl.getAttribute('data-port-id')
        const nodeId = portEl.getAttribute('data-node-id')
        if (portKind === 'output' && nodeId && portId) {
          connectingRef.current = { fromNode: nodeId, fromPort: portId, toScreen: { x: sx, y: sy } }
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          return
        }
      }

      const clickedOnNode = !!nodeEl

      // If pointer mode and clicked empty board area: deselect all and start potential rect selection
      if (!clickedOnNode && activeTool === 'pointer') {
        // immediate deselect when clicking empty space
        setSelectedIds([])
        if (!placingMode && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
          potentialRectRef.current = true
          potentialRectStartRef.current = { x: sx, y: sy }
          setSelectionRect({ x: sx, y: sy, w: 0, h: 0 })
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        }
        return
      }

      // If clicked on a node, do nothing here and allow the node's React onPointerDown to run
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!el) return
      try {
        const crect = el.getBoundingClientRect()
        const sx = e.clientX - crect.left
        const sy = e.clientY - crect.top
        setCursorScreen({ x: sx, y: sy })
      } catch {}

      // if in connecting mode, update preview end
      if (connectingRef.current) {
        const crect = el.getBoundingClientRect()
        const sx = e.clientX - crect.left
        const sy = e.clientY - crect.top
        connectingRef.current.toScreen = { x: sx, y: sy }
        // update cursor
        return
      }

      // if we had a potential rect selection, check threshold and convert to actual rectSelecting
      if (potentialRectRef.current) {
        const start = potentialRectStartRef.current
        if (start) {
          const crect = el.getBoundingClientRect()
          const sx = e.clientX - crect.left
          const sy = e.clientY - crect.top
          const moved = Math.hypot(sx - start.x, sy - start.y)
          const THRESH = 6
          if (moved > THRESH) {
            rectSelectingRef.current = true
            rectStartRef.current = start
            const x = Math.min(start.x, sx)
            const y = Math.min(start.y, sy)
            const w = Math.abs(sx - start.x)
            const h = Math.abs(sy - start.y)
            setSelectionRect({ x, y, w, h })
            potentialRectRef.current = false
            potentialRectStartRef.current = null
            return
          }
        }
      }

      // If pointerDown on an element was recorded, check if movement should start dragging
      if (pointerDownRef.current && !draggingIdsRef.current) {
        const pd = pointerDownRef.current
        const moved = Math.hypot(e.clientX - pd.startX, e.clientY - pd.startY)
        const MOVE_THRESH = 6
        if (moved > MOVE_THRESH) {
          // start dragging based on selection captured at pointerdown
          const sel = pd.selectionAtDown
          draggingIdsRef.current = sel
          dragStartRef.current = { x: pd.startX, y: pd.startY }
          const map: Record<string, { x: number; y: number }> = {}
          for (const id of sel) {
            const it = elements.find((ee) => ee.id === id)
            if (it) map[id] = { x: it.x, y: it.y }
          }
          dragStartPosMapRef.current = map
          // clear pointerDownRef to indicate we've begun dragging
          pointerDownRef.current = null
        }
      }

      if (rectSelectingRef.current) {
        const start = rectStartRef.current
        if (start) {
          const crect = el.getBoundingClientRect()
          const sx = e.clientX - crect.left
          const sy = e.clientY - crect.top
          const x = Math.min(start.x, sx)
          const y = Math.min(start.y, sy)
          const w = Math.abs(sx - start.x)
          const h = Math.abs(sy - start.y)
          setSelectionRect({ x, y, w, h })
        }
        return
      }

      if (draggingIdsRef.current && draggingIdsRef.current.length > 0) {
        const ids = [...draggingIdsRef.current]
        const start = dragStartRef.current
        const map = dragStartPosMapRef.current
        if (start && map) {
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          const dBX = dx / scale
          const dBY = dy / scale
          setElements((arr) => arr.map((it) => {
            if (!ids.includes(it.id)) return it
            const s = map[it.id]
            if (!s) return it
            return { ...it, x: s.x + dBX, y: s.y + dBY }
          }))
        }
        return
      }

      if (!isPanning.current) return
      if (!lastPanPos.current) return
      const dx = e.clientX - lastPanPos.current.x
      const dy = e.clientY - lastPanPos.current.y
      lastPanPos.current = { x: e.clientX, y: e.clientY }
      setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }))
    }

    const onPointerUp = (ev?: PointerEvent) => {
      // if we were connecting and released over an input port, create connection
      if (connectingRef.current && ev) {
        try {
          const targ = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
          const nodeId = targ?.getAttribute?.('data-node-id')
          const portId = targ?.getAttribute?.('data-port-id')
          const portKind = targ?.getAttribute?.('data-port-kind')
          if (nodeId && portId && portKind === 'input') {
            const cur = connectingRef.current
            if (cur) {
              pushHistory()
              setConnections((c) => [...c, { from: { nodeId: cur.fromNode, portId: cur.fromPort }, to: { nodeId, portId } }])
            }
          }
        } catch {}
        connectingRef.current = null
      }
      // If there was a pending pointerDown on an element and no drag started, treat as click
      if (pointerDownRef.current) {
        const pd = pointerDownRef.current
        // short press -> if no modifier, select only clicked element
        if (!pd.modifier) {
          setSelectedIds([pd.id])
        } else {
          // if modifier was used, keep the selectionAtDown (already set visually)
          setSelectedIds(pd.selectionAtDown)
        }
        // clear pending
        pointerDownRef.current = null
      }

      // if we had potential rect selection but no movement -> treat as click (clear selection)
      if (potentialRectRef.current) {
        potentialRectRef.current = false
        potentialRectStartRef.current = null
        setSelectionRect(null)
        setSelectedIds([])
      }

      if (rectSelectingRef.current) {
        rectSelectingRef.current = false
        const rect = selectionRect
        setSelectionRect(null)
        rectStartRef.current = null
        if (rect) {
          const x1 = (rect.x - translate.x) / scale
          const y1 = (rect.y - translate.y) / scale
          const x2 = (rect.x + rect.w - translate.x) / scale
          const y2 = (rect.y + rect.h - translate.y) / scale
          const bx1 = Math.min(x1, x2)
          const bx2 = Math.max(x1, x2)
          const by1 = Math.min(y1, y2)
          const by2 = Math.max(y1, y2)
          const hits = elements.filter((it) => it.x >= bx1 && it.x <= bx2 && it.y >= by1 && it.y <= by2).map((it) => it.id)
          setSelectedIds(hits)
        }
      }

  isPanning.current = false
  lastPanPos.current = null
  if (containerRef.current) containerRef.current.style.cursor = activeTool === 'hand' ? 'grab' : 'default'

      draggingIdsRef.current = null
      dragStartRef.current = null
      dragStartPosMapRef.current = null
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointerleave', () => setCursorScreen(null))

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointerleave', () => setCursorScreen(null))
    }
  }, [elements, placingMode, scale, translate.x, translate.y, selectionRect, activeTool])

  // sync container cursor with active tool selection
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    try {
      el.style.cursor = activeTool === 'hand' ? 'grab' : 'default'
    } catch {}
  }, [activeTool])

  useEffect(() => {
    if (!cursorScreen) {
      setCursorBoard(null)
      return
    }
    setCursorBoard({ x: (cursorScreen.x - translate.x) / scale, y: (cursorScreen.y - translate.y) / scale })
  }, [cursorScreen, translate.x, translate.y, scale])

  const gridSize = Math.max(8, BASE_CELL * scale)

  // --- Node palette (opened by right-click) ---
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteSearch, setPaletteSearch] = useState('')
  const [paletteClickBoard, setPaletteClickBoard] = useState<{ x: number; y: number } | null>(null)
  // node config dialog
  const [configNodeId, setConfigNodeId] = useState<string | null>(null)

  // use the centralized registry
  const nodeRegistry = centralNodeRegistry

  const openPaletteAt = (boardPos: { x: number; y: number }) => {
    if (activeTool === 'hand') return
    setPaletteClickBoard(boardPos)
    setPaletteSearch('')
    setPaletteOpen(true)
  }

  // handle global escape to close
  useEffect(() => {
    if (!paletteOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen])

  const insertNodeFromPalette = (node: { id: string; title: string; type?: WBElementType; defaultMeta?: Record<string, any> }) => {
    let pos = paletteClickBoard || cursorBoard
    if (!pos) {
      const el = containerRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const cx = rect.width / 2
        const cy = rect.height / 2
        pos = { x: (cx - translate.x) / scale, y: (cy - translate.y) / scale }
      } else {
        pos = { x: 0, y: 0 }
      }
    }
    const meta = node.defaultMeta ? { ...node.defaultMeta } : {}
    // remember the palette node id so we can render the proper Node component
    meta._nodeId = node.id
  addElement((node.type as WBElementType) || 'note', pos.x, pos.y, meta)
    setPaletteOpen(false)
  }

  // delete selected elements
  const deleteSelected = () => {
    if (selectedIds.length === 0) return
    pushHistory()
    setElements((arr) => arr.filter((it) => !selectedIds.includes(it.id)))
    setSelectedIds([])
  }

  // copy selected
  const copySelected = () => {
    if (selectedIds.length === 0) return
    const copied = elements.filter((it) => selectedIds.includes(it.id)).map((e) => ({ ...e }))
    clipboardRef.current = copied
  }

  // paste clipboard (offset slightly)
  const pasteClipboard = () => {
    const clip = clipboardRef.current
    if (!clip || clip.length === 0) return
    pushHistory()
    const offset = 16 / Math.max(0.1, scale)
    const base = cursorBoard || { x: 0, y: 0 }
  const pasted: WBElement[] = clip.map((c) => ({ id: uid(), type: c.type, x: base.x + (c.x - clip[0].x) + offset, y: base.y + (c.y - clip[0].y) + offset, meta: c.meta ? { ...c.meta } : undefined }))
    setElements((arr) => [...arr, ...pasted])
    setSelectedIds(pasted.map((p) => p.id))
  }

  // select all
  const selectAll = () => setSelectedIds(elements.map((e) => e.id))

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      // Undo: Ctrl+Z
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault(); undo(); return
      }
      // Select all: Ctrl+A
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault(); selectAll(); return
      }
      // Copy: Ctrl+C
      if (ctrl && e.key.toLowerCase() === 'c') {
        // avoid interfering when focus in an input
        const tag = (document.activeElement && (document.activeElement as HTMLElement).tagName) || ''
        if (tag.toLowerCase() === 'input' || tag.toLowerCase() === 'textarea') return
        e.preventDefault(); copySelected(); return
      }
      // Paste: Ctrl+V
      if (ctrl && e.key.toLowerCase() === 'v') {
        const tag = (document.activeElement && (document.activeElement as HTMLElement).tagName) || ''
        if (tag.toLowerCase() === 'input' || tag.toLowerCase() === 'textarea') return
        e.preventDefault(); pasteClipboard(); return
      }
      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // avoid interfering when focus in an input
        const tag = (document.activeElement && (document.activeElement as HTMLElement).tagName) || ''
        if (tag.toLowerCase() === 'input' || tag.toLowerCase() === 'textarea') return
        e.preventDefault(); deleteSelected(); return
      }
      if (e.key === 'Escape') {
        if (selectedIds.length > 0) {
          e.preventDefault(); setSelectedIds([]); return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [elements, selectedIds, cursorBoard, scale])

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      onContextMenu={(e) => {
        e.preventDefault()
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const bx = (sx - translate.x) / scale
        const by = (sy - translate.y) / scale
        openPaletteAt({ x: bx, y: by })
      }}
      style={{
        touchAction: 'none',
        backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${translate.x}px ${translate.y}px`,
      }}
    >
      <div className="absolute inset-0" style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, transformOrigin: '0 0', willChange: 'transform' }}>
        <div style={{ position: 'relative', width: 100000, height: 100000 }}>
          {/* connections SVG (render in board coordinates) */}
          <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {connections.map((c, i) => {
              // compute port centers
              try {
                const fromEl = document.querySelector(`[data-node-id=\"${c.from.nodeId}\"][data-port-id=\"${c.from.portId}\"]`) as HTMLElement | null
                const toEl = document.querySelector(`[data-node-id=\"${c.to.nodeId}\"][data-port-id=\"${c.to.portId}\"]`) as HTMLElement | null
                if (!fromEl || !toEl) return null
                const crect = containerRef.current!.getBoundingClientRect()
                const frect = fromEl.getBoundingClientRect()
                const trect = toEl.getBoundingClientRect()
                // convert screen to board coords
                const fx = (frect.left + frect.width / 2 - crect.left - translate.x) / scale
                const fy = (frect.top + frect.height / 2 - crect.top - translate.y) / scale
                const tx = (trect.left + trect.width / 2 - crect.left - translate.x) / scale
                const ty = (trect.top + trect.height / 2 - crect.top - translate.y) / scale
                return <line key={i} x1={fx} y1={fy} x2={tx} y2={ty} stroke="#ffffff" strokeWidth={0.2} />
              } catch { return null }
            })}
            {connectingRef.current && (() => {
              try {
                const cur = connectingRef.current
                if (!cur) return null
                const crect = containerRef.current!.getBoundingClientRect()
                const fromEl = document.querySelector(`[data-node-id="${cur.fromNode}"][data-port-id="${cur.fromPort}"]`) as HTMLElement | null
                if (!fromEl || !cur.toScreen) return null
                const frect = fromEl.getBoundingClientRect()
                const fx = (frect.left + frect.width / 2 - crect.left - translate.x) / scale
                const fy = (frect.top + frect.height / 2 - crect.top - translate.y) / scale
                const tx = (cur.toScreen.x - translate.x) / scale
                const ty = (cur.toScreen.y - translate.y) / scale
                return <line x1={fx} y1={fy} x2={tx} y2={ty} stroke="#0ea5e9" strokeDasharray="4 2" strokeWidth={0.02} />
              } catch { return null }
            })()}
          </svg>
          {elements.map((el) => {
            const isSelected = selectedIds.includes(el.id)
            const nodeId = el.meta && (el.meta as any)._nodeId
            const commonProps = {
              onPointerDown: (ev: any) => {
                if (activeTool !== 'pointer') {
                  return
                }
                ev.stopPropagation(); ev.preventDefault()
                const wasSelected = selectedIds.includes(el.id)
                let newSelection: string[]
                const modifier = !!(ev.shiftKey || ev.ctrlKey || ev.metaKey)
                if (modifier) {
                  newSelection = wasSelected ? selectedIds.filter((id) => id !== el.id) : [...selectedIds, el.id]
                } else {
                  if (wasSelected && selectedIds.length > 1) {
                    newSelection = selectedIds
                  } else {
                    newSelection = [el.id]
                  }
                }
                setSelectedIds(newSelection)
                pointerDownRef.current = { id: el.id, time: Date.now(), startX: ev.clientX, startY: ev.clientY, selectionAtDown: newSelection, modifier }
                ;(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId)
              },
              onDoubleClick: () => { if (activeTool === 'pointer') setConfigNodeId(el.id) },
              style: {
                position: 'absolute' as const, left: el.x, top: el.y, transform: 'translate(-50%, -50%)', pointerEvents: activeTool === 'hand' ? 'none' : 'auto', zIndex: isSelected ? 50 : undefined, cursor: activeTool === 'hand' ? 'default' : 'grab'
              }
            }

            // dynamic node rendering via registry (with fallback)
            if (nodeId) {
              const Comp: any = getNodeComponent(nodeId)
              return (
                <div key={el.id} {...commonProps as any}>
                  <Comp id={el.id} meta={el.meta} selected={isSelected} onMetaChange={(m: any) => updateElementMeta(el.id, m)} />
                </div>
              )
            }

            // default placeholder: square card with left inputs and right outputs
            return (
              <div
                {...commonProps}
                style={{
                  ...commonProps.style as any,
                  width: 120,
                  height: 120,
                  borderRadius: 8,
                  background: el.type === 'note' ? '#fff7c2' : el.type === 'shape' ? '#cce5ff' : '#f3f3f3',
                  border: isSelected ? '2px solid #fb923c' : '1px solid #fb923c',
                  boxShadow: isSelected ? '0 4px 14px rgba(251,146,60,0.12)' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'absolute'
                }}
              >
                {/* left: inputs indicator */}
                <div
                  data-node-id={el.id}
                  data-port-id="input-1"
                  data-port-kind="input"
                  style={{ position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'auto' }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#fff', border: '2px solid #fb923c' }} />
                </div>

                {/* right: outputs indicator */}
                <div
                  data-node-id={el.id}
                  data-port-id="output-1"
                  data-port-kind="output"
                  style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'auto' }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#fff', border: '2px solid #fb923c' }} />
                </div>

                {/* center text */}
                <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{el.type}</div>
                  <div style={{ fontSize: 11, color: '#444', marginTop: 6 }}>id: {el.id}</div>
                </div>
              </div>
            )
          })}
          <div style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
      {/* Toolbar: tools with divider between each item. IconPointer selected by default */}
      <div className='fixed mx-auto left-0 right-0 bottom-2 w-max z-50 px-2 py-1 rounded-md bg-main-view-fg/6 text-main-view-fg text-sm select-none shadow-md flex items-center'>
        {(() => {
          const tools: { id: string; title: string; Icon: any }[] = [
            { id: 'pointer', title: 'Pointer', Icon: IconPointer },
            { id: 'hand', title: 'Hand', Icon: IconHandGrab },
          ]

          return tools.map((t, idx) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setActiveTool(t.id as any)}
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
          ))
        })()}
      </div>
      <NodeConfigDialog
        open={!!configNodeId}
        onOpenChange={(o) => { if (!o) setConfigNodeId(null) }}
        nodeId={configNodeId}
        meta={configNodeId ? (elements.find((e) => e.id === configNodeId)?.meta || {}) : undefined}
        onSave={(m) => {
          if (!configNodeId) return
          updateElementMeta(configNodeId, m || {})
          setConfigNodeId(null)
        }}
      >
        {(meta: Record<string, any>, setMeta: (m: Record<string, any>) => void) => {
          const nodeId = configNodeId ? (elements.find((e) => e.id === configNodeId)?.meta as any)?._nodeId : null
          if (!nodeId) return null
          const ConfigComp: any = getNodeConfig(nodeId)
          return <ConfigComp meta={meta} setMeta={setMeta} />
        }}
      </NodeConfigDialog>

      {/* Palette panel (right side) */}
      {paletteOpen && (
        <div className="absolute top-16 right-4 z-60 w-80 bg-main-view-fg/6 text-main-view-fg rounded-md border border-main-view-fg/10 p-3 shadow-lg">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              value={paletteSearch}
              onChange={(e) => setPaletteSearch(e.target.value)}
              placeholder="Search nodes..."
              style={{ flex: 1, padding: '6px 8px', borderRadius: 6 }}
            />
            <button onClick={() => setPaletteOpen(false)} style={{ padding: '6px 8px' }}>Close</button>
          </div>

          {/* group nodes by category */}
          {(() => {
            const q = paletteSearch.trim().toLowerCase()
            const groups: Record<string, typeof nodeRegistry> = {}
            for (const n of nodeRegistry) {
              if (q && !n.title.toLowerCase().includes(q) && !(n.category || '').toLowerCase().includes(q)) continue
              const cat = n.category || 'Other'
              groups[cat] = groups[cat] || []
              groups[cat].push(n)
            }
            return Object.keys(groups).length === 0 ? (
              <div className="text-sm text-muted-foreground">No nodes</div>
            ) : (
              Object.entries(groups).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{cat}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((it) => (
                      <button key={it.id} onClick={() => insertNodeFromPalette(it)} style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 6 }}>
                        {it.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )
          })()}
        </div>
      )}

      {selectionRect && (
        <div style={{ position: 'absolute', left: selectionRect.x, top: selectionRect.y, width: selectionRect.w, height: selectionRect.h, border: '1px dashed rgba(0,0,0,0.6)', background: 'rgba(37,99,235,0.08)', pointerEvents: 'none', zIndex: 60 }} />
      )}

      <div className="absolute bottom-4 right-4 z-40 bg-main-view-fg/6 text-main-view-fg rounded-md px-3 py-1 text-xs flex gap-3 items-center">
        <span>Zoom: {Number(scale.toFixed(2))}x</span>
        <span className="text-muted-foreground">|</span>
        <span>X: {cursorBoard ? Math.round(cursorBoard.x) : 0}</span>
        <span>Y: {cursorBoard ? Math.round(cursorBoard.y) : 0}</span>
      </div>
      {
        selectedIds.length > 0 && (
                <div className="absolute top-4 left-4 z-50 rounded-md px-3 py-2 text-sm flex gap-2 items-center bg-main-view-fg/6 text-main-view-fg">
            <div style={{ marginLeft: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>{selectedIds.length} selected</span>
            <button onClick={() => setSelectedIds([])} style={{ padding: '6px 8px' }} title="Clear selection">Clear</button>
            </div>
        </div>
        )
    }
    </div>
        
            
  )
}
