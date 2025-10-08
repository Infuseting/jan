import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { useState, useMemo } from 'react'

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
} from '@tabler/icons-react'
import AddBuilderDialog from '@/containers/dialogs/AddBuilderDialog'
import { DeleteBuilderDialog } from '@/containers/dialogs/DeleteBuilderDialog'
import { Button } from '@/components/ui/button'

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
  const { builders, addBuilder, updateBuilder, getBuilderById } = useBuilderManagement()
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
        initialData={editingKey ? getBuilderById(editingKey) : undefined}
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
