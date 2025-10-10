import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
// dialog does not need Input; node components provide their own editors

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId: string | null
  meta?: Record<string, any>
  onSave: (meta: Record<string, any>) => void
  // children can be a render-prop receiving (meta, setMeta)
  children?: React.ReactNode | ((meta: Record<string, any>, setMeta: (m: Record<string, any>) => void) => React.ReactNode)
}

export default function NodeConfigDialog({ open, onOpenChange, nodeId, meta, onSave, children }: Props) {
  const [localMeta, setLocalMeta] = useState<Record<string, any>>(meta || {})
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    setLocalMeta(meta || {})
  }, [meta])

  useEffect(() => {
    if (open) setValidationError(null)
  }, [open])

  const handleSave = () => {
    onSave(localMeta || {})
    onOpenChange(false)
  }

  const handleCancel = () => {
    setValidationError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Node configuration</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-auto">
          {typeof children === 'function' ? (children as any)(localMeta || {}, (m: Record<string, any>) => setLocalMeta(m)) : (
            children ? children : (
              <div>
                <label className="text-sm font-medium">Raw meta (JSON)</label>
                <textarea className="w-full mt-2 p-2 rounded border" value={JSON.stringify(localMeta || {}, null, 2)} onChange={(e) => {
                  try { setLocalMeta(JSON.parse(e.target.value)) } catch { /* ignore until save */ }
                }} rows={8} />
              </div>
            )
          )}
        </div>
        {validationError ? <div className="mt-2 text-sm text-red-600">{validationError}</div> : null}

        <DialogFooter>
          <div className="flex gap-2">
            <Button variant="link" onClick={handleCancel}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
