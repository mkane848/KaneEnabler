import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommanderCard } from './CommanderCard';
import {
  makeAlsoPlayableSuggestion,
  makeCommanderCard,
  makeSuggestion,
  makeSupportingCard,
  makeThemeSupport,
} from '../test/fixtures';

// CommanderCard's own job is to lay out a suggestion — combo lookups,
// like/dislike persistence, and dismissal are each their own component/store
// with their own tests, so they're stood in for here rather than exercised
// through several layers of network/auth mocking that would just be testing
// those modules again.
vi.mock('./ComboFinder', () => ({ ComboFinder: () => <div data-testid="combo-finder" /> }));
vi.mock('./LikeDislikeButtons', () => ({ LikeDislikeButtons: () => <div /> }));

const dismiss = vi.fn();
vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: { dismiss: typeof dismiss }) => unknown) => selector({ dismiss }),
}));

beforeEach(() => {
  dismiss.mockClear();
});

describe('CommanderCard', () => {
  it('renders a solo commander by name, with its score', () => {
    const suggestion = makeSuggestion({
      cards: [makeCommanderCard({ name: 'Krenko, Mob Boss', colorIdentity: ['R'] })],
      score: 42,
    });
    render(<CommanderCard suggestion={suggestion} />);
    expect(screen.getByText('Krenko, Mob Boss')).toBeInTheDocument();
    expect(screen.getByText('score 42')).toBeInTheDocument();
  });

  it('renders a Partner pair as one joined heading, both names present', () => {
    const suggestion = makeSuggestion({
      cards: [
        makeCommanderCard({ name: 'Tana, the Bloodsower' }),
        makeCommanderCard({ name: 'Tymna the Weaver' }),
      ],
    });
    render(<CommanderCard suggestion={suggestion} />);
    // Each face's name also appears again in its own CommanderFace caption,
    // so this scopes to the one joined <h3> rather than a plain getByText.
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Tana, the Bloodsower + Tymna the Weaver',
    );
  });

  it('shows a Kindred/Themes/Keywords line only for support that survived the color-identity filter', () => {
    const suggestion = makeSuggestion({
      kindredSupport: [
        { type: 'Goblins', cards: [makeSupportingCard({ name: 'Goblin Guide' })] },
        { type: 'Elves', cards: [] }, // filtered out — no cards left in this identity
      ],
    });
    render(<CommanderCard suggestion={suggestion} />);
    expect(screen.getByText('Goblins')).toBeInTheDocument();
    expect(screen.queryByText('Elves')).not.toBeInTheDocument();
  });

  it('shows the Game Changer badge only when the suggestion has one', () => {
    const { rerender } = render(
      <CommanderCard suggestion={makeSuggestion({ gameChangerCount: 0 })} />,
    );
    expect(screen.queryByText(/Game Changer/)).not.toBeInTheDocument();

    rerender(
      <CommanderCard
        suggestion={makeSuggestion({
          gameChangerCount: 2,
          gameChangerCards: [
            makeSupportingCard({ name: 'A', isGameChanger: true }),
            makeSupportingCard({ name: 'B', isGameChanger: true }),
          ],
        })}
      />,
    );
    expect(screen.getByText('2 Game Changers')).toBeInTheDocument();
  });

  it('"Why this commander?" only appears when there is a reason to show, and expands the explain panel', () => {
    const noReasons = makeSuggestion();
    const { rerender } = render(<CommanderCard suggestion={noReasons} />);
    expect(screen.queryByText('Why this commander?')).not.toBeInTheDocument();

    const withReasons = makeSuggestion({
      themeSupport: [
        makeThemeSupport({
          key: 'aristocrats',
          label: 'Aristocrats',
          description: 'Sacrifice fodder into a payoff.',
          cards: [makeSupportingCard({ name: 'Blood Artist' })],
        }),
      ],
    });
    rerender(<CommanderCard suggestion={withReasons} />);
    const toggle = screen.getByText('Why this commander?');
    // 'Aristocrats' alone also appears in the always-visible Themes tags
    // line, so this checks for the description text that only exists inside
    // the collapsible explain panel itself.
    expect(screen.queryByText('Sacrifice fodder into a payoff.')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Sacrifice fodder into a payoff.')).toBeInTheDocument();
    expect(screen.getByText('Blood Artist')).toBeInTheDocument();
    // The mocked-out ComboFinder still renders inside the expanded panel.
    expect(screen.getByTestId('combo-finder')).toBeInTheDocument();
  });

  it('shows no coverage badge for a plain confident suggestion', () => {
    render(<CommanderCard suggestion={makeSuggestion()} />);
    expect(screen.queryByText('In your list')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Covers /)).not.toBeInTheDocument();
  });

  it('an \'owned\' coverage pick is badged "In your list"', () => {
    render(<CommanderCard suggestion={makeAlsoPlayableSuggestion({ coverageReason: 'owned' })} />);
    expect(screen.getByText('In your list')).toBeInTheDocument();
  });

  it("a 'covers' coverage pick names the cards it rescues", () => {
    render(
      <CommanderCard
        suggestion={makeAlsoPlayableSuggestion({
          coverageReason: 'covers',
          coveredCards: [makeSupportingCard({ name: 'Tergrid, God of Fright' })],
        })}
      />,
    );
    expect(screen.getByText('Covers Tergrid, God of Fright')).toBeInTheDocument();
  });

  it("the dismiss button dismisses this suggestion's unitId", () => {
    const suggestion = makeSuggestion({ cards: [makeCommanderCard({ name: 'Krenko' })] });
    render(<CommanderCard suggestion={suggestion} />);
    screen.getByRole('button', { name: 'Dismiss Krenko' }).click();
    expect(dismiss).toHaveBeenCalledWith(suggestion.unitId);
  });
});
