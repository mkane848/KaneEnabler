import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PtcgCard } from '@ptcg/rules';
import { CardArt } from './CardArt';

const card: PtcgCard = {
  id: 'sv10-003',
  setId: 'sv10',
  localId: '003',
  name: 'Yanmega ex',
  image: 'https://assets.tcgdex.net/en/sv/sv10/003',
};

describe('CardArt', () => {
  it("loads TCGdex's low-res image lazily, as the Magic tools load Scryfall's", () => {
    render(<CardArt card={card} />);
    const img = screen.getByRole('img', { name: 'Yanmega ex' });
    expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv10/003/low.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('is decorative where the name is already shown beside it', () => {
    const { container } = render(<CardArt card={card} decorative />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('renders nothing when TCGdex has no image, or the image fails to load', () => {
    const { container, rerender } = render(<CardArt card={{ ...card, image: undefined }} />);
    expect(container.querySelector('img')).toBeNull();
    rerender(<CardArt card={card} />);
    fireEvent.error(container.querySelector('img')!); // rendered: the card has an image
    expect(container.querySelector('img')).toBeNull();
  });
});
