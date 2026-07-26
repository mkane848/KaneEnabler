import AddCardPanel from './components/AddCardPanel';
import ActiveCardsList from './components/ActiveCardsList';
import ChangeSummaryModal from './components/ChangeSummaryModal';
import Header from './components/Header';
import { useGameState } from './hooks/useGameState';

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
    dismissUpkeep,
    resetGame,
  } = useGameState();

  return (
    <>
      <Header turn={state.turn} onSetTurn={setTurn} onTimeTravel={nextTurn} onReset={resetGame} />
      <main>
        <AddCardPanel onAdd={addCard} />
        <ActiveCardsList
          cards={state.cards}
          onSetCount={setCount}
          onAdjustCount={adjustCount}
          onRemove={removeCard}
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
    </>
  );
}
