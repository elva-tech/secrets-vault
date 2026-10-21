import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RotateSecretValueInput } from './RotateSecretValueInput';
import { DEFAULT_SECRET_LENGTH } from '../../lib/secretGenerator';

describe('RotateSecretValueInput', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders Generate beside the New value field', () => {
    render(<RotateSecretValueInput value="" onChange={() => {}} />);
    expect(screen.getByLabelText(/new value/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /generate strong random secret/i })).toBeTruthy();
  });

  it('populates the input when Generate is clicked', () => {
    let current = '';
    const onChange = vi.fn((v: string) => {
      current = v;
    });
    const { rerender } = render(<RotateSecretValueInput value={current} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /generate strong random secret/i }));
    expect(onChange).toHaveBeenCalled();
    const generated = onChange.mock.calls[0][0] as string;
    expect(generated.length).toBe(DEFAULT_SECRET_LENGTH);
    rerender(<RotateSecretValueInput value={generated} onChange={onChange} />);
    expect(screen.getByDisplayValue(generated)).toBeTruthy();
  });

  it('does not submit a form when Generate is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <RotateSecretValueInput value="" onChange={() => {}} />
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: /generate strong random secret/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows an error when secure random is unavailable', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });
    render(<RotateSecretValueInput value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /generate strong random secret/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/not available/i);
    Object.defineProperty(globalThis, 'crypto', {
      value: original,
      configurable: true,
    });
  });
});
