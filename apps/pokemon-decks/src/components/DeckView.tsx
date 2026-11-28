import { useState } from 'react';
import type { BuiltDeck, DeckLine } from '../engine/build';
import { ROLE_LABELS } from '../engine/roles';
import type { RankedDeck } from '../engine/recommend';
import type { Catalog } from '../data/catalog';
import { exportList } from '../lib/exportList';
import { CardArt } from './CardArt';

const SLOT_LABELS: Record<DeckLine['slot'], string> = {
  line: 'Main line',
  support: 'Support Pokémon',
  energy: 'Energy',
  ...ROLE_LABELS,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      className="mtg-btn mtg-btn-sm mtg-btn-ghost"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => setState('copied'),
          () => setState('failed'),
        );
      }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : 'Copy list'}
    </button>
  );
}

export function DeckView({
  deck,
  catalog,
  showOwnership,
}: {
  deck: BuiltDeck | RankedDeck;
  catalog: Catalog;
  showOwnership: boolean;
}) {
  const bySlot = new Map<DeckLine['slot'], DeckLine[]>();
  for (const line of deck.cards) bySlot.set(line.slot, [...(bySlot.get(line.slot) ?? []), line]);
  const breakdown = 'breakdown' in deck ? deck.breakdown : null;
  const missingTotal = deck.missing.reduce((n, m) => n + m.need, 0);

  return (
    <article className="deck-card">
      <header className="deck-head">
        <CardArt card={deck.attacker} className="deck-art" decorative />
        <div className="deck-head-text">
          <h3 className="deck-title">{deck.attacker.name}</h3>
          <p className="deck-sub">
            {deck.line.map((c) => c.name).join(' → ')}
            {deck.energyType && <span className="type-badge">{deck.energyType}</span>}
          </p>
        </div>
        <CopyButton text={exportList(deck.cards, catalog)} />
      </header>

      {showOwnership && (
        <p className="deck-owned">
          You own <strong>{deck.ownedCopies}</strong> of 60 cards
          {missingTotal > 0 ? ` — ${missingTotal} to find.` : ' — ready to play.'}
        </p>
      )}

      {breakdown && (
        <dl className="deck-breakdown" aria-label="Why this deck ranks here">
          <div>
            <dt>Cards owned</dt>
            <dd>{pct(breakdown.owned)}</dd>
          </div>
          <div>
            <dt>Line owned</dt>
            <dd>{pct(breakdown.line)}</dd>
          </div>
          <div>
            <dt>Trainers owned</dt>
            <dd>{pct(breakdown.trainers)}</dd>
          </div>
          <div>
            <dt>Attack strength</dt>
            <dd>{pct(breakdown.strength)}</dd>
          </div>
        </dl>
      )}

      {deck.violations.length > 0 && (
        <ul className="deck-violations">
          {deck.violations.map((v) => (
            <li key={v.code}>{v.message}</li>
          ))}
        </ul>
      )}

      <details className="deck-list">
        <summary>Full list</summary>
        {[...bySlot].map(([slot, lines]) => (
          <section key={slot}>
            <h4>{SLOT_LABELS[slot]}</h4>
            <ul>
              {lines.map((l) => (
                <li key={l.card.id}>
                  <span className="count">{l.count}×</span> {l.card.name}
                  {showOwnership && l.owned < l.count && (
                    <span className="need"> — own {l.owned}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </details>

      {showOwnership && deck.missing.length > 0 && (
        <details className="deck-list">
          <summary>Cards to find ({missingTotal})</summary>
          <ul>
            {deck.missing.map((m) => (
              <li key={m.card.id}>
                <span className="count">{m.need}×</span> {m.card.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
