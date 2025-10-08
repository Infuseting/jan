import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBuilderManagement } from '@/hooks/useBuilderManagement'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/react-i18next-compat'

interface AddBuilderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingKey: string | null
  initialData?: {
    id: string
    name: string
    updated_at: number
  }
  onSave: (name: string) => void
}

export default function AddBuilderDialog({
  open,
  onOpenChange,
  editingKey,
  initialData,
  onSave,
}: AddBuilderDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialData?.name || '')
  const { builders } = useBuilderManagement()

  useEffect(() => {
    if (open) {
      setName(initialData?.name || '')
    }
  }, [open, initialData])

  const handleSave = () => {
    if (!name.trim()) return

    const trimmedName = name.trim()

    // Check for duplicate names (excluding current builder when editing)
    const isDuplicate = builders.some(
      (builder) =>
        builder.name.toLowerCase() === trimmedName.toLowerCase() &&
        builder.id !== editingKey
    )

    if (isDuplicate) {
      toast.warning(t('builder:addAgentDialog.alreadyExists', { agentName: trimmedName }))
      return
    }

    onSave(trimmedName)

    if (editingKey && initialData) {
      toast.success(
        t('builder:addAgentDialog.renameSuccess', {
          oldName: initialData.name,
          newName: trimmedName,
        })
      )
    } else {
      toast.success(t('builder:addAgentDialog.createSuccess', { agentName: trimmedName }))
    }

    setName('')
  }

  const handleCancel = () => {
    onOpenChange(false)
    setName('')
  }

  const isButtonDisabled = !name.trim() || (editingKey && name.trim() === initialData?.name)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingKey ? t('builder:addAgentDialog.editTitle') : t('builder:addAgentDialog.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-main-view-fg/80">
              {t('builder:addAgentDialog.nameLabel')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('builder:addAgentDialog.namePlaceholder')}
              className="mt-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isButtonDisabled) {
                  handleSave()
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="link" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={Boolean(isButtonDisabled)}>
            {editingKey ? t('builder:addAgentDialog.updateButton') : t('builder:addAgentDialog.createButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
