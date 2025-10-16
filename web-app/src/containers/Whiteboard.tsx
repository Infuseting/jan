import React, { useEffect, useRef, useState, useImperativeHandle } from 'react'
import { getServiceHub } from '@/hooks/useServiceHub'
import { isPlatformTauri } from '@/lib/platform'
import { nodeRegistry as centralNodeRegistry, getNodeComponent, getNodeConfig } from '@/containers/node/nodeRegistry'
import { BoardSnapshot, WBElement, WBElementType, clamp } from '../types/board'
import * as publishService from '@/services/publish'
import { runAndPropagate, onStart as onExecStart, onFinish as onExecFinish, onError as onExecError, onCancel as onExecCancel } from '@/lib/nodeExecution'
import NodeConfigDialog from '@/containers/dialogs/NodeConfigDialog'
import NodesListPanel from '@/containers/NodesListPanel'
import { IconHandGrab, IconPointer } from '@tabler/icons-react';
import useNodeStateStyles from '../hooks/useNodeStateStyles'
import { uid } from '@/lib/uid'
import ConnectionsSVG from '@/containers/whiteboard/ConnectionsSVG'
import NodesRenderer from '@/containers/whiteboard/NodesRenderer'
// configs are provided by the node registry (nodeMap -> config)

type WhiteboardProps = { minScale?: number; maxScale?: number; initialScale?: number }
// types imported from ./whiteboard/types
interface WhiteboardFullProps extends WhiteboardProps {
  builderId?: string
  initialBoard?: BoardSnapshot | null
  onRequestSave?: (s: BoardSnapshot) => void | Promise<void>
}

