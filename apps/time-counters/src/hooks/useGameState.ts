import { useCallback, useEffect, useState } from 'react';
import type {
  CardData,
  CommanderId,
  Commanders,
  Direction,
  GameState,
  LogEntry,
  Mechanic,
  TrackedCard,
  TurnChange,
} from '../types';
import { COMMANDER_NAME } from '../utils/commanders';
import {
  MECHANIC_LABEL,
  chapterRoman,
  defaultResolveNote,
  hasHitTarget,
  newlyTriggeredChapters,
  turnStepForMechanic,
  usesTimeCounters,
} from '../utils/counters';
import { clearState, loadState, saveState } from '../utils/storage';

const INITIAL_COMMANDERS: Commanders = {
  tenthDoctor: { castCount: 0, onBattlefield: false },
  roseTyler: { castCount: 0, timeCounters: 0, onBattlefield: false },
};

const INITIAL_STATE: GameState = { turn: 1, cards: [], log: [], commanders: INITIAL_COMMANDERS };

/** The log is a session history, not an unbounded database — oldest entries drop first. */
const MAX_LOG_ENTRIES = 300;

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Counters are whole numbers, never negative, and an increment Custom
 * counter with a known target can't be pushed past it — that would
 * represent a game state that can't actually happen.
 */
function clampCount(count: number, direction: Direction, targetCount?: number): number {
  const rounded = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (direction === 'increment' && targetCount != null) return Math.min(rounded, targetCount);
  return rounded;
}

function mechanicName(mechanic: Mechanic, customLabel?: string): string {
  return mechanic === 'custom' ? customLabel || 'Custom' : MECHANIC_LABEL[mechanic];
}

/**
 * A manual count edit can jump (or drop back) a Saga's lore count by more
 * than one step — catching up several missed turns at once, say. This fires
 * every chapter ability the jump crosses, not just the one it lands on,
 * the same way nextTurn's own precombat-main step does — a manual edit is
 * how the player syncs the app to what already happened at the table, so
 * those chapters really did trigger even though nextTurn never ran for
 * them. Moving the count backward never un-triggers a chapter already
 * recorded — newlyTriggeredChapters only looks forward from `from`.
 */
function catchUpSagaChapters(
  card: TrackedCard,
  to: number,
): { triggeredChapters: number[] | undefined; logSuffix: string } {
  if (card.mechanic !== 'saga' || !card.chapters) {
    return { triggeredChapters: card.triggeredChapters, logSuffix: '' };
  }
  const triggeredNow = newlyTriggeredChapters(
    card.chapters,
    card.count,
    to,
    card.triggeredChapters ?? [],
  );
  if (triggeredNow.length === 0) {
    return { triggeredChapters: card.triggeredChapters, logSuffix: '' };
  }
  return {
    triggeredChapters: [...(card.triggeredChapters ?? []), ...triggeredNow.map((t) => t.number)],
    logSuffix: ` — triggers Chapter ${triggeredNow.map((t) => chapterRoman(t.number)).join(', ')}`,
  };
}

