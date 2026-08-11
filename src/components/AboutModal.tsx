import styles from './AboutModal.module.css';

const REPO_URL = 'https://github.com/mkane848/DrWhoCompanionEDH';

interface AboutModalProps {
  onClose: () => void;
}

export default function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="about-title" className={styles.title}>
            About
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Done
          </button>
        </div>

        <p className={styles.appName}>
          Time Counters <span className={styles.version}>v{__APP_VERSION__}</span>
        </p>
        <p className={styles.tagline}>
          A Commander companion for tracking Suspend, Vanishing, Fading, Sagas, and commander tax.
        </p>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Credits</h3>
          <ul className={styles.list}>
            <li>Card data via <a href="https://scryfall.com" target="_blank" rel="noreferrer">Scryfall</a>.</li>
            <li>
              Mana symbols via the community{' '}
              <a href="https://github.com/andrewgioia/mana" target="_blank" rel="noreferrer">
                mana-font
              </a>{' '}
              project.
            </li>
            <li>
              Theme typefaces via{' '}
              <a href="https://fonts.google.com" target="_blank" rel="noreferrer">
                Google Fonts
              </a>{' '}
              (Fraunces, Inter, IBM Plex Mono, Orbitron, Titillium Web, JetBrains Mono).
            </li>
            <li>Built with <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude</a>.</li>
          </ul>
        </div>

        <div className={styles.links}>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            View source on GitHub
          </a>
          <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
            Changelog
          </a>
        </div>

        <p className={styles.disclaimer}>
          Magic: The Gathering is © Wizards of the Coast. This is an unofficial fan tool.
        </p>
      </div>
    </div>
  );
}