const Whiteboard = React.forwardRef(function Whiteboard({ minScale = 0.1, maxScale = 10, initialScale = 1, builderId, initialBoard, onRequestSave }: WhiteboardFullProps, ref: React.ForwardedRef<any>) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Node state styles (running / success / error)
  useNodeStateStyles()

  const [scale, setScale] = useState<number>(initialScale)
  const [translate, setTranslate] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const [elements, setElements] = useState<WBElement[]>([])
  const [placingMode] = useState(false)

  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null)
  const [cursorBoard, setCursorBoard] = useState<{ x: number; y: number } | null>(null)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)
  // ephemeral in-memory store for last run info (not persisted)
  const [ephemeralLastRuns, setEphemeralLastRuns] = useState<Record<string, any>>({})

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

  // event-driven save helpers
  const saveTimeoutRef = useRef<number | null>(null)
  const needsSaveRef = useRef(false)
  const scheduleSave = async (immediate = false): Promise<void> => {
    const cb = onRequestSave
    if (!cb) return
    try {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
  } catch (e) { console.debug('scheduleSave clearTimeout error', e) }
    const run = async () => {
      try {
        const snap: BoardSnapshot = { elements, connections, scale, translate }
        const res = cb(snap)
        if (res && typeof (res as Promise<void>).then === 'function') {
          await res
        }
      } catch (e) { console.debug('run save callback error', e) }
    }
    if (immediate) {
      await run()
      return
    }
  // short debounce to coalesce rapid mutations
    // (use 250ms to be responsive but avoid spamming the backend)
    // store numeric id for window.setTimeout
    // @ts-ignore
    saveTimeoutRef.current = window.setTimeout(() => { void run(); saveTimeoutRef.current = null }, 250) as unknown as number
  }

  // When a mutation occurs we set needsSaveRef; this effect runs after React applies
  // elements/connections/scale/translate updates so save will capture the latest snapshot.
  useEffect(() => {
    if (!needsSaveRef.current) return
    needsSaveRef.current = false
    scheduleSave()
  }, [elements, connections, scale, translate])

  const BASE_CELL = 32

  const uidLocal = uid

  const updateElementMeta = (id: string, meta: Record<string, unknown>) => {
    pushHistory()
    setElements((arr) => arr.map((it) => (it.id === id ? { ...it, meta: { ...(it.meta || {}), ...(meta || {}) } } : it)))
    needsSaveRef.current = true
  }

  // apply initialBoard when provided
  useEffect(() => {
    const ib = initialBoard as BoardSnapshot | undefined | null
    if (!ib) return
    setElements(ib.elements || [])
    // sanitize connections: ensure a given output (from.nodeId+from.portId) appears at most once
    try {
      const raw = ib.connections || []
      const seen = new Set<string>()
      const sanitized: typeof raw = []
      for (const c of raw) {
        const key = `${c.from.nodeId}::${c.from.portId}`
        if (seen.has(key)) continue
        seen.add(key)
        sanitized.push(c)
      }
      setConnections(sanitized)
    } catch (e) {
      console.debug('initialBoard sanitize failure', e)
      setConnections(ib.connections || [])
    }
    setScale(ib.scale || initialScale)
    setTranslate(ib.translate || { x: 0, y: 0 })
    // clear history on load
    historyRef.current.stack = []
  }, [initialBoard, initialScale])

  // NOTE: saving is now event-driven. Call `scheduleSave()` at mutation points.
  useEffect(() => {
    return () => {
      try {
        // flush any pending save before unmount so navigation doesn't lose last edits
        // Only flush when a save is actually needed (prevents overwriting a loaded board with an empty snapshot)
        if (needsSaveRef.current) {
          // scheduleSave returns a promise; fire-and-forget here since callers can use the exposed saveNow
          void scheduleSave(true)
        }
      } catch {}
      try {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
      } catch (e) { console.debug('scheduleSave clear error', e) }
    }
  }, [])

  // expose imperative save method to parent so callers can await persistence before navigation
  useImperativeHandle(ref, () => ({
    saveNow: async () => {
      await scheduleSave(true)
    }
  }), [elements, connections, scale, translate])
  const historyRef = useRef<{ stack: WBElement[][] }>({ stack: [] })
  const clipboardRef = useRef<{ elements: WBElement[]; connections: Array<{ from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }> } | null>(null)

  const pushHistory = () => {
    try {
      const snap = elements.map((e) => ({ ...e }))
      historyRef.current.stack.push(snap)
      if (historyRef.current.stack.length > 100) historyRef.current.stack.shift()
  } catch (e) { console.debug('flush save on unmount error', e) }
  }

  const undo = () => {
    const h = historyRef.current.stack
    if (h.length === 0) return
    const prev = h.pop()!
    setElements(prev.map((e) => ({ ...e })))
    setSelectedIds([])
    needsSaveRef.current = true
  }

  const addElement = (type: WBElementType, x: number, y: number, meta?: Record<string, any>) => {
    pushHistory()
  setElements((s) => [...s, { id: uidLocal(), type, x, y, meta }])
    needsSaveRef.current = true
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
        if (Math.abs(newScaleRaw - prev) < 1e-12) return prev
        const newScale = Number(newScaleRaw.toFixed(6))
        const dx = mouseX - (mouseX - translate.x) * (newScale / prev)
        const dy = mouseY - (mouseY - translate.y) * (newScale / prev)
        setTranslate({ x: dx, y: dy })
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
          // debug starting connection
          console.debug('[Whiteboard] start connecting', { fromNode: nodeId, fromPort: portId, screen: { x: sx, y: sy } })
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
          const raw = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
          let portEl = raw ? (raw.closest('[data-port-kind]') as HTMLElement | null) : null
          console.debug('[Whiteboard] connection drop raw element', { tag: raw?.tagName, id: raw?.id, class: raw?.className, portEl: portEl && { tag: portEl.tagName, id: portEl.id } })
          // fallback: if the drop landed on a node body (has data-node-id) but not on a port element,
          // try to find the first input port inside that node so users can drop on the node body.
          if (!portEl && raw) {
            const nodeParent = raw.closest('[data-node-id]') as HTMLElement | null
            if (nodeParent) {
              const firstInput = nodeParent.querySelector('[data-port-kind="input"]') as HTMLElement | null
              if (firstInput) {
                portEl = firstInput
                console.debug('[Whiteboard] connection drop fallback to first input', { nodeId: nodeParent.getAttribute('data-node-id'), portId: firstInput.getAttribute('data-port-id') })
              }
            }
          }
          const nodeId = portEl?.getAttribute?.('data-node-id')
          const portId = portEl?.getAttribute?.('data-port-id')
          const portKind = portEl?.getAttribute?.('data-port-kind')
          if (nodeId && portId && portKind === 'input') {
            const cur = connectingRef.current
            if (cur) {
              // enforce: one output (fromNode+fromPort) can connect to only one input
              setConnections((existing) => {
                const already = existing.some((cn) => cn.from.nodeId === cur.fromNode && cn.from.portId === cur.fromPort)
                if (already) return existing
                pushHistory()
                const next = [...existing, { from: { nodeId: cur.fromNode, portId: cur.fromPort }, to: { nodeId, portId } }]
                needsSaveRef.current = true
                return next
              })
            }
          }
        } catch (err) { console.debug('[Whiteboard] connection drop error', err) }
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
      // if a drag just ended, schedule a save (positions changed)
      needsSaveRef.current = true
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

  // publish mode - if builderId provided, read local storage key to determine if publish mode enabled
  // `builderId` is received from props
  const [publishMode, setPublishMode] = useState<boolean>(false)

  // initialize publish mode from backend when running under Tauri; otherwise fallback to localStorage
  useEffect(() => {
    if (!builderId) return
    if (isPlatformTauri()) {
      ;(async () => {
        try {
          const ids = await publishService.listPublishBuilders()
          setPublishMode(ids.includes(builderId))
        } catch { setPublishMode(false) }
      })()
    } else {
      try { setPublishMode(localStorage.getItem(`builder:${builderId}:publish`) === '1') } catch { setPublishMode(false) }
      const handle = () => {
        try { setPublishMode(localStorage.getItem(`builder:${builderId}:publish`) === '1') } catch { }
      }
      window.addEventListener('storage', handle)
      const t = setInterval(handle, 2000)
      return () => { window.removeEventListener('storage', handle); clearInterval(t) }
    }
  }, [builderId])

  // Simple cron matcher for 5-field expressions (minute hour day month weekday)
  // Supports: '*', '*/N', comma-separated lists (e.g. '0,15,30'), and numeric values.
  // NOTE: uses the system local timezone (date local methods) so cron expressions
  // are evaluated against the PC's timezone.
  const cronMatches = (expr: string, date: Date): boolean => {
    try {
      const parts = (expr || '').trim().split(/\s+/)
      if (parts.length < 5) return false

      const [pm, ph, pd, pmon, pwd] = parts

      // use local time values so cron runs in the PC timezone
      const vMinute = date.getMinutes()
      const vHour = date.getHours()
      const vDate = date.getDate()
      const vMonth = date.getMonth() + 1
      const vWeekday = date.getDay() // 0 = Sunday

  const matchPart = (p: string, v: number, min = 0, max = 59): boolean => {
        if (!p) return false
        if (p === '*') return true
        // lists
        if (p.indexOf(',') !== -1) {
          return p.split(',').some((it) => matchPart(it, v, min, max))
        }
        if (p.startsWith('*/')) {
          const n = Number(p.slice(2))
          if (!n || n <= 0) return false
          return (v % n) === 0
        }
        const num = Number(p)
        if (!Number.isNaN(num)) return num === v
        return false
      }

      return matchPart(pm, vMinute, 0, 59) && matchPart(ph, vHour, 0, 23) && matchPart(pd, vDate, 1, 31) && matchPart(pmon, vMonth, 1, 12) && matchPart(pwd, vWeekday, 0, 6)
    } catch { return false }
  }

  // track last fired minute per element to avoid double-firing within same minute
  const lastFiredRef = useRef<Record<string, string>>({})

  // Scheduler: when publishMode is enabled, poll every second and run cron trigger nodes exactly at seconds === 0
  // Uses local system timezone for detection and minute-keying.
  useEffect(() => {
    let timer: any = null
    const tick = async () => {
      if (!publishMode) return
      const now = new Date()
      const seconds = now.getSeconds()
      if (seconds !== 0) return // only fire at exact minute start (00 seconds)

      // key to identify this minute in local time
      const minuteKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`

      try {
        const cronEls = elements.filter((e) => (e.meta && (e.meta as any)._nodeId) === 'cron')
        for (const el of cronEls) {
          const cronExpr = ((el.meta && (el.meta as any).cron) || '').toString()
          if (!cronExpr) continue
          // ensure we haven't already fired this element for this minute
          if (lastFiredRef.current[el.id] === minuteKey) continue
          if (cronMatches(cronExpr, now)) {
            const nodeEntry = nodeRegistry.find((n) => n.id === 'cron')
            if (!nodeEntry) continue
            try {
              console.debug('[Whiteboard] publish-mode: firing cron for element', el.id, cronExpr)
              // If running under Tauri, delegate execution to native backend
              if (isPlatformTauri()) {
                try {
                  // call execute_trigger(builder_id, trigger_id) on backend
                  const bId = builderId || ''
                  await getServiceHub().core().invoke('execute_trigger', { builder_id: bId, trigger_id: el.id })
                } catch (err) {
                  console.error('[Whiteboard] native execute_trigger error', err)
                }
              } else {
                // Fallback: run in-browser executor and propagate
                if (!nodeEntry.execute) continue
                await runAndPropagate(
                  el.id,
                  nodeEntry.id,
                  nodeEntry.execute,
                  undefined,
                  el.meta || {},
                  {},
                  (elId: string) => connections.filter((c) => c.from.nodeId === elId).map((c) => ({ fromPortId: c.from.portId, targetElementId: c.to.nodeId, targetPortId: c.to.portId })),
                  (targetElementId: string) => {
                    const tgt = elements.find((ee) => ee.id === targetElementId)
                    if (!tgt) return null
                    const nid = (tgt.meta as any)?._nodeId
                    if (!nid) return null
                    const entry = nodeRegistry.find((n) => n.id === nid)
                    if (!entry || !entry.execute) return null
                    return { executor: entry.execute as any, nodeId: entry.id, meta: tgt.meta }
                  },
                  (resultOutput: any) => resultOutput
                )
              }
              // mark as fired for this minute (local minute key)
              lastFiredRef.current[el.id] = minuteKey
            } catch (e) { console.error('[Whiteboard] publish-mode cron execute error', e) }
          }
        }
      } catch (e) { console.error('[Whiteboard] publish-mode tick error', e) }
    }
    // tick every second to detect exact minute starts
    timer = setInterval(tick, 1000)
    // if enabling publish mode, try to align to next second boundary and run immediately if seconds==0
    if (publishMode) tick()
    return () => { if (timer) clearInterval(timer) }
  }, [publishMode, elements, connections, nodeRegistry])

  // If a node is selected for config but that node declares `config === null`, close the dialog immediately.
  useEffect(() => {
    if (!configNodeId) return
    try {
      const el = elements.find((e) => e.id === configNodeId)
      const nodeId = el ? (el.meta as any)?._nodeId : null
      if (!nodeId) return
      const cfg = getNodeConfig(nodeId)
      if (cfg === null) {
        // close dialog since node has no configurable UI
        setConfigNodeId(null)
      }
    } catch {}
  }, [configNodeId, elements])

  // Subscribe to execution lifecycle events to update UI running state
  useEffect(() => {
    const offStart = onExecStart(({ elementId }) => {
      setRunningId(elementId)
      try {
        // update ephemeral last-run info (do not persist to element meta)
        setEphemeralLastRuns((m) => ({ ...(m || {}), [elementId]: { ...(m[elementId] || {}), lastRunStatus: 'running', lastRunAt: Date.now() } }))
      } catch {}
    })
    const offFinish = onExecFinish(({ elementId, result }) => {
      setRunningId(null)
      try {
        // update ephemeral success and also mark active port if provided by executor result
        setEphemeralLastRuns((m) => ({ ...(m || {}), [elementId]: { ...(m[elementId] || {}), lastRunStatus: 'success', lastRunAt: Date.now(), lastRunResult: result } }))
        try {
          const portId = (result && typeof result === 'object' && 'portId' in result) ? result.portId : undefined
          if (portId) {
            // mark the element's output port as active
            updateElementMeta(elementId, { ...(elements.find(e => e.id === elementId)?.meta || {}), activePortId: portId, activePortKind: 'output' })
            // find downstream connection target and mark its input port active briefly as well
            const outs = connections.filter((c) => c.from.nodeId === elementId && c.from.portId === portId)
            if (outs.length > 0) {
              const tgt = outs[0].to
              updateElementMeta(tgt.nodeId, { ...(elements.find(e => e.id === tgt.nodeId)?.meta || {}), activePortId: tgt.portId, activePortKind: 'input' })
              // clear target's active port after a short delay
              setTimeout(() => {
                try { updateElementMeta(tgt.nodeId, { ...(elements.find(e => e.id === tgt.nodeId)?.meta || {}), activePortId: null, activePortKind: null }) } catch {}
              }, 1200)
            }
            // clear source active port after short delay
            setTimeout(() => {
              try { updateElementMeta(elementId, { ...(elements.find(e => e.id === elementId)?.meta || {}), activePortId: null, activePortKind: null }) } catch {}
            }, 1200)
          }
        } catch {}
      } catch {}
    })
    const offErr = onExecError(({ elementId, error }) => {
      setRunningId(null)
      try { setEphemeralLastRuns((m) => ({ ...(m || {}), [elementId]: { ...(m[elementId] || {}), lastRunStatus: 'error', lastRunAt: Date.now(), lastRunError: String(error || '') } })) } catch {}
    })
    const offCancel = onExecCancel(({ elementId }) => {
      setRunningId(null)
      try { setEphemeralLastRuns((m) => ({ ...(m || {}), [elementId]: { ...(m[elementId] || {}), lastRunStatus: 'cancelled', lastRunAt: Date.now() } })) } catch {}
    })
    return () => { offStart(); offFinish(); offErr(); offCancel() }
  }, [])

  // Listen for backend-published triggers when running under Tauri
  useEffect(() => {
    if (!isPlatformTauri()) return
    let unsub: (() => void) | null = null
    try {
      getServiceHub().events().listen('publish:trigger', (evt: any) => {
        try {
          const payload = evt.payload || {}
          const bId = payload.builder_id || payload.builderId || ''
          const trg = payload.trigger_id || payload.triggerId || ''
          // only handle triggers for this builder (if builderId prop is set)
          if (builderId && bId !== builderId) return
          if (!trg) return
          const el = elements.find((e) => e.id === trg)
          if (!el) return
          const nodeEntry = nodeRegistry.find((n) => n.id === (el.meta as any)?._nodeId)
          if (!nodeEntry || !nodeEntry.execute) return
          // reuse the same execution path as the publish-mode scheduler fallback
          (async () => {
            try {
              await runAndPropagate(
                el.id,
                nodeEntry.id,
                nodeEntry.execute as any,
                undefined,
                el.meta || {},
                {},
                (elId: string) => connections.filter((c) => c.from.nodeId === elId).map((c) => ({ fromPortId: c.from.portId, targetElementId: c.to.nodeId, targetPortId: c.to.portId })),
                (targetElementId: string) => {
                  const tgt = elements.find((ee) => ee.id === targetElementId)
                  if (!tgt) return null
                  const nid = (tgt.meta as any)?._nodeId
                  if (!nid) return null
                  const entry = nodeRegistry.find((n) => n.id === nid)
                  if (!entry || !entry.execute) return null
                  return { executor: entry.execute as any, nodeId: entry.id, meta: tgt.meta }
                },
                (resultOutput: any) => resultOutput
              )
            } catch (e) { console.error('[Whiteboard] publish:trigger execute error', e) }
          })()
        } catch (e) { console.error('[Whiteboard] publish:trigger handler error', e) }
      }).then((u) => { unsub = u }).catch((e) => { console.error('failed to subscribe to publish:trigger', e) })
    } catch (e) { console.error('publish:trigger listener setup failed', e) }
    return () => { if (unsub) unsub() }
  }, [builderId, elements, connections, nodeRegistry])

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
    needsSaveRef.current = true
  }

  // copy selected
  const copySelected = () => {
    if (selectedIds.length === 0) return
    const copied = elements.filter((it) => selectedIds.includes(it.id)).map((e) => ({ ...e }))
    
    const copiedConns = connections.filter((c) => selectedIds.includes(c.from.nodeId) && selectedIds.includes(c.to.nodeId)).map((c) => ({ ...c }))
    clipboardRef.current = { elements: copied, connections: copiedConns }
  }

  // paste clipboard (offset slightly)
  const pasteClipboard = () => {
    const clip = clipboardRef.current
    if (!clip || !clip.elements || clip.elements.length === 0) return
    pushHistory()
    const offset = 16 / Math.max(0.1, scale)
    const base = cursorBoard || { x: 0, y: 0 }
    // generate new ids and keep mapping from old -> new
    const mapping: Record<string, string> = {}
    const first = clip.elements[0]
    const pasted: WBElement[] = clip.elements.map((c) => {
    const newid = uidLocal()
      mapping[c.id] = newid
      return { id: newid, type: c.type, x: base.x + (c.x - first.x) + offset, y: base.y + (c.y - first.y) + offset, meta: c.meta ? { ...c.meta } : undefined }
    })
    setElements((arr) => [...arr, ...pasted])
    setSelectedIds(pasted.map((p) => p.id))
    // remap and add copied connections (if any)
    if (clip.connections && clip.connections.length > 0) {
      const remapped = clip.connections.map((c) => ({ from: { nodeId: mapping[c.from.nodeId], portId: c.from.portId }, to: { nodeId: mapping[c.to.nodeId], portId: c.to.portId } }))
      // filter out any incomplete mappings (just in case)
      const valid = remapped.filter((r) => r.from.nodeId && r.to.nodeId)
      if (valid.length > 0) {
        // filter out any connections whose 'from' (output) is already present
        setConnections((arr) => {
          const existingFroms = new Set(arr.map((c) => `${c.from.nodeId}::${c.from.portId}`))
          const toAdd = valid.filter((r) => !existingFroms.has(`${r.from.nodeId}::${r.from.portId}`))
          if (toAdd.length === 0) return arr
          pushHistory()
          const next = [...arr, ...toAdd]
          // mark that a save is needed; an effect will run scheduleSave after state updates
          needsSaveRef.current = true
          return next
        })
      }
    }
    needsSaveRef.current = true
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
          {/* node elements are rendered inside this transformed area */}
          <NodesRenderer
            elements={elements}
            elementsAll={elements}
            selectedIds={selectedIds}
            activeTool={activeTool}
            nodeRegistry={nodeRegistry as any}
            connections={connections}
            runningId={runningId}
            setRunningId={setRunningId}
            updateElementMeta={updateElementMeta}
            ephemeralLastRuns={ephemeralLastRuns}
            setSelectedIds={setSelectedIds}
            setConfigNodeId={setConfigNodeId}
            runAndPropagate={runAndPropagate}
            getNodeComponent={getNodeComponent}
            pointerDownRef={pointerDownRef}
          />
          <div style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      {/* connections SVG placed on top of everything in screen coordinates so it always covers full container */}
      <ConnectionsSVG
        containerRef={containerRef}
        connections={connections}
        connectingRef={connectingRef as any}
        onDeleteConnection={(c) => {
          // remove the specific connection instance
          setConnections((arr) => arr.filter((x) => !(x.from.nodeId === c.from.nodeId && x.from.portId === c.from.portId && x.to.nodeId === c.to.nodeId && x.to.portId === c.to.portId)))
          needsSaveRef.current = true
        }}
      />
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

          // getNodeConfig may return null to indicate the node has no configurable UI
          if (ConfigComp === null) {
            return (
              <div className="text-sm">
                <div className="font-medium">No configuration available</div>
                <div className="text-xs text-muted-foreground">This node has no configurable options.</div>
              </div>
            )
          }

          return <ConfigComp meta={meta} setMeta={setMeta} />
        }}
      </NodeConfigDialog>

      <NodesListPanel
        open={paletteOpen}
        search={paletteSearch}
        onSearch={(s) => setPaletteSearch(s)}
        onClose={() => setPaletteOpen(false)}
        nodeRegistry={nodeRegistry as any}
        onInsert={(n: any) => insertNodeFromPalette(n)}
      />

      {selectionRect && (
        <div style={{ position: 'absolute', left: selectionRect.x, top: selectionRect.y, width: selectionRect.w, height: selectionRect.h, border: '1px dashed rgba(0,0,0,0.6)', background: 'rgba(37,99,235,0.08)', pointerEvents: 'none', zIndex: 60 }} />
      )}

      <div className="absolute bottom-4 right-4 z-40 bg-main-view-fg/6 text-main-view-fg rounded-md px-3 py-1 text-xs flex gap-3 items-center">
        <span>Zoom: {Number(scale.toFixed(2))}x</span>
        <span className="text-muted-foreground">|</span>
        <span>X: {cursorBoard ? Math.round(cursorBoard.x) : 0}</span>
        <span>Y: {cursorBoard ? Math.round(cursorBoard.y) : 0}</span>
      </div>
      
    
    </div>
        
            
  )

})

export default Whiteboard

