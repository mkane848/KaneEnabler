import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommanderCard } from './CommanderCard';
import {
  makeAlsoPlayableSuggestion,
  makeCommanderCard,
  makeKeywordSupport,
  makeKindredSupport,
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
        makeKindredSupport({
          type: 'Goblins',
          cards: [makeSupportingCard({ name: 'Goblin Guide' })],
        }),
        makeKindredSupport({ type: 'Elves' }), // filtered out — no cards left in this identity
      ],
    });
    const { container } = render(<CommanderCard suggestion={suggestion} />);
    // Scoped to the tag line: the score badge's breakdown names its signals
    // too, so a bare getByText('Goblins') now matches in two places.
    const tags = container.querySelector('.commander-tags');
    expect(tags).toHaveTextContent('Goblins');
    expect(tags).not.toHaveTextContent('Elves');
  });

  describe('the score badge', () => {
    /** A suggestion whose signals are named and weighted, so the badge has a
     * real breakdown to show. */
    const scored = (overrides = {}) =>
      makeSuggestion({
        score: 46.6,
        evidence: 'strong',
        poolSize: 87,
        kindredSupport: [
          makeKindredSupport({
            type: 'Goblin',
            cards: [makeSupportingCard({ name: 'Goblin Guide' })],
            points: 28.4,
          }),
        ],
        themeSupport: [
          makeThemeSupport({
            key: 'aristocrats',
            label: 'Aristocrats',
            cards: [makeSupportingCard({ name: 'Blood Artist' })],
            points: 11.4,
          }),
        ],
        keywordSupport: [
          makeKeywordSupport({
            keyword: 'Haste',
            cards: [makeSupportingCard({ name: 'Fervor' })],
            points: 6.8,
          }),
        ],
        ...overrides,
      });

    it('names how strong the evidence is, not just the number', () => {
      const { container } = render(<CommanderCard suggestion={scored()} />);
      expect(container.querySelector('.badge-match')).toHaveTextContent('score 46.6 · strong');
    });

    it('itemises which signals earned the score, strongest first', () => {
      const { container } = render(<CommanderCard suggestion={scored()} />);
      const rows = [...container.querySelectorAll('.match-breakdown-label')].map(
        (node) => node.textContent,
      );
      // Ranked by points, not by supporting-card count: the two differ
      // whenever the signals carry different weights.
      expect(rows).toEqual(['Goblin', 'Aristocrats', 'Haste']);
      expect(container.querySelector('.match-breakdown')).toHaveTextContent('+28.4');
    });

    it('sums the signals it does not list, so the breakdown still accounts for the score', () => {
      const suggestion = scored({
        themeSupport: [
          makeThemeSupport({ key: 'a', label: 'Alpha', points: 11.4 }),
          makeThemeSupport({ key: 'b', label: 'Beta', points: 2.5 }),
          makeThemeSupport({ key: 'c', label: 'Gamma', points: 1.6 }),
        ].map((theme) => ({ ...theme, cards: [makeSupportingCard()] })),
      });
      const { container } = render(<CommanderCard suggestion={suggestion} />);
      const rest = container.querySelector('.match-breakdown-row.is-rest');
      // Goblin, Alpha and Haste are shown; Beta and Gamma are folded together.
      expect(rest).toHaveTextContent('2 more');
      expect(rest).toHaveTextContent('+4.1');
    });

    it('says so when nothing in your list backs the commander', () => {
      const suggestion = makeAlsoPlayableSuggestion({ score: 0, coverageReason: 'owned' });
      render(<CommanderCard suggestion={suggestion} />);
      expect(screen.getByRole('tooltip')).toHaveTextContent('Not ranked on synergy');
      // No strength word to give: there is no evidence to be strong or weak.
      expect(screen.getByRole('button', { name: 'score 0' })).toBeInTheDocument();
    });

    it('calls a single bare-minimum signal thin, and says why', () => {
      const suggestion = scored({
        evidence: 'thin',
        score: 3.3,
        themeSupport: [],
        keywordSupport: [],
        kindredSupport: [
          makeKindredSupport({
            type: 'Goblin',
            cards: [makeSupportingCard(), makeSupportingCard(), makeSupportingCard()],
            points: 3.3,
          }),
        ],
      });
      const { container } = render(<CommanderCard suggestion={suggestion} />);
      expect(screen.getByRole('tooltip')).toHaveTextContent('One signal on 3 cards');
      expect(container.querySelector('.badge-match')).toHaveClass('is-thin');
    });
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
