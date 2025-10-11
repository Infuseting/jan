import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { useState, useMemo, useEffect } from 'react'

import { useBuilderManagement } from '@/hooks/useBuilderManagement'
import { useTranslation } from '@/i18n/react-i18next-compat'

import HeaderPage from '@/containers/HeaderPage'
import {
  IconCirclePlus,
  IconTrash,
  IconFolder,
  IconSearch,
  IconX,
  IconRobot,
  IconFileExport,
  IconFileImport,
} from '@tabler/icons-react'
import AddBuilderDialog from '@/containers/dialogs/AddBuilderDialog'
import { DeleteBuilderDialog } from '@/containers/dialogs/DeleteBuilderDialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import * as publishService from '@/services/publish'
import { isPlatformTauri } from '@/lib/platform'

import { formatDate } from '@/utils/formatDate'

export const Route = createFileRoute('/builder/')({
  component: Builder,
})
function Builder() {
  return <BuilderContent />
}

function BuilderContent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // use builder-management hook which exposes builders directly
  const { builders, setBuilders, addBuilder, updateBuilder, getBuilderById } = useBuilderManagement()
  type BuilderItem = { id: string; name: string; updated_at: number }
  const typedBuilders: BuilderItem[] = (builders as unknown) as BuilderItem[]
  const [open, setOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const handleDelete = (id: string) => {
    setDeletingId(id)
    setDeleteConfirmOpen(true)
  }

  const handleExport = async (id: string) => {
    const builder = getBuilderById(id)
    if (!builder) return
    // include board snapshot if present
    let payload: any = { ...builder }
    try {
      if (isPlatformTauri()) {
        const raw = await publishService.getBuilderBoard(id)
        if (raw) payload.board = JSON.parse(raw)
      } else {
        const key = `builder:${id}:board`
        const raw = localStorage.getItem(key)
        if (raw) payload.board = JSON.parse(raw)
      }
    } catch {}
    const dataStr = JSON.stringify(payload, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
    const exportFileDefaultName = `agent-${builder.name
      .toLowerCase()
      .replace(/\s+/g, '-')}.json`
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
    linkElement.remove()
  }
  
  const handleDeleteClose = () => {
    setDeleteConfirmOpen(false)
    setDeletingId(null)
  }

  const handleSave = async (name: string) => {
    if (editingKey) {
      await updateBuilder(editingKey, name)
    } else {
      const newBuilder = await addBuilder(name)
      // Navigate to the newly created builder detail
      navigate({
        to: route.builder.detail,
        params: { builderId: newBuilder.id },
      })
    }
    setOpen(false)
    setEditingKey(null)
  }

  const formatBuilderDate = (timestamp: number) => {
    return formatDate(new Date(timestamp), { includeTime: false })
  }

  // publish flags per-builder (stored in localStorage as `builder:${id}:publish` = '1'|'0')
  const [publishMap, setPublishMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const buildMap = () => {
      const m: Record<string, boolean> = {}
      try {
        for (const b of builders as any) {
          try {
            if (isPlatformTauri()) {
              // will be populated by listPublishBuilders later
              m[b.id] = false
            } else {
              m[b.id] = localStorage.getItem(`builder:${b.id}:publish`) === '1'
            }
          } catch { m[b.id] = false }
        }
      } catch {}
      setPublishMap(m)
    }
    buildMap()
    if (isPlatformTauri()) {
      ;(async () => {
        try {
          const ids = await publishService.listPublishBuilders()
          const m: Record<string, boolean> = {}
          for (const b of builders as any) m[b.id] = ids.includes(b.id)
          setPublishMap(m)
        } catch {}
      })()
    }
    if (!isPlatformTauri()) {
      const onStorage = (ev: StorageEvent) => {
        if (!ev.key) return
        const m = ev.key.match(/^builder:(.+):publish$/)
        if (!m) return
        const id = m[1]
        setPublishMap((prev) => ({ ...prev, [id]: ev.newValue === '1' }))
      }
      window.addEventListener('storage', onStorage)
      return () => window.removeEventListener('storage', onStorage)
    }
    return () => {}
  }, [builders])

  // Filter builders based on search query
  const filteredBuilders = useMemo(() => {
    if (!searchQuery.trim()) {
      return typedBuilders
    }
    return typedBuilders.filter((builder: BuilderItem) =>
      builder.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [typedBuilders, searchQuery])

  return (
    <div className="flex h-full flex-col justify-center">
      <HeaderPage>
        <div className="flex items-center justify-between w-full mr-2">
          <span>{t('builder:listTitle')}</span>
          <div>

          <Button
            onClick={() => {
              setEditingKey(null)
              setOpen(true)
            }}
            size="sm"
            className="relative z-50"
          >
            <IconCirclePlus size={16} />
            {t('builder:addAgent')}
          </Button>
          {/* Import JSON button */}
          <input id="builder-import-input" type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={async (ev) => {
            try {
              const file = ev.target.files && ev.target.files[0]
              if (!file) return
              const text = await file.text()
              const payload = JSON.parse(text)
              const name = payload.name || 'imported-builder'
              // Prefer using provided id if available; if it exists in frontend store, update, otherwise create a new builder with given id when possible
              let targetId: string | null = null
              if (payload.id) {
                const existing = getBuilderById(payload.id)
                if (existing) {
                  await updateBuilder(payload.id, name)
                  targetId = payload.id
                } else {
                  // create an in-memory builder entry with the provided id so UI shows it immediately
                  try {
                    const newEntry = { id: payload.id, name: payload.name || name, updated_at: payload.updated_at || Date.now() }
                    setBuilders([...(builders as any), newEntry])
                    targetId = payload.id
                    if (isPlatformTauri()) {
                      // persist metadata and board under the provided id on native side
                      await publishService.saveBuilderMetadata(payload.id, payload.name || name, payload.updated_at)
                      if (payload.board) {
                        await publishService.upsertBuilderBoard(payload.id, JSON.stringify(payload.board))
                      }
                    } else {
                      // non-native: persist board and metadata locally
                      if (payload.board) {
                        localStorage.setItem(`builder:${payload.id}:board`, JSON.stringify(payload.board))
                      }
                      await publishService.saveBuilderMetadata(payload.id, payload.name || name, payload.updated_at)
                    }
                  } catch (e) {
                    console.error('Failed to persist imported builder under provided id', e)
                    // fallback: create a generated builder id
                    const created = await addBuilder(name)
                    targetId = created.id
                  }
                }
              }
              if (!targetId) {
                const created = await addBuilder(name)
                targetId = created.id
              }
              // If we haven't already persisted board/metadata for the chosen targetId, do it now
              if (payload.board) {
                try {
                  if (isPlatformTauri()) {
                    await publishService.upsertBuilderBoard(targetId, JSON.stringify(payload.board))
                    // also save metadata for this id so it appears in publish list operations
                    await publishService.saveBuilderMetadata(targetId, payload.name || name, payload.updated_at)
                  } else {
                    localStorage.setItem(`builder:${targetId}:board`, JSON.stringify(payload.board))
                    // best-effort: persist metadata in local storage builder-management
                    await publishService.saveBuilderMetadata(targetId, payload.name || name, payload.updated_at)
                  }
                } catch (err) {
                  console.error('Failed to persist imported board/metadata', err)
                }
              } else {
                // if no board but payload contains metadata fields, still write metadata
                if (isPlatformTauri() && payload.id) {
                  try { await publishService.saveBuilderMetadata(payload.id, payload.name || name, payload.updated_at) } catch {}
                }
              }
              // reset input
              ;(ev.target as HTMLInputElement).value = ''
              // navigate to imported builder (prefer targetId)
              navigate({ to: route.builder.detail, params: { builderId: targetId } })
            } catch (err) {
              console.error('Import failed', err)
              alert('Import failed: invalid JSON')
            }
          }} />
          <Button
            onClick={() => document.getElementById('builder-import-input')?.click()}
            size="sm"
            className="relative z-50 ml-2"
          >
            <IconFileImport size={16} />
          </Button>
          </div>
        </div>
      </HeaderPage>
      <div className="h-full overflow-y-auto flex flex-col">
        <div className="p-4 w-full md:w-3/4 mx-auto mt-2">
          {/* Search Bar */}
          {builders.length > 0 && (
            <div className="mb-4">
              <div className="relative">
                <IconSearch
                  size={18}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-main-view-fg/50"
                />
                <input
                  type="text"
                  placeholder={t('builder:searchAgents')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-main-view-fg/5 border border-main-view-fg/10 rounded-lg text-main-view-fg placeholder:text-main-view-fg/50 focus:outline-none focus:ring-2 focus:ring-main-view-fg/20 focus:border-main-view-fg/20 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-main-view-fg/50 hover:text-main-view-fg transition-colors"
                  >
                    <IconX size={18} />
                  </button>
                )}
              </div>
            </div>
          )}

          {builders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <IconFolder size={48} className="text-main-view-fg/30 mb-4" />
              <h3 className="text-lg font-medium text-main-view-fg/60 mb-2">
                {t('builder:noAgentsYet')}
              </h3>
              <p className="text-main-view-fg/50 text-sm">
                {t('builder:noAgentsYetDesc')}
              </p>
            </div>
          ) : filteredBuilders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <IconSearch size={48} className="text-main-view-fg/30 mb-4" />
              <h3 className="text-lg font-medium text-main-view-fg/60 mb-2">
                {t('builder:noAgentsFound')}
              </h3>
              <p className="text-main-view-fg/50 text-sm">
                {t('builder:tryDifferentSearch')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBuilders
                .slice()
                .sort((a: BuilderItem, b: BuilderItem) => b.updated_at - a.updated_at)
                .map((builder: BuilderItem) => {
                  return (
                    <div
                      className="bg-main-view-fg/3 py-2 px-4 rounded-lg"
                      key={builder.id}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="shrink-0 w-8 h-8 relative flex items-center justify-center bg-main-view-fg/4 rounded-md">
                            <IconRobot
                              size={16}
                              className="text-main-view-fg/50"
                            />
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3
                                className="text-base font-medium text-main-view-fg/80 truncate flex-1 min-w-0 cursor-pointer"
                                title={builder.name}
                                onClick={() =>
                                  navigate({
                                    to: route.builder.detail,
                                    params: { builderId: builder.id },
                                  })
                                }
                              >
                                {builder.name}
                              </h3>
                              
                            </div>
                            <p className="text-main-view-fg/50 text-xs line-clamp-2 mt-0.5">
                              {t('builder:updated')}{' '}
                              {formatBuilderDate(builder.updated_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center">
                              <Switch
                                checked={!!publishMap[builder.id]}
                                className='mr-2'
                                onCheckedChange={async (v) => {
                                  try {
                                    const next = !!v
                                    if (isPlatformTauri()) {
                                      await publishService.setBuilderPublish(builder.id, next)
                                      // persist current metadata so backend doesn't overwrite name/updated_at
                                      try {
                                        if (builder.name) {
                                          await publishService.saveBuilderMetadata(builder.id, builder.name, builder.updated_at)
                                        }
                                      } catch (e) { console.error('Failed to save builder metadata after publish toggle', e) }
                                    } else {
                                      localStorage.setItem(`builder:${builder.id}:publish`, next ? '1' : '0')
                                    }
                                    setPublishMap((prev) => ({ ...prev, [builder.id]: next }))
                                  } catch (err) { console.error(err) }
                                }}
                              />
                          <button
                            className="size-8 cursor-pointer flex items-center justify-center rounded-md hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                            title={t('builder:exportAgent')}
                            onClick={() => handleExport(builder.id)}
                          >
                            <IconFileExport
                              size={16}
                              className="text-main-view-fg/50"
                            />
                          </button>
                          <button
                            className="size-8 cursor-pointer flex items-center justify-center rounded-md hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                            title={t('builder:deleteAgent')}
                            onClick={() => handleDelete(builder.id)}
                          >
                            <IconTrash
                              size={16}
                              className="text-main-view-fg/50"
                            />
                          </button>
                        </div>
                      </div>

                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>
      <AddBuilderDialog
        open={open}
        onOpenChange={setOpen}
        editingKey={editingKey}
        initialData={editingKey ? (() => {
          const b = getBuilderById(editingKey)
          return b ? { id: b.id, name: b.name || '', updated_at: b.updated_at } : undefined
        })() : undefined}
        onSave={handleSave}
      />
      <DeleteBuilderDialog
        open={deleteConfirmOpen}
        onOpenChange={handleDeleteClose}
        builderId={deletingId ?? undefined}
        builderName={deletingId ? getBuilderById(deletingId)?.name : undefined}
      />
    </div>
  )
}
