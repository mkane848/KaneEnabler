import { useTheme } from '../hooks/useTheme';
import styles from './ThemeToggle.module.css';

/**
 * Turns the Doctor Who skin on and off. Self-contained — reads and writes
 * the theme preference directly, no prop drilling needed.
 *
 * Deliberately a switch rather than the two-way theme picker it used to be:
 * this app now wears the platform look by default like every other tool,
 * and the skin is the one thing it offers that they don't. A picker framed
 * that as "choose between two equal skins", which is what made this tool
 * feel like a separate site.
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const on = theme === 'who';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={[styles.toggle, on && styles.on].filter(Boolean).join(' ')}
      onClick={() => setTheme(on ? 'platform' : 'who')}
      title={on ? 'Turn off the Doctor Who theme' : 'Turn on the Doctor Who theme'}
    >
      <span aria-hidden="true" className={styles.track}>
        <span className={styles.thumb} />
      </span>
      Doctor Who theme
    </button>
  );
}
