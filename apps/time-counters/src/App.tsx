import { useState } from 'react';
import AboutModal from './components/AboutModal';
import AddCardPanel from './components/AddCardPanel';
import ActiveCardsList from './components/ActiveCardsList';
import type { CommanderFieldCard } from './components/CommanderFieldTile';
import ChangeSummaryModal from './components/ChangeSummaryModal';
import CommanderTaxModal from './components/CommanderTaxModal';
import GameLogPanel from './components/GameLogPanel';
import Header from './components/Header';
import TimeTravelPanel, { buildTimeTravelTargets } from './components/TimeTravelPanel';
import UndoToast from './components/UndoToast';
import { useCommanderCards } from './hooks/useCommanderCards';
import { useGameState } from './hooks/useGameState';
import type { CommanderId } from './types';
import { COMMANDER_IDS, COMMANDER_NAME } from './utils/commanders';

export default function App() {
  const {
    state,
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
  } = useGameState();
  const commanderCatalog = useCommanderCards();
  const [timeTravelOpen, setTimeTravelOpen] = useState<{ initialPasses?: number } | false>(false);
  const [logOpen, setLogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [openCommander, setOpenCommander] = useState<{
    id: CommanderId;
    imageSmall?: string;
  } | null>(null);

  const commanderFieldCards: CommanderFieldCard[] = COMMANDER_IDS.filter(
    (id) => state.commanders[id].onBattlefield,
  ).map((id) => ({
    id,
    name: COMMANDER_NAME[id],
    imageSmall: commanderCatalog[id]?.imageSmall,
    castCount: state.commanders[id].castCount,
  }));

  const timeTravelTargets = buildTimeTravelTargets(state.cards, state.commanders.roseTyler);

  return (
    <>
      <Header
        turn={state.turn}
        onSetTurn={setTurn}
        onNextTurn={nextTurn}
        onReset={resetGame}
        onOpenLog={() => setLogOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
        onOpenCommander={(id, imageSmall) => setOpenCommander({ id, imageSmall })}
      />
      <main>
        <AddCardPanel onAdd={addCard} />
        <ActiveCardsList
          cards={state.cards}
          commanderCards={commanderFieldCards}
          onSetCount={setCount}
          onAdjustCount={adjustCount}
          onRemove={removeCard}
          onOpenTimeTravel={() => setTimeTravelOpen({})}
          onManageCommander={(id, imageSmall) => setOpenCommander({ id, imageSmall })}
          onReturnCommanderToCommandZone={returnCommanderToCommandZone}
        />
      </main>
      <footer
        style={{
          textAlign: 'center',
          fontSize: '0.72rem',
          color: 'var(--color-text-faint)',
          padding:
            '0 max(1rem, env(safe-area-inset-right)) max(2rem, calc(env(safe-area-inset-bottom) + 1rem)) max(1rem, env(safe-area-inset-left))',
        }}
      >
        Card data via Scryfall. Magic: The Gathering is © Wizards of the Coast.
      </footer>
      {lastUpkeep && lastUpkeep.length > 0 && (
        <ChangeSummaryModal
          changes={lastUpkeep}
          turn={state.turn}
          onResolve={removeCard}
          onClose={dismissUpkeep}
        />
      )}
      {timeTravelOpen && (
        <TimeTravelPanel
          targets={timeTravelTargets}
          initialPasses={timeTravelOpen.initialPasses}
          onApply={applyTimeTravel}
          onClose={() => setTimeTravelOpen(false)}
        />
      )}
      {logOpen && (
        <GameLogPanel log={state.log} currentTurn={state.turn} onClose={() => setLogOpen(false)} />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {openCommander && (
        <CommanderTaxModal
          name={COMMANDER_NAME[openCommander.id]}
          imageSmall={openCommander.imageSmall}
          castCount={state.commanders[openCommander.id].castCount}
          onBattlefield={state.commanders[openCommander.id].onBattlefield}
          onCast={() => castCommander(openCommander.id)}
          onReturnToCommandZone={() => returnCommanderToCommandZone(openCommander.id)}
          onClose={() => setOpenCommander(null)}
          roseState={openCommander.id === 'roseTyler' ? state.commanders.roseTyler : undefined}
          onAdjustRoseTimeCounters={
            openCommander.id === 'roseTyler' ? adjustRoseTimeCounters : undefined
          }
          onRoseAttacks={openCommander.id === 'roseTyler' ? roseAttacks : undefined}
          onOpenTimeyWimey={
            openCommander.id === 'tenthDoctor'
              ? () => {
                  setOpenCommander(null);
                  setTimeTravelOpen({ initialPasses: 3 });
                }
              : undefined
          }
        />
      )}
      {lastRemoved && (
        <UndoToast
          cardName={lastRemoved.card.name}
          onUndo={undoRemove}
          onDismiss={dismissLastRemoved}
        />
      )}
    </>
  );
}
