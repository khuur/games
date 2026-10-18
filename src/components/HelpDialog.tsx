import { useId, type ReactNode } from 'react'
import { Dialog, DialogCloseButton } from './Dialog'

interface HelpDialogProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export function HelpDialog({ title, onClose, children }: HelpDialogProps) {
  const titleId = useId()
  return (
    <Dialog labelledBy={titleId} onClose={onClose} className="help-dialog">
      <DialogCloseButton onClick={onClose} />
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="dialog-actions">
        <button type="button" className="button button-primary" onClick={onClose} data-autofocus>
          Let&apos;s play
        </button>
      </div>
    </Dialog>
  )
}
