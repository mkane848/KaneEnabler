/**
 * Bumped whenever import-scryfall (or anything it reads — eligibility,
 * cardNames, the table schemas) changes in a way that would produce a
 * different database from identical input.
 *
 * This exists because skipping an import on unchanged *data* is only safe if
 * the *code* is also unchanged. Without it, editing an import rule and
 * re-running would appear to succeed while silently keeping the old
 * database — the worst kind of bug, because everything downstream looks
 * fine and is wrong.
 *
 * If you touch import logic and don't bump this, your change won't take
 * effect on any machine that already has a current database.
 *
 * The sibling question — *is the file on disk current?* — now lives in
 * `@mtg/scryfall` (`readSidecar`/`diskHasSnapshot`), shared with
 * time-counters' own fetch script. This one stays here: it depends on this
 * app's own import code, which that package knows nothing about. See
 * `importedSnapshot.ts` for the *was the database built from that file, by
 * this version of the import?* question this version number answers.
 */
export const IMPORT_VERSION = 9;
