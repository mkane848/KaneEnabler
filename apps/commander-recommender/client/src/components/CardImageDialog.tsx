import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  name: string;
  imageUri: string | null;
  /** Second face of a transform/modal DFC. Its presence is what makes this
   * card flippable — single-faced cards pass null and get no flip control. */
  backImageUri?: string | null;
  backName?: string | null;
  scryfallUri?: string | null;
  children: ReactNode;
}

/**
 * Shows one card, whole, at its own proportions.
 *
 * The image is Scryfall's full card scan, so the only job here is to not
 * distort it: the frame is sized from the image's natural aspect ratio and
 * capped against the *viewport* rather than a fixed box, which is what keeps
 * a tall card from being squashed to fit on a short screen. `object-fit:
 * contain` is the backstop for cards whose scan isn't the usual ratio
 * (Planechase, art series).
 *
 * A double-faced card gets a Flip control, matching what Scryfall, Gatherer
 * and the deckbuilders do — seeing only the front of a transforming card is
 * seeing half of it.
 *
 * Radix Dialog handles focus trapping, restoring focus to whatever was
 * tapped, Escape, and scroll locking.
 */
export function CardImageDialog({ name, imageUri, backImageUri, backName, scryfallUri, children }: Props) {
  const [showBack, setShowBack] = useState(false);

  // Reopening a card should start on its front again rather than wherever it
  // was left last time. The dialog's content unmounts on close, but this
  // component does not, so the state needs resetting explicitly.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) setShowBack(false);
  }, [open]);

  // Without an image there is nothing to open, so the trigger stays inert
  // rather than becoming a button that opens an empty modal.
  if (!imageUri) return <>{children}</>;

  const canFlip = !!backImageUri;
  const currentUri = showBack && backImageUri ? backImageUri : imageUri;
  const currentName = showBack && backName ? backName : name;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="card-image-content" aria-describedby={undefined}>
          <Dialog.Title className="visually-hidden">{currentName}</Dialog.Title>

          {/* Keyed on the face so the browser treats a flip as a new image
              rather than swapping the src underneath a decoded one, which
              can otherwise show the previous face for a frame. */}
          <img key={currentUri} className="card-image-full" src={currentUri} alt={currentName} />

          <div className="card-image-footer">
            <span className="card-image-name">{currentName}</span>
            {canFlip && (
              <button
                type="button"
                className="card-image-flip"
                onClick={() => setShowBack((b) => !b)}
                aria-label={`Flip to ${showBack ? name : (backName ?? 'the other face')}`}
              >
                <span aria-hidden="true">⇄</span> Flip
              </button>
            )}
            {scryfallUri && (
              <a
                className="card-image-link"
                href={scryfallUri}
                target="_blank"
                rel="noreferrer noopener"
              >
                Scryfall
              </a>
            )}
          </div>

          <Dialog.Close className="dialog-close card-image-close" aria-label="Close">
            <span aria-hidden="true">×</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
