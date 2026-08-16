// Row shape as stored in SQLite. Several fields (colors, color_identity,
// keywords, creature_types) are stored as JSON-encoded strings because
// better-sqlite3 has no native array/object column type — keeping the
// schema flat like this is the simplest thing that works for a solo project.
export interface CardRow {
  oracle_id: string;
  name: string;
  name_lower: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  oracle_text: string | null;
  colors: string; // JSON string[]
  color_identity: string; // JSON string[]
  keywords: string; // JSON string[]
  creature_types: string; // JSON string[]
  power: string | null; // string, not number — can be "*" or "1+*"
  toughness: string | null;
  scryfall_uri: string | null;
  // Partner-family ability (rule 702.124), detected from oracle text at
  // import time. See services/partners.ts for how these combine into pairs.
  partner_ability:
    | 'partner'
    | 'partner_with'
    | 'partner_suffix'
    | 'friends_forever'
    | 'choose_background'
    | 'doctors_companion'
    | null;
  // "partner with [Name]"'s target name, or "Partner—[text]"'s suffix —
  // both lowercased. Null for every other ability (including plain partner).
  partner_target: string | null;
  // A legendary Background enchantment (702.124m) — never itself
  // is_commander_eligible; only ever a commander paired via
  // "choose a Background".
  is_background: number; // 0 | 1
  legality_commander: string; // "legal" | "banned" | "not_legal" | "restricted"
  game_changer: number; // 0 | 1
  is_legendary: number; // 0 | 1
  is_commander_eligible: number; // 0 | 1
  image_uri: string | null;
  // Second face of a true two-sided card (transform/modal_dfc), for the
  // art preview's flip control. Null for single-faced cards — and possibly
  // `undefined` at runtime against a database seeded before these columns
  // existed, which reads as "no back face" either way.
  back_image_uri: string | null;
  back_name: string | null;
}
