import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import './Dialog.css'

interface DialogProps {
  labelledBy: string
  onClose: () => void
  className?: string
  children: ReactNode
}

/**
 * A modal <dialog> that is open for as long as it is mounted. The browser traps focus,
 * handles Escape and returns focus to where it was when the dialog closes.
 */
export function Dialog({ labelledBy, onClose, className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={['dialog', className].filter(Boolean).join(' ')}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        // Let React state decide when the dialog goes away.
        event.preventDefault()
        onClose()
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog-panel">{children}</div>
    </dialog>
  )
}

export function DialogCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-button dialog-close" onClick={onClick} aria-label="Close">
      <X aria-hidden="true" />
    </button>
  )
}