/** Appends a log entry, dropping the oldest once the cap is hit. */
function appendLog(log: LogEntry[], entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry[] {
  const next = [...log, { ...entry, id: makeId(), timestamp: Date.now() }];
  return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
}

export interface AddCardInput {
  card: CardData;
  mechanic: Mechanic;
  customLabel?: string;
  startingCount: number;
  direction: Direction;
  targetCount?: number;
  autoAdjust: boolean;
  resolveNote?: string;
  /** Saga only — chapter I, II, III... text, one entry per chapter. */
  chapters?: string[];
}

/** A Time Travel choice targets either a tracked card (by instanceId) or Rose Tyler's own Bad Wolf time counters (the 'rose' sentinel). */
export type TimeTravelTargetId = string | 'rose';

/**
 * The persisted game plus the most recent upkeep summary, held together in
 * one object so that advancing the turn and recording what changed happen in
 * a single atomic update. Every mutation below derives its next value from
 * `prev` rather than from a render-time snapshot — otherwise two taps landing
 * in the same batch would both compute from the same stale base, and the
 * second would silently overwrite the first.
 */
interface TrackerState {
  game: GameState;
  lastUpkeep: TurnChange[] | null;
  /** The most recently removed card and where it sat, so removeCard's ~20px
   * × button (and ChangeSummaryModal's Resolve action, which shares the same
   * function) has a way back. Single-level — a second removal overwrites it. */
  lastRemoved: { card: TrackedCard; index: number } | null;
}

export function useGameState() {
  const [{ game, lastUpkeep, lastRemoved }, setTracker] = useState<TrackerState>(() => ({
    game: loadState() ?? INITIAL_STATE,
    lastUpkeep: null,
    lastRemoved: null,
  }));

  useEffect(() => {
    saveState(game);
  }, [game]);

  const addCard = useCallback((input: AddCardInput) => {
    setTracker((prev) => {
      const tracked: TrackedCard = {
        instanceId: makeId(),
        cardId: input.card.id,
        name: input.card.name,
        imageSmall: input.card.imageSmall,
        mechanic: input.mechanic,
        customLabel: input.customLabel,
        count: clampCount(input.startingCount, input.direction, input.targetCount),
        startingCount: input.startingCount,
        direction: input.direction,
        targetCount: input.targetCount,
        autoAdjust: input.autoAdjust,
        resolveNote: input.resolveNote?.trim() || defaultResolveNote(input.mechanic),
        turnAdded: prev.game.turn,
        isToken: input.card.isToken,
        chapters: input.mechanic === 'saga' ? input.chapters : undefined,
        triggeredChapters: input.mechanic === 'saga' ? [] : undefined,
      };
      const log = appendLog(prev.game.log, {
        turn: prev.game.turn,
        title: tracked.isToken ? 'Token created' : 'Added to tracker',
        detail: `${tracked.name} — ${mechanicName(tracked.mechanic, tracked.customLabel)}, starting at ${tracked.count}`,
      });
      return { ...prev, game: { ...prev.game, cards: [...prev.game.cards, tracked], log } };
    });
  }, []);

  /** Drops the card from the board and from any upkeep summary still on screen. */
  const removeCard = useCallback((instanceId: string) => {
    setTracker((prev) => {
      const index = prev.game.cards.findIndex((c) => c.instanceId === instanceId);
      const card = index === -1 ? undefined : prev.game.cards[index];
      let log = prev.game.log;
      if (card) {
        const resolved = hasHitTarget(card);
        log = appendLog(log, {
          turn: prev.game.turn,
          title: resolved ? 'Resolved' : 'Removed',
          detail: resolved
            ? `${card.name} — ${card.resolveNote}`
            : `${card.name} removed from tracker`,
        });
      }
      return {
        game: {
          ...prev.game,
          cards: prev.game.cards.filter((c) => c.instanceId !== instanceId),
          log,
        },
        lastUpkeep: prev.lastUpkeep?.filter((c) => c.instanceId !== instanceId) ?? null,
        lastRemoved: card ? { card, index } : prev.lastRemoved,
      };
    });
  }, []);

  /** Puts the most recently removed card back where it sat. No-op once dismissed or replaced by a newer removal. */
  const undoRemove = useCallback(() => {
    setTracker((prev) => {
      if (!prev.lastRemoved) return prev;
      const { card, index } = prev.lastRemoved;
      const cards = [...prev.game.cards];
      cards.splice(Math.min(index, cards.length), 0, card);
      const log = appendLog(prev.game.log, {
        turn: prev.game.turn,
        title: 'Undo',
        detail: `${card.name} restored to tracker`,
      });
      return { ...prev, game: { ...prev.game, cards, log }, lastRemoved: null };
    });
  }, []);

  /** Hides the undo prompt without restoring the card — the window to undo has closed. */
  const dismissLastRemoved = useCallback(() => {
    setTracker((prev) => (prev.lastRemoved ? { ...prev, lastRemoved: null } : prev));
  }, []);

  /** Manual override — set a card's counters to an exact value. */
  const setCount = useCallback((instanceId: string, count: number) => {
    setTracker((prev) => {
      let log = prev.game.log;
      const cards = prev.game.cards.map((c) => {
        if (c.instanceId !== instanceId) return c;
        const to = clampCount(count, c.direction, c.targetCount);
        if (to === c.count) return c;
        const { triggeredChapters, logSuffix } = catchUpSagaChapters(c, to);
        log = appendLog(log, {
          turn: prev.game.turn,
          title: 'Manual edit',
          detail: `${c.name} set to ${to} (was ${c.count})${logSuffix}`,
        });
        // A manual edit restoring counters means it no longer holds that a
        // fade-counter removal failed — but reaching 0 by hand isn't the
        // rule's actual upkeep trigger, so this never *sets* the flag, only
        // clears it (see hasHitTarget in utils/counters.ts).
        const fadeExhausted = c.mechanic === 'fading' && to > 0 ? false : c.fadeExhausted;
        return { ...c, count: to, fadeExhausted, triggeredChapters };
      });
      return { ...prev, game: { ...prev.game, cards, log } };
    });
  }, []);

  /**
   * Manual override — step a card's counters up or down. The arithmetic runs
   * against `prev`, so rapid +/− taps accumulate instead of each recomputing
   * from the same rendered count.
   */
  const adjustCount = useCallback((instanceId: string, delta: number) => {
    setTracker((prev) => {
      let log = prev.game.log;
      const cards = prev.game.cards.map((c) => {
        if (c.instanceId !== instanceId) return c;
        const to = clampCount(c.count + delta, c.direction, c.targetCount);
        if (to === c.count) return c;
        const { triggeredChapters, logSuffix } = catchUpSagaChapters(c, to);
        log = appendLog(log, {
          turn: prev.game.turn,
          title: 'Manual adjustment',
          detail: `${c.name} ${to > c.count ? '+1' : '−1'} → ${to}${logSuffix}`,
        });
        // See setCount above: restoring counters by hand clears the failed-
        // removal flag, but reaching 0 this way never sets it.
        const fadeExhausted = c.mechanic === 'fading' && to > 0 ? false : c.fadeExhausted;
        return { ...c, count: to, fadeExhausted, triggeredChapters };
      });
      return { ...prev, game: { ...prev.game, cards, log } };
    });
  }, []);

  const setTurn = useCallback((turn: number) => {
    const safe = Number.isFinite(turn) ? Math.max(1, Math.round(turn)) : 1;
    setTracker((prev) => {
      if (safe === prev.game.turn) return prev;
      const log = appendLog(prev.game.log, {
        turn: safe,
        title: 'Turn changed',
        detail: `Turn set to ${safe} (was ${prev.game.turn})`,
      });
      return { ...prev, game: { ...prev.game, turn: safe, log } };
    });
  }, []);

  /**
   * Advances to the player's next turn. This runs the two turn steps that
   * matter for the mechanics this app tracks, in the order they actually
   * happen, as one atomic update:
   *
   * 1. Upkeep — Suspend, Vanishing, and Fading counters tick down one step.
   * 2. Precombat main — each tracked Saga gains a lore counter, and any
   *    chapter ability that lore count newly reaches triggers individually
   *    (not just the final one), matching how Sagas actually work: a
   *    chapter ability triggers the moment its number is reached, well
   *    before the Saga is sacrificed at the end of its final chapter.
   *
   * A card that has already hit its target is left alone rather than
   * re-triggering. The summary of what changed is stored alongside the new
   * game state so the two can never disagree.
   *
   * This is distinct from the Time Travel keyword action (see
   * applyTimeTravel below): Next Turn is the automatic, once-per-turn
   * upkeep/precombat-main trigger every tracked mechanic has on its own.
   * Time Travel is a separate, optional effect specific cards grant — it
   * isn't tied to the turn counter at all.
   */
  const nextTurn = useCallback(() => {
    setTracker((prev) => {
      const changes: TurnChange[] = [];

      // Step 1 — upkeep: Suspend/Vanishing/Fading count down.
      const afterUpkeep = prev.game.cards.map((c) => {
        if (turnStepForMechanic(c.mechanic) !== 'upkeep' || !c.autoAdjust || hasHitTarget(c)) {
          return c;
        }

        // CR 702.32b: Fading removes a fade counter at upkeep same as the
        // others, but only sacrifices once removal *fails* — the upkeep
        // after the count already reached 0, not the upkeep it gets there.
        if (c.mechanic === 'fading' && c.count <= 0) {
          changes.push({
            instanceId: c.instanceId,
            name: c.name,
            mechanic: c.mechanic,
            step: 'upkeep',
            from: c.count,
            to: c.count,
            hitTarget: true,
            resolveNote: c.resolveNote,
          });
          return { ...c, fadeExhausted: true };
        }

        const to = clampCount(
          c.count + (c.direction === 'decrement' ? -1 : 1),
          c.direction,
          c.targetCount,
        );
        changes.push({
          instanceId: c.instanceId,
          name: c.name,
          mechanic: c.mechanic,
          step: 'upkeep',
          from: c.count,
          to,
          // A successful removal is never itself the sacrifice trigger, even
          // when it brings a Fading card to exactly 0 — see the branch above.
          hitTarget:
            c.mechanic === 'fading'
              ? false
              : hasHitTarget({
                  mechanic: c.mechanic,
                  count: to,
                  direction: c.direction,
                  targetCount: c.targetCount,
                }),
          resolveNote: c.resolveNote,
        });
        return { ...c, count: to };
      });

      // Step 2 — precombat main: Sagas gain a lore counter; crossed chapters trigger.
      const cards = afterUpkeep.map((c) => {
        if (
          turnStepForMechanic(c.mechanic) !== 'precombatMain' ||
          !c.autoAdjust ||
          hasHitTarget(c)
        ) {
          return c;
        }
        const to = clampCount(c.count + 1, c.direction, c.targetCount);
        const chapters = c.chapters ?? [];
        const triggeredNow = newlyTriggeredChapters(
          chapters,
          c.count,
          to,
          c.triggeredChapters ?? [],
        );
        const hitTarget = hasHitTarget({
          mechanic: c.mechanic,
          count: to,
          direction: c.direction,
          targetCount: c.targetCount,
        });
        if (triggeredNow.length === 0) {
          changes.push({
            instanceId: c.instanceId,
            name: c.name,
            mechanic: c.mechanic,
            step: 'precombatMain',
            from: c.count,
            to,
            hitTarget,
            resolveNote: c.resolveNote,
          });
        } else {
          for (const chapter of triggeredNow) {
            changes.push({
              instanceId: c.instanceId,
              name: c.name,
              mechanic: c.mechanic,
              step: 'precombatMain',
              from: c.count,
              to,
              hitTarget: hitTarget && chapter.number === chapters.length,
              resolveNote: c.resolveNote,
              chapter,
            });
          }
        }
        return {
          ...c,
          count: to,
          triggeredChapters: [...(c.triggeredChapters ?? []), ...triggeredNow.map((t) => t.number)],
        };
      });

      const turn = prev.game.turn + 1;
      const log = appendLog(prev.game.log, {
        turn,
        title: 'Next Turn — upkeep & precombat main',
        detail: changes.length === 0 ? 'No auto-adjusting cards to update.' : undefined,
        changes: changes.map((c) => ({
          name: c.name,
          mechanic: c.mechanic,
          from: c.from,
          to: c.to,
        })),
      });
      return {
        ...prev,
        game: { ...prev.game, turn, cards, log },
        // Only interrupt the player when something actually happened.
        lastUpkeep: changes.length > 0 ? changes : null,
      };
    });
  }, []);

  /**
   * Time Travel keyword action: "For each suspended card you own and each
   * permanent you control with a time counter on it, you may add or remove
   * a time counter." Each choice is capped to exactly one counter in either
   * direction — this isn't a free stepper, it's one pass of the real
   * keyword's per-object choice. Unlike Next Turn this never touches the
   * turn counter, and the +1/−1 choice isn't limited by a card's own
   * direction — the keyword can add a counter to a Suspend card just as
   * freely as removing one.
   *
   * Only Suspend and Vanishing cards are eligible targets — Fading uses
   * fade counters and Saga uses lore counters, neither of which is a time
   * counter (see usesTimeCounters in utils/counters.ts), so the caller
   * (TimeTravelPanel via App.tsx) never offers them a choice here. Rose
   * Tyler's own Bad Wolf time counters are a legitimate target too — she's
   * "a permanent you control with a time counter on it" — passed with the
   * 'rose' sentinel id instead of a card instanceId.
   */
  const applyTimeTravel = useCallback(
    (
      choices: { id: TimeTravelTargetId; delta: -1 | 0 | 1 }[],
      passInfo: { current: number; total: number },
    ) => {
      setTracker((prev) => {
        const nonZero = choices.filter((c) => c.delta !== 0);
        const logChanges: { name: string; mechanic: Mechanic; from: number; to: number }[] = [];

        const cards = prev.game.cards.map((c) => {
          const choice = nonZero.find((d) => d.id === c.instanceId);
          if (!choice) return c;
          const to = clampCount(c.count + choice.delta, c.direction, c.targetCount);
          if (to !== c.count)
            logChanges.push({ name: c.name, mechanic: c.mechanic, from: c.count, to });
          return { ...c, count: to };
        });

        let commanders = prev.game.commanders;
        const roseChoice = nonZero.find((d) => d.id === 'rose');
        if (roseChoice) {
          const from = commanders.roseTyler.timeCounters;
          const to = Math.max(0, from + roseChoice.delta);
          if (to !== from) {
            logChanges.push({
              name: 'Rose Tyler — Bad Wolf counters',
              mechanic: 'custom',
              from,
              to,
            });
            commanders = {
              ...commanders,
              roseTyler: { ...commanders.roseTyler, timeCounters: to },
            };
          }
        }

        const log = appendLog(prev.game.log, {
          turn: prev.game.turn,
          title: `Time Travel — pass ${passInfo.current} of ${passInfo.total}`,
          detail: logChanges.length === 0 ? 'No counters added or removed this pass.' : undefined,
          changes: logChanges,
        });
        return { ...prev, game: { ...prev.game, cards, commanders, log } };
      });
    },
    [],
  );

  const dismissUpkeep = useCallback(() => {
    setTracker((prev) => (prev.lastUpkeep === null ? prev : { ...prev, lastUpkeep: null }));
  }, []);

  /**
   * Records a cast of a commander from the command zone — the only thing
   * that increases its tax (rule 903.10): +{2} for each *previous* cast
   * this game, so the number shown after this call is what the *next* cast
   * will add. Casting always puts the commander onto the battlefield, so it
   * now shows up as a card on the board until it leaves again.
   */
  const castCommander = useCallback((id: CommanderId) => {
    setTracker((prev) => {
      const commander = prev.game.commanders[id];
      const castCount = commander.castCount + 1;
      const name = COMMANDER_NAME[id];
      const log = appendLog(prev.game.log, {
        turn: prev.game.turn,
        title: 'Cast from command zone',
        detail: `${name} — cast ${castCount} time${castCount === 1 ? '' : 's'} this game; next cast costs an extra {${castCount * 2}}.`,
      });
      return {
        ...prev,
        game: {
          ...prev.game,
          commanders: {
            ...prev.game.commanders,
            [id]: { ...commander, castCount, onBattlefield: true },
          },
          log,
        },
      };
    });
  }, []);

  /**
   * A commander leaving the battlefield for the command zone is a choice
   * the owner makes, not something rules-forced — this app just tracks that
   * it happened. Unlike castCommander, this never touches castCount: the
   * command-zone tax (rule 903.10) accumulates for the whole game and isn't
   * reset by zone changes.
   */
  const returnCommanderToCommandZone = useCallback((id: CommanderId) => {
    setTracker((prev) => {
      const commander = prev.game.commanders[id];
      if (!commander.onBattlefield) return prev;
      const log = appendLog(prev.game.log, {
        turn: prev.game.turn,
        title: 'Returned to command zone',
        detail: `${COMMANDER_NAME[id]} left the battlefield for the command zone.`,
      });
      return {
        ...prev,
        game: {
          ...prev.game,
          commanders: { ...prev.game.commanders, [id]: { ...commander, onBattlefield: false } },
          log,
        },
      };
    });
  }, []);

  /** Manual override for Rose Tyler's own Bad Wolf time counters (she gets +1/+1 per counter). */
  const adjustRoseTimeCounters = useCallback((delta: number) => {
    setTracker((prev) => {
      const from = prev.game.commanders.roseTyler.timeCounters;
      const to = Math.max(0, from + delta);
      if (to === from) return prev;
      const log = appendLog(prev.game.log, {
        turn: prev.game.turn,
        title: 'Manual adjustment',
        detail: `Rose Tyler's Bad Wolf counters ${to > from ? '+1' : '−1'} → ${to}`,
      });
      return {
        ...prev,
        game: {
          ...prev.game,
          commanders: {
            ...prev.game.commanders,
            roseTyler: { ...prev.game.commanders.roseTyler, timeCounters: to },
          },
          log,
        },
      };
    });
  }, []);

  /**
   * Rose Tyler's Bad Wolf: "Whenever Rose Tyler attacks, put a time counter
   * on it for each suspended card you own and each other permanent you
   * control with a time counter on it." Two clauses with different
   * conditions: a suspended card counts unconditionally — it's still
   * "suspended" regardless of how many time counters remain on it — while
   * the second clause is explicitly about permanents *with a time counter
   * on them*, so a tracked Vanishing card with none left doesn't qualify.
   * Fading and Saga never count either way (neither uses time counters —
   * see usesTimeCounters). Adds that many counters to Rose in one step
   * instead of the player counting the board by hand.
   */
  const roseAttacks = useCallback(() => {
    setTracker((prev) => {
      const contributing = prev.game.cards.filter(
        (c) => c.mechanic === 'suspend' || (usesTimeCounters(c.mechanic) && c.count > 0),
      );
      const gained = contributing.length;
      const from = prev.game.commanders.roseTyler.timeCounters;
      const to = from + gained;
      const log = appendLog(prev.game.log, {
        turn: prev.game.turn,
        title: 'Bad Wolf — Rose Tyler attacks',
        detail:
          gained === 0
            ? 'No suspended cards or time-counter permanents to count — no counters added.'
            : `+${gained} time counter${gained === 1 ? '' : 's'} (${contributing.map((c) => c.name).join(', ')}) → Rose Tyler now has ${to}.`,
      });
      return {
        ...prev,
        game: {
          ...prev.game,
          commanders: {
            ...prev.game.commanders,
            roseTyler: { ...prev.game.commanders.roseTyler, timeCounters: to },
          },
          log,
        },
      };
    });
  }, []);

  const resetGame = useCallback(() => {
    clearState();
    setTracker({ game: INITIAL_STATE, lastUpkeep: null, lastRemoved: null });
  }, []);

  return {
    state: game,
    lastUpkeep,
    lastRemoved,
    addCard,
    removeCard,
    undoRemove,
    dismissLastRemoved,
    setCount,
    adjustCount,
    setTurn,
    nextTurn,
    applyTimeTravel,
    dismissUpkeep,
    castCommander,
    returnCommanderToCommandZone,
    adjustRoseTimeCounters,
    roseAttacks,
    resetGame,
  };
}
