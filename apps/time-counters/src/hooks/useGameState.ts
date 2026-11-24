import { useCallback, useEffect, useReducer } from 'react';
import { commanderTax, hasTimeCounter, turnStepForMechanic } from '@mtg/rules';
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

interface TimeTravelChoice {
  id: TimeTravelTargetId;
  delta: -1 | 0 | 1;
}

interface TimeTravelPassInfo {
  current: number;
  total: number;
}

/**
 * The persisted game plus the two transient overlays, held together so a
 * single reducer transition can't let the game and its summary disagree.
 *
 * The overlays are *informational*, not a state the player is trapped in:
 * `lastUpkeep` is the summary the UI shows after a turn, and `lastRemoved`
 * is the single-level undo window. Neither gates game actions in the
 * reducer — the UI owns that (the summary is a modal with a focus trap) —
 * but every transition here updates them explicitly so "what happens to the
 * overlay when X occurs" has one answer rather than being spread across
 * fifteen callbacks.
 */
interface TrackerState {
  game: GameState;
  lastUpkeep: TurnChange[] | null;
  /** The most recently removed card and where it sat, so removeCard's ~20px
   * × button (and ChangeSummaryModal's Resolve action, which shares the same
   * function) has a way back. Single-level — a second removal overwrites it. */
  lastRemoved: { card: TrackedCard; index: number } | null;
}

const INITIAL_TRACKER_STATE: TrackerState = {
  game: INITIAL_STATE,
  lastUpkeep: null,
  lastRemoved: null,
};

function initTrackerState(): TrackerState {
  return { game: loadState() ?? INITIAL_STATE, lastUpkeep: null, lastRemoved: null };
}

type GameAction =
  | { type: 'addCard'; input: AddCardInput }
  | { type: 'removeCard'; instanceId: string }
  | { type: 'undoRemove' }
  | { type: 'dismissLastRemoved' }
  | { type: 'setCount'; instanceId: string; count: number }
  | { type: 'adjustCount'; instanceId: string; delta: number }
  | { type: 'setTurn'; turn: number }
  | { type: 'nextTurn' }
  | { type: 'applyTimeTravel'; choices: TimeTravelChoice[]; passInfo: TimeTravelPassInfo }
  | { type: 'dismissUpkeep' }
  | { type: 'castCommander'; id: CommanderId }
  | { type: 'returnCommanderToCommandZone'; id: CommanderId }
  | { type: 'adjustRoseTimeCounters'; delta: number }
  | { type: 'roseAttacks' }
  | { type: 'resetGame' };

