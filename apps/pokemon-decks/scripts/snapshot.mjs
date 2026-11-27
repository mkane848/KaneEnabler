// @ts-check
/**
 * Turns TCGdex's raw cards (tcgdexSource.mjs) into the app's snapshot: English
 * only, trimmed to the fields the app and @ptcg/rules read, grouped by series.
 *
 * The field set mirrors `PtcgCard` in packages/ptcg-rules/src/card.ts — change
 * them together.
 */

/** @param {unknown} v @returns {string | undefined} */
const en = (v) =>
  v && typeof v === 'object' && typeof (/** @type {Record<string, unknown>} */ (v).en) === 'string'
    ? /** @type {string} */ (/** @type {Record<string, unknown>} */ (v).en)
    : undefined;

/** @param {unknown} v @returns {string | undefined} */
const str = (v) => (typeof v === 'string' ? v : undefined);

/** @param {unknown} v @returns {number | undefined} */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** @param {unknown} v @returns {string[] | undefined} */
const strings = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length > 0 ? v : undefined;

/**
 * TCGdex carries a stray lowercase `j` and a literal `"None"` among ~8,600
 * marks; both are data-entry noise, not marks.
 * @param {unknown} v
 */
function regulationMark(v) {
  if (typeof v !== 'string') return undefined;
  const mark = v.trim().toUpperCase();
  return /^[A-Z]$/.test(mark) ? mark : undefined;
}

/** Drops undefined fields so the JSON stays small and diffs stay quiet. */
function compact(/** @type {Record<string, unknown>} */ obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * @param {import('./tcgdexSource.mjs').RawCard} raw
 */
export function trimCard(raw) {
  const { card, set, localId } = raw;
  const name = en(card.name);
  if (!name) return null;

  const attacks = Array.isArray(card.attacks)
    ? card.attacks.map((a) =>
        compact({
          name: en(a?.name) ?? '',
          cost: strings(a?.cost) ?? [],
          // Damage is printed as "30", "30+", "×20" … — kept as text; a number
          // only when TCGdex stored one.
          damage: typeof a?.damage === 'number' ? String(a.damage) : str(a?.damage),
          effect: en(a?.effect),
        }),
      )
    : undefined;
  const abilities = Array.isArray(card.abilities)
    ? card.abilities.map((a) =>
        compact({
          type: str(a?.type) ?? 'Ability',
          name: en(a?.name) ?? '',
          effect: en(a?.effect) ?? '',
        }),
      )
    : undefined;

  return compact({
    id: `${set.id}-${localId}`,
    setId: set.id,
    localId,
    name,
    category: str(card.category),
    rarity: str(card.rarity),
    stage: str(card.stage),
    suffix: str(card.suffix),
    hp: num(card.hp),
    types: strings(card.types),
    evolveFrom: en(card.evolveFrom),
    abilities: abilities?.length ? abilities : undefined,
    attacks: attacks?.length ? attacks : undefined,
    retreat: num(card.retreat),
    effect: en(card.effect),
    trainerType: str(card.trainerType),
    energyType: str(card.energyType),
    regulationMark: regulationMark(card.regulationMark),
  });
}

/**
 * localIds are mostly numeric ("001", "57") but not always ("SM85", "TG01",
 * "57a"); numeric-aware comparison keeps "9" before "10" without choking.
 */
const byLocalId = new Intl.Collator('en', { numeric: true }).compare;

/** @param {unknown} filter */
function readFilter(filter) {
  const f = /** @type {any} */ (filter ?? {});
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.map(String) : []);
  return {
    includes: {
      series: list(f.includes?.series),
      sets: list(f.includes?.sets),
      regulationMarks: list(f.includes?.regulationMark).map((m) => m.toUpperCase()),
    },
    excludes: { sets: list(f.excludes?.sets), cards: list(f.excludes?.cards) },
  };
}

/**
 * @param {import('./tcgdexSource.mjs').RawCard[]} rawCards
 * @param {Record<string, unknown>} legals  meta/legals.ts's named exports
 * @param {{ repo: string, commit: string, committedAt: string }} source
 */
export function buildSnapshot(rawCards, legals, source) {
  /** @type {Map<string, { id: string, name: string, serieId: string, code?: string, releaseDate?: string, official?: number }>} */
  const sets = new Map();
  /** @type {Map<string, { id: string, name: string }>} */
  const seriesInfo = new Map();
  /** @type {Map<string, { card: Record<string, unknown>, releaseDate: string }[]>} */
  const bySeries = new Map();

  for (const raw of rawCards) {
    const card = trimCard(raw);
    if (!card) continue;
    const serieId = raw.serie.id;
    const releaseDate = typeof raw.set.releaseDate === 'string' ? raw.set.releaseDate : '';
    if (!seriesInfo.has(serieId)) {
      seriesInfo.set(serieId, { id: serieId, name: en(raw.serie.name) ?? serieId });
    }
    if (!sets.has(raw.set.id)) {
      const abbr = /** @type {Record<string, unknown> | undefined} */ (raw.set.abbreviations);
      const count = /** @type {Record<string, unknown> | undefined} */ (raw.set.cardCount);
      sets.set(
        raw.set.id,
        compact({
          id: raw.set.id,
          name: en(raw.set.name) ?? raw.set.id,
          serieId,
          // The code PTCG Live exports print ("DRI" in "4 Iono DRI 185").
          code: str(abbr?.official),
          releaseDate: releaseDate || undefined,
          official: num(count?.official),
        }),
      );
    }
    const list = bySeries.get(serieId) ?? [];
    list.push({ card, releaseDate });
    bySeries.set(serieId, list);
  }

  /** @type {Map<string, Record<string, unknown>[]>} */
  const series = new Map();
  for (const [id, list] of [...bySeries].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort(
      (a, b) =>
        a.releaseDate.localeCompare(b.releaseDate) ||
        String(a.card.setId).localeCompare(String(b.card.setId)) ||
        byLocalId(String(a.card.localId), String(b.card.localId)),
    );
    series.set(
      id,
      list.map((x) => x.card),
    );
  }

  const cardCount = [...series.values()].reduce((n, list) => n + list.length, 0);
  const index = {
    source: { ...source, licence: 'MIT', attribution: 'Card data from TCGdex (tcgdex.dev)' },
    cardCount,
    // Which regulation marks each series carries, so the app can fetch only
    // the series a format can draw from (Standard needs two of twenty).
    series: [...seriesInfo.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((info) => ({
        ...info,
        cardCount: series.get(info.id)?.length ?? 0,
        regulationMarks: [
          ...new Set(
            (series.get(info.id) ?? [])
              .map((c) => c.regulationMark)
              .filter((m) => typeof m === 'string'),
          ),
        ].sort(),
      })),
    sets: [...sets.values()].sort(
      (a, b) =>
        (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '') || a.id.localeCompare(b.id),
    ),
    // TCGdex's own legality filters (meta/legals.ts), vendored as data.
    // @ptcg/rules interprets them; nothing here decides legality.
    legality: { standard: readFilter(legals.standard), expanded: readFilter(legals.expanded) },
  };
  return { index, series };
}
