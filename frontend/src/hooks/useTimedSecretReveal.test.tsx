import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVEAL_VISIBILITY_MS, useTimedSecretReveal } from './useTimedSecretReveal';

describe('useTimedSecretReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows plaintext and full progress after beginReveal', () => {
    const { result } = renderHook(() => useTimedSecretReveal(10_000));
    act(() => {
      result.current.beginReveal('secret-1', 'plain-text');
    });
    expect(result.current.revealed).toBe('plain-text');
    expect(result.current.progressRemaining).toBe(100);
  });

  it('masks the value after the visibility window', () => {
    const { result } = renderHook(() => useTimedSecretReveal(10_000));
    act(() => {
      result.current.beginReveal('secret-1', 'plain-text');
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.revealed).toBeNull();
    expect(result.current.progressRemaining).toBe(0);
  });

  it('hideRevealed clears the timer early', () => {
    const { result } = renderHook(() => useTimedSecretReveal(10_000));
    act(() => {
      result.current.beginReveal('secret-1', 'plain-text');
    });
    act(() => {
      result.current.hideRevealed();
    });
    expect(result.current.revealed).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.revealed).toBeNull();
  });

  it('replaces the previous secret when revealing another id', () => {
    const { result } = renderHook(() => useTimedSecretReveal(10_000));
    act(() => {
      result.current.beginReveal('secret-1', 'first');
    });
    act(() => {
      result.current.beginReveal('secret-2', 'second');
    });
    expect(result.current.revealed).toBe('second');
    expect(result.current.revealedSecretId).toBe('secret-2');
  });

  it('does not leave multiple timers after repeated beginReveal on same secret', () => {
    const { result } = renderHook(() => useTimedSecretReveal(10_000));
    act(() => {
      result.current.beginReveal('secret-1', 'v1');
      result.current.beginReveal('secret-1', 'v2');
    });
    expect(result.current.revealed).toBe('v2');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.revealed).toBeNull();
  });

  it('cleans up on unmount', () => {
    const { result, unmount } = renderHook(() => useTimedSecretReveal(10_000));
    act(() => {
      result.current.beginReveal('secret-1', 'plain-text');
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(REVEAL_VISIBILITY_MS);
    });
  });
});