function gameReducer(state: TrackerState, action: GameAction): TrackerState {
  switch (action.type) {
    case 'addCard': {
      const { input } = action;
      const count = clampCount(input.startingCount, input.direction, input.targetCount);
      const tracked: TrackedCard = {
        instanceId: makeId(),
        cardId: input.card.id,
        name: input.card.name,
        imageSmall: input.card.imageSmall,
        mechanic: input.mechanic,
        customLabel: input.customLabel,
        count,
        startingCount: input.startingCount,
        direction: input.direction,
        targetCount: input.targetCount,
        autoAdjust: input.autoAdjust,
        resolveNote: input.resolveNote?.trim() || defaultResolveNote(input.mechanic),
        turnAdded: state.game.turn,
        isToken: input.card.isToken,
        chapters: input.mechanic === 'saga' ? input.chapters : undefined,
        // Chapters at or below the starting lore count have already triggered;
        // record them so an edit back across them can't fire them a second time.
        triggeredChapters:
          input.mechanic === 'saga'
            ? Array.from({ length: Math.min(count, input.chapters?.length ?? 0) }, (_, i) => i + 1)
            : undefined,
      };
      const log = appendLog(state.game.log, {
        turn: state.game.turn,
        title: tracked.isToken ? 'Token created' : 'Added to tracker',
        detail: `${tracked.name} — ${mechanicName(tracked.mechanic, tracked.customLabel)}, starting at ${tracked.count}`,
      });
      return { ...state, game: { ...state.game, cards: [...state.game.cards, tracked], log } };
    }

    case 'removeCard': {
      const index = state.game.cards.findIndex((c) => c.instanceId === action.instanceId);
      const card = index === -1 ? undefined : state.game.cards[index];
      let log = state.game.log;
      if (card) {
        const resolved = hasHitTarget(card);
        log = appendLog(log, {
          turn: state.game.turn,
          title: resolved ? 'Resolved' : 'Removed',
          detail: resolved
            ? `${card.name} — ${card.resolveNote}`
            : `${card.name} removed from tracker`,
        });
      }
      return {
        game: {
          ...state.game,
          cards: state.game.cards.filter((c) => c.instanceId !== action.instanceId),
          log,
        },
        lastUpkeep: state.lastUpkeep?.filter((c) => c.instanceId !== action.instanceId) ?? null,
        lastRemoved: card ? { card, index } : state.lastRemoved,
      };
    }

    case 'undoRemove': {
      if (!state.lastRemoved) return state;
      const { card, index } = state.lastRemoved;
      const cards = [...state.game.cards];
      cards.splice(Math.min(index, cards.length), 0, card);
      const log = appendLog(state.game.log, {
        turn: state.game.turn,
        title: 'Undo',
        detail: `${card.name} restored to tracker`,
      });
      return { ...state, game: { ...state.game, cards, log }, lastRemoved: null };
    }

    case 'dismissLastRemoved':
      return state.lastRemoved ? { ...state, lastRemoved: null } : state;

    case 'setCount': {
      let log = state.game.log;
      const cards = state.game.cards.map((c) => {
        if (c.instanceId !== action.instanceId) return c;
        const to = clampCount(action.count, c.direction, c.targetCount);
        if (to === c.count) return c;
        const { triggeredChapters, logSuffix } = catchUpSagaChapters(c, to);
        log = appendLog(log, {
          turn: state.game.turn,
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
      return { ...state, game: { ...state.game, cards, log } };
    }

    case 'adjustCount': {
      let log = state.game.log;
      const cards = state.game.cards.map((c) => {
        if (c.instanceId !== action.instanceId) return c;
        const to = clampCount(c.count + action.delta, c.direction, c.targetCount);
        if (to === c.count) return c;
        const { triggeredChapters, logSuffix } = catchUpSagaChapters(c, to);
        log = appendLog(log, {
          turn: state.game.turn,
          title: 'Manual adjustment',
          detail: `${c.name} ${to > c.count ? '+1' : '−1'} → ${to}${logSuffix}`,
        });
        // See setCount above: restoring counters by hand clears the failed-
        // removal flag, but reaching 0 this way never sets it.
        const fadeExhausted = c.mechanic === 'fading' && to > 0 ? false : c.fadeExhausted;
        return { ...c, count: to, fadeExhausted, triggeredChapters };
      });
      return { ...state, game: { ...state.game, cards, log } };
    }

    case 'setTurn': {
      const safe = Number.isFinite(action.turn) ? Math.max(1, Math.round(action.turn)) : 1;
      if (safe === state.game.turn) return state;
      // Correcting the turn backward is a correction, not a rewind: a card
      // added on a turn that no longer exists is re-anchored to the new turn,
      // so its "added on" turn can't sit in the future or out of log order.
      let reanchored = 0;
      const cards =
        safe < state.game.turn
          ? state.game.cards.map((c) => {
              if (c.turnAdded <= safe) return c;
              reanchored += 1;
              return { ...c, turnAdded: safe };
            })
          : state.game.cards;
      const suffix =
        reanchored > 0
          ? `; ${reanchored} card${reanchored === 1 ? '' : 's'} added later re-anchored`
          : '';
      const log = appendLog(state.game.log, {
        turn: safe,
        title: 'Turn changed',
        detail: `Turn set to ${safe} (was ${state.game.turn})${suffix}`,
      });
      return {
        ...state,
        game: { ...state.game, turn: safe, cards, log },
        lastRemoved: null,
      };
    }

    case 'nextTurn': {
      const changes: TurnChange[] = [];

      // Step 1 — upkeep: Suspend/Vanishing/Fading count down.
      const afterUpkeep = state.game.cards.map((c) => {
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

      const turn = state.game.turn + 1;
      const log = appendLog(state.game.log, {
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
        ...state,
        game: { ...state.game, turn, cards, log },
        // Only interrupt the player when something actually happened.
        lastUpkeep: changes.length > 0 ? changes : null,
        // Time moved on, so the window to undo the last removal has closed.
        lastRemoved: null,
      };
    }

    case 'applyTimeTravel': {
      const { choices, passInfo } = action;
      const nonZero = choices.filter((c) => c.delta !== 0);
      const logChanges: { name: string; mechanic: Mechanic; from: number; to: number }[] = [];

      const cards = state.game.cards.map((c) => {
        const choice = nonZero.find((d) => d.id === c.instanceId);
        if (!choice) return c;
        const to = clampCount(c.count + choice.delta, c.direction, c.targetCount);
        if (to !== c.count)
          logChanges.push({ name: c.name, mechanic: c.mechanic, from: c.count, to });
        return { ...c, count: to };
      });

      let commanders = state.game.commanders;
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

      const log = appendLog(state.game.log, {
        turn: state.game.turn,
        title: `Time Travel — pass ${passInfo.current} of ${passInfo.total}`,
        detail: logChanges.length === 0 ? 'No counters added or removed this pass.' : undefined,
        changes: logChanges,
      });
      // Time Travel changed counters, so undo-the-last-removal would restore
      // a card against counters it has since moved past — close the window.
      return {
        ...state,
        game: { ...state.game, cards, commanders, log },
        lastRemoved: null,
      };
    }

    case 'dismissUpkeep':
      return state.lastUpkeep === null ? state : { ...state, lastUpkeep: null };

    case 'castCommander': {
      const commander = state.game.commanders[action.id];
      // Already on the battlefield: this isn't a cast from the command zone,
      // so it can't add tax. Mirrors returnCommanderToCommandZone's guard.
      if (commander.onBattlefield) return state;
      const castCount = commander.castCount + 1;
      const name = COMMANDER_NAME[action.id];
      const log = appendLog(state.game.log, {
        turn: state.game.turn,
        title: 'Cast from command zone',
        detail: `${name} — cast ${castCount} time${castCount === 1 ? '' : 's'} this game; next cast costs an extra {${commanderTax(castCount)}}.`,
      });
      return {
        ...state,
        game: {
          ...state.game,
          commanders: {
            ...state.game.commanders,
            [action.id]: { ...commander, castCount, onBattlefield: true },
          },
          log,
        },
      };
    }

    case 'returnCommanderToCommandZone': {
      const commander = state.game.commanders[action.id];
      if (!commander.onBattlefield) return state;
      const log = appendLog(state.game.log, {
        turn: state.game.turn,
        title: 'Returned to command zone',
        detail: `${COMMANDER_NAME[action.id]} left the battlefield for the command zone.`,
      });
      return {
        ...state,
        game: {
          ...state.game,
          commanders: {
            ...state.game.commanders,
            [action.id]: { ...commander, onBattlefield: false },
          },
          log,
        },
      };
    }

    case 'adjustRoseTimeCounters': {
      const from = state.game.commanders.roseTyler.timeCounters;
      const to = Math.max(0, from + action.delta);
      if (to === from) return state;
      const log = appendLog(state.game.log, {
        turn: state.game.turn,
        title: 'Manual adjustment',
        detail: `Rose Tyler's Bad Wolf counters ${to > from ? '+1' : '−1'} → ${to}`,
      });
      return {
        ...state,
        game: {
          ...state.game,
          commanders: {
            ...state.game.commanders,
            roseTyler: { ...state.game.commanders.roseTyler, timeCounters: to },
          },
          log,
        },
      };
    }

    case 'roseAttacks': {
      const contributing = state.game.cards.filter((c) => hasTimeCounter(c));
      const gained = contributing.length;
      const from = state.game.commanders.roseTyler.timeCounters;
      const to = from + gained;
      const log = appendLog(state.game.log, {
        turn: state.game.turn,
        title: 'Bad Wolf — Rose Tyler attacks',
        detail:
          gained === 0
            ? 'No suspended cards or time-counter permanents to count — no counters added.'
            : `+${gained} time counter${gained === 1 ? '' : 's'} (${contributing.map((c) => c.name).join(', ')}) → Rose Tyler now has ${to}.`,
      });
      return {
        ...state,
        game: {
          ...state.game,
          commanders: {
            ...state.game.commanders,
            roseTyler: { ...state.game.commanders.roseTyler, timeCounters: to },
          },
          log,
        },
      };
    }

    case 'resetGame':
      return INITIAL_TRACKER_STATE;

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function useGameState() {
  const [tracker, dispatch] = useReducer(gameReducer, null, initTrackerState);
  const { game, lastUpkeep, lastRemoved } = tracker;

  useEffect(() => {
    saveState(game);
  }, [game]);

  const addCard = useCallback(
    (input: AddCardInput) => dispatch({ type: 'addCard', input }),
    [],
  );
  /** Drops the card from the board and from any upkeep summary still on screen. */
  const removeCard = useCallback(
    (instanceId: string) => dispatch({ type: 'removeCard', instanceId }),
    [],
  );
  /** Puts the most recently removed card back where it sat. No-op once dismissed or replaced by a newer removal. */
  const undoRemove = useCallback(() => dispatch({ type: 'undoRemove' }), []);
  /** Hides the undo prompt without restoring the card — the window to undo has closed. */
  const dismissLastRemoved = useCallback(() => dispatch({ type: 'dismissLastRemoved' }), []);
  /** Manual override — set a card's counters to an exact value. */
  const setCount = useCallback(
    (instanceId: string, count: number) => dispatch({ type: 'setCount', instanceId, count }),
    [],
  );
  /**
   * Manual override — step a card's counters up or down. The arithmetic runs
   * against the reducer's current state, so rapid +/− taps accumulate
   * instead of each recomputing from the same rendered count.
   */
  const adjustCount = useCallback(
    (instanceId: string, delta: number) => dispatch({ type: 'adjustCount', instanceId, delta }),
    [],
  );
  const setTurn = useCallback((turn: number) => dispatch({ type: 'setTurn', turn }), []);
  /**
   * Advances to the player's next turn. The reducer runs the two turn steps
   * that matter for the mechanics this app tracks, in the order they actually
   * happen, as one atomic transition:
   *
   * 1. Upkeep — Suspend, Vanishing, and Fading counters tick down one step.
   * 2. Precombat main — each tracked Saga gains a lore counter, and any
   *    chapter ability that lore count newly reaches triggers individually
   *    (not just the final one), matching how Sagas actually work: a
   *    chapter ability triggers the moment its number is reached, well
   *    before the Saga is sacrificed at the end of its final chapter.
   *
   * This is distinct from the Time Travel keyword action (see
   * applyTimeTravel): Next Turn is the automatic, once-per-turn
   * upkeep/precombat-main trigger every tracked mechanic has on its own.
   * Time Travel is a separate, optional effect specific cards grant — it
   * isn't tied to the turn counter at all.
   */
  const nextTurn = useCallback(() => dispatch({ type: 'nextTurn' }), []);
  /**
   * Time Travel keyword action: "For each suspended card you own and each
   * permanent you control with a time counter on it, you may add or remove
   * a time counter." Each choice is capped to exactly one counter in either
   * direction — this isn't a free stepper, it's one pass of the real
   * keyword's per-object choice. Fading and Saga are never eligible (fade
   * and lore counters aren't time counters — see hasTimeCounter in
   * @mtg/rules). Rose Tyler's own Bad Wolf counters are passed with the
   * 'rose' sentinel id instead of a card instanceId.
   */
  const applyTimeTravel = useCallback(
    (choices: TimeTravelChoice[], passInfo: TimeTravelPassInfo) =>
      dispatch({ type: 'applyTimeTravel', choices, passInfo }),
    [],
  );
  const dismissUpkeep = useCallback(() => dispatch({ type: 'dismissUpkeep' }), []);
  /**
   * Records a cast of a commander from the command zone — the only thing
   * that increases its tax (rule 903.10): +{2} for each *previous* cast this
   * game. Casting always puts the commander onto the battlefield, and is a
   * no-op while it is already there.
   */
  const castCommander = useCallback(
    (id: CommanderId) => dispatch({ type: 'castCommander', id }),
    [],
  );
  /**
   * A commander leaving the battlefield for the command zone is a choice the
   * owner makes, not something rules-forced. Never touches castCount: the
   * tax (rule 903.10) accumulates for the whole game.
   */
  const returnCommanderToCommandZone = useCallback(
    (id: CommanderId) => dispatch({ type: 'returnCommanderToCommandZone', id }),
    [],
  );
  /** Manual override for Rose Tyler's own Bad Wolf time counters (+1/+1 each). */
  const adjustRoseTimeCounters = useCallback(
    (delta: number) => dispatch({ type: 'adjustRoseTimeCounters', delta }),
    [],
  );
  /**
   * Rose Tyler's Bad Wolf: "Whenever Rose Tyler attacks, put a time counter
   * on it for each suspended card you own and each other permanent you
   * control with a time counter on it." CR 702.62b defines a card as
   * "suspended" only while it is in exile *with a time counter on it*, so
   * both clauses require a time counter — a Suspend card whose last counter
   * was removed has been cast, and a Vanishing permanent with none left has
   * been sacrificed. hasTimeCounter is shared with Time Travel's target list
   * so the two can't disagree again (docs/state-machine-audit.md B2/B7).
   */
  const roseAttacks = useCallback(() => dispatch({ type: 'roseAttacks' }), []);
  const resetGame = useCallback(() => {
    clearState();
    dispatch({ type: 'resetGame' });
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
