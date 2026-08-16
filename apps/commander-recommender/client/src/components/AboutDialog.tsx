import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useServerMeta } from '../api/queries';

const REPO_URL = 'https://github.com/mkane848/HardlyKnowHer';

// Formatted once at module load, not per render — it never changes within a
// page's lifetime. Shown in the visitor's own locale and time zone (the
// no-argument form of toLocaleString) rather than a fixed one, since "when
// was this updated" is more useful relative to the reader's own clock than
// in a zone they'd have to convert.
const formattedBuildDate = new Date(__APP_BUILD_DATE__).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Version, credits, and a link to the source — the things a small hobby app
 * owes its users without needing its own page for them. Reuses the same
 * Dialog chrome (overlay/content/close styling) as the card detail view
 * rather than inventing a second modal look.
 */
export function AboutDialog({ children }: { children: ReactNode }) {
  const { data: meta } = useServerMeta();

  // Only the date: the snapshot's time of day says nothing useful, and the
  // card data changes at most daily. Absent while loading, or if the server
  // is asleep or predates snapshot tracking — the line simply doesn't render.
  const cardDataDate = meta?.cardDataUpdatedAt
    ? new Date(meta.cardDataUpdatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-card about-dialog-card">
            <div className="dialog-body">
              <Dialog.Title className="dialog-name">Commander? I Hardly Know 'Er</Dialog.Title>
              <p className="about-version">
                Version {__APP_VERSION__} <span className="about-build-date">· Updated {formattedBuildDate}</span>
              </p>

              <p className="about-blurb">
                Paste a card list, get back Commander suggestions scored against it — with an explanation
                for each one, not just a number.
              </p>

              <dl className="dialog-meta about-credits">
                <div>
                  <dt>Card &amp; legality data</dt>
                  <dd>
                    <a href="https://scryfall.com" target="_blank" rel="noreferrer noopener">
                      Scryfall
                    </a>
                    {cardDataDate && <span className="about-build-date"> · {cardDataDate}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Combo data</dt>
                  <dd>
                    <a href="https://commanderspellbook.com" target="_blank" rel="noreferrer noopener">
                      Commander Spellbook
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Built with</dt>
                  <dd>Claude</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                      github.com/mkane848/HardlyKnowHer
                    </a>
                  </dd>
                </div>
              </dl>

              <p className="about-caveat">
                Suggestions come from card text, keywords and creature types — a heuristic, not a model of how a
                deck actually plays. See the{' '}
                <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer noopener">
                  changelog
                </a>{' '}
                for what's changed.
              </p>
            </div>
          </div>

          <Dialog.Close className="dialog-close" aria-label="Close">
            <span aria-hidden="true">×</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
