import { FORMAT_LABELS, FORMATS, type Format } from '@ptcg/rules';

const HINTS: Record<Format, string> = {
  standard: 'The current rotation, by regulation mark.',
  expanded: 'Black & White onward, minus the ban list.',
  glc: 'Community format: singleton, one Pokémon type, no Rule Box cards.',
  unlimited: 'Every card ever printed. Construction rules only.',
};

export function FormatPicker({
  value,
  onChange,
}: {
  value: Format;
  onChange: (f: Format) => void;
}) {
  return (
    <fieldset className="format-picker">
      <legend>Format</legend>
      <div className="format-options">
        {FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            className={`mtg-btn mtg-btn-sm ${format === value ? 'mtg-btn-primary' : 'mtg-btn-ghost'}`}
            aria-pressed={format === value}
            onClick={() => onChange(format)}
          >
            {FORMAT_LABELS[format]}
          </button>
        ))}
      </div>
      <p className="format-hint">{HINTS[value]}</p>
    </fieldset>
  );
}
