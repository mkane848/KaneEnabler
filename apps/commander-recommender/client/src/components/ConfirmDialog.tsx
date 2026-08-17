import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface Props {
  /** The control that opens the dialog. */
  children: ReactNode;
  title: string;
  /** What the action will do, and anything the user can't undo afterwards. */
  description: string;
  /** Label for the destructive action. Say what happens, not "OK". */
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * A confirmation step in front of something destructive.
 *
 * Radix `Dialog` rather than `window.confirm`: the native one can't be
 * styled, is suppressible per-site, and blocks the whole tab. This also gets
 * focus trapping, Escape, and the same modal chrome as the rest of the app
 * for free.
 *
 * Cancel is deliberately the first control in the DOM, so it's what Radix
 * focuses on open — the safe option should be the one that Enter triggers.
 */
export function ConfirmDialog({ children, title, description, confirmLabel, onConfirm }: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-card confirm-dialog-card">
            <div className="dialog-body">
              <Dialog.Title className="dialog-name">{title}</Dialog.Title>
              <Dialog.Description className="confirm-description">{description}</Dialog.Description>
              <div className="confirm-actions">
                <Dialog.Close asChild>
                  <button type="button" className="page-button">
                    Cancel
                  </button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <button type="button" className="danger-button" onClick={onConfirm}>
                    {confirmLabel}
                  </button>
                </Dialog.Close>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
