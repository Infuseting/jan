import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { useEffect, useRef, useState } from 'react'
import { useBuilderManagement } from '@/hooks/useBuilderManagement'
import Whiteboard from '@/containers/Whiteboard'
import { useLeftPanel } from '@/hooks/useLeftPanel'
import { Button } from '@/components/ui/button'
import * as publishService from '@/services/publish'
import { isPlatformTauri } from '@/lib/platform'
import { IconArrowLeft, IconDeviceFloppy, IconPlayCard1, IconPlayerPlay } from '@tabler/icons-react'

export const Route = createFileRoute('/builder/$builderId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { builderId } = useParams({ from: '/builder/$builderId' })
  const navigate = useNavigate()
  const { getBuilderById, updateBuilder } = useBuilderManagement()

  const { open: leftOpen, setLeftPanel } = useLeftPanel()
  const prevLeftOpen = useRef<boolean>(leftOpen)
  const wbRef = useRef<any>(null)

  const builder = getBuilderById(builderId)
  const [publishEnabled, setPublishEnabled] = useState<boolean>(() => {
    try {
      if (!builderId) return false
      if (isPlatformTauri()) return false
      const raw = localStorage.getItem(`builder:${builderId}:publish`)
      return raw === '1'
    } catch { return false }
  })

  // when running under Tauri, fetch publish flag from backend
  useEffect(() => {
    if (!isPlatformTauri() || !builderId) return
    ;(async () => {
      try {
        const ids = await publishService.listPublishBuilders()
        setPublishEnabled(ids.includes(builderId))
      } catch {}
    })()
  }, [builderId])
  const [name, setName] = useState(builder?.name || '')
  // undefined = not yet loaded; null = loaded but no board; object = loaded board
  const [initialBoard, setInitialBoard] = useState<any | null | undefined>(undefined)

  // Hide left panel on mount, restore previous state on unmount
  useEffect(() => {
    prevLeftOpen.current = leftOpen
    setLeftPanel(false)
    return () => {
      setLeftPanel(prevLeftOpen.current)
    }
  }, [])

  useEffect(() => {
    setName(builder?.name || '')
  }, [builderId, builder?.name])

  // load board snapshot from localStorage
  useEffect(() => {
    if (!builderId) return
    try {
      if (isPlatformTauri()) {
        ;(async () => {
          try {
            let b = await publishService.getBuilderBoard(builderId)
            if (!b) {
              // retry once after short delay
              await new Promise((r) => setTimeout(r, 250))
              b = await publishService.getBuilderBoard(builderId)
            }
            if (b) setInitialBoard(JSON.parse(b))
            else setInitialBoard(null)
          } catch (err) { console.error('Error loading builder board', err); setInitialBoard(null) }
        })()
      } else {
        const key = `builder:${builderId}:board`
        const raw = localStorage.getItem(key)
        if (raw) {
          setInitialBoard(JSON.parse(raw))
        } else {
          setInitialBoard(null)
        }
      }
    } catch (err) { setInitialBoard(null) }
  }, [builderId])

  const handleSaveAndBack = async () => {
    if (!builder) {
      navigate({ to: route.builder.index })
      return
    }

    // Only update if changed
    if (name.trim() !== builder.name) {
      await updateBuilder(builder.id, name.trim())
    }

    // ensure board is persisted before navigating away
    try {
      if (wbRef.current && typeof wbRef.current.saveNow === 'function') {
        await wbRef.current.saveNow()
      }
    } catch (err) {
      // ignore save errors for nav, but log
      console.warn('save before navigation failed', err)
    }

    // go back to builder list
    navigate({ to: route.builder.index })
  }

  if (!builder) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-main-view-fg/70">Builder not found</div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-main-view">
      <div className="fixed top-4 z-50 flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2 pl-4">
          <IconArrowLeft
            size={24}
            className="cursor-pointer text-main-view-fg/70 hover:text-main-view-fg"
            onClick={handleSaveAndBack}
          />
          <p className="text-main-view-fg/70">{name}</p>
        </div>
        <div className="right-4 flex items-center gap-2 pr-4">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1 border-1 border-main-view-fg/20"
          ><IconPlayerPlay />Preview</Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const next = !publishEnabled
                setPublishEnabled(next)
                if (builderId) {
                  if (isPlatformTauri()) {
                    await publishService.setBuilderPublish(builderId, next)
                    // write metadata so backend keeps builder name/updated_at
                    try {
                      if (builder?.name) await publishService.saveBuilderMetadata(builderId, builder.name, builder.updated_at)
                    } catch (e) { console.error('Failed to save builder metadata after publish toggle', e) }
                  } else {
                    localStorage.setItem(`builder:${builderId}:publish`, next ? '1' : '0')
                  }
                }
              } catch { }
            }}
            className={`ml-2 flex items-center gap-1 ${publishEnabled ? 'bg-green-600 text-white' : 'border-1 border-main-view-fg/20'} `}
          >
            Publish
          </Button>
        </div>
        
      </div>


      {/* Whiteboard fills remaining area */}
      <div className="absolute inset-0">
        {/* Only mount Whiteboard after we've resolved initialBoard (undefined = loading) */}
        {initialBoard !== undefined && (
          <Whiteboard
            minScale={0.1}
            maxScale={10}
            initialScale={1}
            ref={wbRef}
            builderId={builderId}
            initialBoard={initialBoard}
            onRequestSave={async (snap: any) => {
              try {
                const key = `builder:${builderId}:board`
                if (isPlatformTauri()) {
                  await publishService.upsertBuilderBoard(builderId, JSON.stringify(snap))
                } else {
                  localStorage.setItem(key, JSON.stringify(snap))
                }
                // touch builder updated_at
                if (builder) await updateBuilder(builder.id, builder.name)
              } catch (err) {
                console.error('Failed to save board', err)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

