import { IconPlayerPlay } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'

type Props = {
  elements: any[]
  selectedIds: string[]
  activeTool: string
  nodeRegistry: any[]
  connections: any[]
  runningId: string | null
  updateElementMeta: (id: string, meta: Record<string, unknown>) => void
  setSelectedIds: (ids: string[]) => void
  setConfigNodeId: (id: string | null) => void
  runAndPropagate: any
  getNodeComponent: (nodeId: string) => any
  elementsAll: any[]
  pointerDownRef?: { current: null | { id: string; time: number; startX: number; startY: number; selectionAtDown: string[]; modifier: boolean } }
  ephemeralLastRuns?: Record<string, any>
}

export default function NodesRenderer({ elements, elementsAll, selectedIds, activeTool, nodeRegistry, connections, runningId, updateElementMeta, setSelectedIds, setConfigNodeId, runAndPropagate, getNodeComponent, pointerDownRef, ephemeralLastRuns }: Props) {
  return (
    <>
      {elements.map((el) => {
        const isSelected = selectedIds.includes(el.id)
        const nodeId = el.meta && (el.meta as any)._nodeId
        const commonProps = {
            onPointerDown: (ev: any) => {
            if (activeTool !== 'pointer') return
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
            // set parent pointerDownRef so Whiteboard can detect start-of-drag
            try {
              if (pointerDownRef) {
                pointerDownRef.current = { id: el.id, time: Date.now(), startX: ev.clientX, startY: ev.clientY, selectionAtDown: newSelection, modifier }
              }
            } catch (err) { console.debug('failed to set pointerDownRef in NodesRenderer', err) }
            ;(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId)
          },
          onDoubleClick: () => { if (activeTool === 'pointer' && getNodeComponent(el.meta && (el.meta as any)._nodeId) !== null) setConfigNodeId(el.id) },
          style: { position: 'absolute' as const, left: el.x, top: el.y, transform: 'translate(-50%, -50%)', pointerEvents: activeTool === 'hand' ? 'none' : 'auto', zIndex: isSelected ? 50 : undefined, cursor: activeTool === 'hand' ? 'default' : 'grab' }
        }

        if (nodeId) {
          const Comp: any = getNodeComponent(nodeId)
          const nodeEntry = nodeRegistry.find((n) => n.id === nodeId)
          // prefer ephemeral (in-memory) last-run info; fall back to persisted meta if present
          const lastStatus = (ephemeralLastRuns && ephemeralLastRuns[el.id] && ephemeralLastRuns[el.id].lastRunStatus) || (el.meta && (el.meta as any).lastRunStatus) || null
          const isRunningEl = runningId === el.id

          const hasActivePortMeta = !!((el.meta && (el.meta as any).activePortId) || (el.meta && (el.meta as any).activePortKind))
          const wrapperClass = `node-wrapper ${isRunningEl ? 'node--running' : ''} ${(lastStatus === 'success' && hasActivePortMeta) ? 'node--success' : ''} ${lastStatus === 'error' ? 'node--error' : ''} ${isSelected ? 'node--selected' : ''}`

          return (
            <div key={el.id} className={wrapperClass} {...commonProps as any}>
              {nodeEntry && nodeEntry.nodeType === NodeType.Trigger && (
                <button
                  title="Run preview"
                  onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); }}
                  onClick={async (ev) => {
                    ev.stopPropagation()
                    try {
                      if (!nodeEntry || !nodeEntry.execute) return
                      // reuse runAndPropagate signature from parent to run and propagate
                      const res = await runAndPropagate(
                        el.id,
                        nodeEntry.id,
                        nodeEntry.execute,
                        undefined,
                        el.meta || {},
                        {},
                        (elId: string) => connections.filter((c) => c.from.nodeId === elId).map((c) => ({ fromPortId: c.from.portId, targetElementId: c.to.nodeId, targetPortId: c.to.portId })),
                        (targetElementId: string) => {
                          const tgt = elementsAll.find((ee) => ee.id === targetElementId)
                          if (!tgt) return null
                          const nid = (tgt.meta as any)?._nodeId
                          if (!nid) return null
                          const entry = nodeRegistry.find((n) => n.id === nid)
                          if (!entry || !entry.execute) return null
                          return { executor: entry.execute as any, nodeId: entry.id, meta: tgt.meta }
                        },
                        (resultOutput: any) => resultOutput
                      )
                      console.debug('[Whiteboard] run preview finished for', el.id, 'result', res)
                    } catch (err) { console.error('Error running node preview', err) }
                  }}
                  style={{ position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: 4, zIndex: 80, padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', background: runningId === el.id ? 'rgba(14,165,233,0.12)' : 'rgba(255,255,255,0.04)', color: 'inherit', cursor: runningId === el.id ? 'wait' : 'pointer' }}
                >
                  {runningId === el.id ? 'Running...' : <IconPlayerPlay />}
                </button>
              )}

              <Comp id={el.id} meta={el.meta} selected={isSelected} onMetaChange={(m: any) => updateElementMeta(el.id, m)} activePortId={(el.meta && (el.meta as any).activePortId) || null} activePortKind={(el.meta && (el.meta as any).activePortKind) || null} />
            </div>
          )
        }
        return null
      })}
      <div style={{ width: '100%', height: '100%' }} />
    </>
  )
}
