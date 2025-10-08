import { useRef, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useThreads } from '@/hooks/useThreads'
import { useBuilderManagement } from '@/hooks/useBuilderManagement'

interface DeleteBuilderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  builderId?: string
  builderName?: string
}

export function DeleteBuilderDialog({
  open,
  onOpenChange,
  builderId,
  builderName,
}: DeleteBuilderDialogProps) {
  const { t } = useTranslation()
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const threads = useThreads((state) => state.threads)
  const { deleteBuilderWithThreads } = useBuilderManagement()

  const { threadCount, starredThreadCount } = useMemo(() => {
    if (!builderId) return { threadCount: 0, starredThreadCount: 0 }

    const builderThreads = Object.values(threads).filter(
      (thread) => thread.metadata?.project?.id === builderId
    )
    const starredCount = builderThreads.filter((thread) => thread.isFavorite).length

    return {
      threadCount: builderThreads.length,
      starredThreadCount: starredCount,
    }
  }, [builderId, threads])

  const handleConfirm = async () => {
    if (!builderId) return

    try {
      await deleteBuilderWithThreads(builderId)
      toast.success(
        builderName
          ? t('builder:deleteAgentDialog.successWithName', { agentName: builderName })
          : t('builder:deleteAgentDialog.successWithoutName')
      )
      onOpenChange(false)
    } catch (error) {
      toast.error(t('builder:deleteAgentDialog.error'))
      console.error('Delete builder error:', error)
    }
  }

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      await handleConfirm()
    }
  }

  const hasStarredThreads = starredThreadCount > 0
  const hasThreads = threadCount > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          deleteButtonRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('builder:deleteAgentDialog.title')}</DialogTitle>
          <DialogDescription className="space-y-2">
            {hasStarredThreads ? (
              <>
                <p className="text-red-600 dark:text-red-400 font-semibold">
                  {t('builder:deleteAgentDialog.starredWarning')}
                </p>
                <p className="font-medium">
                  {t('builder:deleteAgentDialog.permanentDeleteWarning')}
                </p>
              </>
            ) : hasThreads ? (
              <p>{t('builder:deleteAgentDialog.permanentDelete')}</p>
            ) : (
              <p>{t('builder:deleteAgentDialog.deleteEmptyAgent', { agentName: builderName })}</p>
            )}
            {hasThreads && (
              <p className="text-sm text-muted-foreground mt-3">
                {t('builder:deleteAgentDialog.saveThreadsAdvice')}
              </p>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="link" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            ref={deleteButtonRef}
            variant="destructive"
            onClick={handleConfirm}
            onKeyDown={handleKeyDown}
            aria-label={t('builder:deleteAgentDialog.ariaLabel', {
              agentName: builderName || t('builder:title').toLowerCase(),
            })}
          >
            {t('builder:deleteAgentDialog.deleteButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
