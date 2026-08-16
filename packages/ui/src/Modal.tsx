import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';

export interface ModalProps {
  /** Called on Escape, an outside click, or an explicit close control. */
  onClose: () => void;
  /** Applied to the full-screen overlay — each app supplies its own backdrop styling. */
  overlayClassName?: string;
  /**
   * Applied to the dialog surface itself — each app supplies its own
   * sheet/drawer styling. Radix portals the overlay and content as
   * siblings, not parent/child, so give this its own `position: fixed`
   * (don't rely on the overlay's layout to place it) *and* a `z-index`
   * higher than the overlay's — otherwise the overlay, not the content,
   * wins the stacking order and silently eats every click.
   */
  contentClassName?: string;
  children: ReactNode;
}

/**
 * A controlled modal dialog: mount it to show it, unmount it to hide it,
 * matching how every call site already manages visibility (`{open && <X
 * onClose={...} />}`) rather than toggling an `open` prop in place. `Dialog.Root`
 * is held permanently open for exactly that reason — the parent's own
 * mount/unmount is the show/hide mechanism.
 *
 * This exists because five hand-rolled backdrop+dialog components asserted
 * `aria-modal="true"` without enforcing it: no focus trap, no focus
 * restoration on close, no Escape handler, no scroll lock — Radix Dialog
 * supplies all four (see docs/rules-audit.md item 21). `overlayClassName`/
 * `contentClassName` are deliberately unstyled hooks rather than a fixed
 * look, so each app keeps its own backdrop/sheet CSS (and, for time-counters,
 * its per-theme custom properties) unchanged.
 */
export function Modal({ onClose, overlayClassName, contentClassName, children }: ModalProps) {
  // Radix's *modal* Dialog.Content hardcodes its own onCloseAutoFocus
  // (preventDefault + focus whatever was registered via Dialog.Trigger) —
  // see @radix-ui/react-dialog's DialogContentModal. None of this
  // package's callers use Dialog.Trigger (they're all opened from external
  // state, per the mount/unmount contract above), so that triggerRef is
  // always null and focus silently landed nowhere on close — verified
  // against a live browser, not just jsdom. Capturing the real opener
  // ourselves and overriding the handler restores it correctly.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClassName} />
        {/* No Dialog.Description in any current caller; suppressing the
            aria-describedby warning is Radix's own documented workaround. */}
        <Dialog.Content
          className={contentClassName}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener?.focus();
          }}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Re-exported so callers don't need `@radix-ui/react-dialog` as a direct dependency just for these. */
export const ModalTitle = Dialog.Title;
export const ModalClose = Dialog.Close;
