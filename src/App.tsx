import { useState } from 'react';
import AddCardPanel from './components/AddCardPanel';
import ActiveCardsList from './components/ActiveCardsList';
import ChangeSummaryModal from './components/ChangeSummaryModal';
import Header from './components/Header';
import { useGameState } from './hooks/useGameState';
import type { TurnChange } from './types';

export default function App() {
  const { state, addCard, removeCard, setCount, setTurn, nextTurn, resetGame } = useGameState();
  const [changeSummary, setChangeSummary] = useState<TurnChange[] | null>(null);

  function handleNextTurn() {
    const changes = nextTurn();
    // Only interrupt the player when something actually happened at upkeep.
    setChangeSummary(changes.length > 0 ? changes : null);
  }

  function handleResolveFromModal(instanceId: string) {
    removeCard(instanceId);
    setChangeSummary(prev => (prev ? prev.filter(c => c.instanceId !== instanceId) : prev));
  }

  return (
    <>
      <Header turn={state.turn} onSetTurn={setTurn} onNextTurn={handleNextTurn} onReset={resetGame} />
      <main>
        <AddCardPanel onAdd={addCard} />
        <ActiveCardsList cards={state.cards} onSetCount={setCount} onRemove={removeCard} />
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
      {changeSummary && (
        <ChangeSummaryModal
          changes={changeSummary}
          turn={state.turn}
          onResolve={handleResolveFromModal}
          onClose={() => setChangeSummary(null)}
        />
      )}
    </>
  );
}
