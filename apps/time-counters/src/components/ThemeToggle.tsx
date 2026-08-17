import { useTheme } from '../hooks/useTheme';
import { THEME_LABEL } from '../utils/theme';
import styles from './ThemeToggle.module.css';

const OTHER = { claude: 'who', who: 'claude' } as const;

/** Self-contained — reads and writes the theme preference directly, no prop drilling needed. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = OTHER[theme];

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => setTheme(next)}
      title={`Switch to the ${THEME_LABEL[next]} theme`}
    >
      Theme: {THEME_LABEL[theme]}
    </button>
  );
}
