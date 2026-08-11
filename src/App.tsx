import { useState } from 'react';
import AboutModal from './components/AboutModal';
import AddCardPanel from './components/AddCardPanel';
import ActiveCardsList from './components/ActiveCardsList';
import ChangeSummaryModal from './components/ChangeSummaryModal';
import CommanderTaxModal, { type CommanderId } from './components/CommanderTaxModal';
import GameLogPanel from './components/GameLogPanel';
import Header from './components/Header';
import TimeTravelPanel, { type TimeTravelTarget } from './components/TimeTravelPanel';
import { useGameState } from './hooks/useGameState';
import { MECHANIC_LABEL, usesTimeCounters } from './utils/counters';

const COMMANDER_NAME: Record<CommanderId, string> = {
  tenthDoctor: 'The Tenth Doctor',
  roseTyler: 'Rose Tyler',
};

export default function App() {
  const {
    state,
    lastUpkeep,
    addCard,
    removeCard,
    setCount,
    adjustCount,
    setTurn,
    nextTurn,
    applyTimeTravel,
    dismissUpkeep,
    castCommander,
    adjustRoseTimeCounters,
    roseAttacks,
    resetGame,
  } = useGameState();
  const [timeTravelOpen, setTimeTravelOpen] = useState<{ initialPasses?: number } | false>(false);
  const [logOpen, setLogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [openCommander, setOpenCommander] = useState<{ id: CommanderId; imageSmall?: string } | null>(null);

  // Time Travel only applies to real time counters — Suspend/Vanishing cards
  // and Rose Tyler's own Bad Wolf counters (once she has any). Fading uses
  // fade counters and Saga uses lore counters, so neither is eligible.
  const timeTravelTargets: TimeTravelTarget[] = [
    ...state.cards
      .filter(c => usesTimeCounters(c.mechanic))
      .map(c => ({
        id: c.instanceId,
        name: c.name,
        mechanic: c.mechanic,
        label: MECHANIC_LABEL[c.mechanic],
        count: c.count,
        direction: c.direction,
        targetCount: c.targetCount,
      })),
    ...(state.commanders.roseTyler.timeCounters > 0
      ? [
          {
            id: 'rose' as const,
            name: 'Rose Tyler — Bad Wolf',
            mechanic: 'custom' as const,
            label: 'Bad Wolf',
            count: state.commanders.roseTyler.timeCounters,
            direction: 'increment' as const,
            targetCount: undefined,
          },
        ]
      : []),
  ];

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
          onSetCount={setCount}
          onAdjustCount={adjustCount}
          onRemove={removeCard}
          onOpenTimeTravel={() => setTimeTravelOpen({})}
        />
      </main>
      <footer
        style={{
          textAlign: 'center',
          fontSize: '0.72rem',
          color: 'var(--color-text-faint)',
          padding: '0 1rem 2rem',
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
      {logOpen && <GameLogPanel log={state.log} currentTurn={state.turn} onClose={() => setLogOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {openCommander && (
        <CommanderTaxModal
          commanderId={openCommander.id}
          name={COMMANDER_NAME[openCommander.id]}
          imageSmall={openCommander.imageSmall}
          castCount={state.commanders[openCommander.id].castCount}
          onCast={() => castCommander(openCommander.id)}
          onClose={() => setOpenCommander(null)}
          roseState={openCommander.id === 'roseTyler' ? state.commanders.roseTyler : undefined}
          onAdjustRoseTimeCounters={openCommander.id === 'roseTyler' ? adjustRoseTimeCounters : undefined}
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
    </>
  );
}
