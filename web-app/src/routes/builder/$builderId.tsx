import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { useEffect, useRef, useState } from 'react'
import { useBuilderManagement } from '@/hooks/useBuilderManagement'
import Whiteboard from '@/components/Whiteboard'
import { useLeftPanel } from '@/hooks/useLeftPanel'
import { Button } from '@/components/ui/button'
import { IconDeviceFloppy } from '@tabler/icons-react'

export const Route = createFileRoute('/builder/$builderId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { builderId } = useParams({ from: '/builder/$builderId' })
  const navigate = useNavigate()
  const { getBuilderById, updateBuilder } = useBuilderManagement()

  const { open: leftOpen, setLeftPanel } = useLeftPanel()
  const prevLeftOpen = useRef<boolean>(leftOpen)

  const builder = getBuilderById(builderId)
  const [name, setName] = useState(builder?.name || '')
  const [initialBoard, setInitialBoard] = useState<any | null>(null)

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
      const key = `builder:${builderId}:board`
      const raw = localStorage.getItem(key)
      if (raw) {
        setInitialBoard(JSON.parse(raw))
      }
    } catch (err) { /* ignore */ }
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
      {/* Absolute Save & Back button top-left */}
      <div className="fixed top-4 left-4 z-50">
        <Button
          onClick={handleSaveAndBack}
          size="sm"
          className="flex items-center gap-2"
        >
          <IconDeviceFloppy />
        </Button>
      </div>


      {/* Whiteboard fills remaining area */}
      <div className="absolute inset-0">
        <Whiteboard
          minScale={0.1}
          maxScale={10}
          initialScale={1}
          builderId={builderId}
          initialBoard={initialBoard}
          onRequestSave={async (snap: any) => {
            try {
              const key = `builder:${builderId}:board`
              localStorage.setItem(key, JSON.stringify(snap))
              // touch builder updated_at
              if (builder) await updateBuilder(builder.id, builder.name)
            } catch (err) {
              console.error('Failed to save board', err)
            }
          }}
        />
      </div>
    </div>
  )
}

