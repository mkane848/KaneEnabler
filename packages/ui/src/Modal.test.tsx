import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal, ModalClose, ModalTitle } from './Modal';

describe('Modal', () => {
  it('renders its children inside a dialog', () => {
    render(
      <Modal onClose={() => {}}>
        <p>Hello from inside</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hello from inside')).toBeInTheDocument();
  });

  it('moves focus inside the dialog on open — the focus trap the hand-rolled versions lacked', () => {
    render(
      <Modal onClose={() => {}}>
        <button type="button">First focusable</button>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement | null);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Content</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ModalClose closes the dialog like any other close control', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <ModalClose asChild>
          <button type="button">Done</button>
        </ModalClose>
      </Modal>,
    );
    fireEvent.click(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ModalTitle wraps an existing heading without changing its rendered output', () => {
    render(
      <Modal onClose={() => {}}>
        <ModalTitle asChild>
          <h2 className="my-title">About</h2>
        </ModalTitle>
      </Modal>,
    );
    const heading = screen.getByRole('heading', { name: 'About' });
    expect(heading.tagName).toBe('H2');
    expect(heading).toHaveClass('my-title');
  });

  it('restores focus to whatever opened it once closed', async () => {
    // Radix's *modal* Dialog.Content only restores focus to an element
    // registered via Dialog.Trigger — none of this package's callers use
    // one (see Modal.tsx's onCloseAutoFocus comment), so without our own
    // override this silently focused nothing. Regression coverage for
    // that, not just a demonstration of Radix's own default behavior.
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <Modal onClose={() => setOpen(false)}>
              <button type="button">Inside</button>
            </Modal>
          )}
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByText('Open');
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByText('Inside')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Inside')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
