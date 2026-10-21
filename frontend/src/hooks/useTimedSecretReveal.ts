import { useCallback, useEffect, useRef, useState } from 'react';

export const REVEAL_VISIBILITY_MS = 10_000;
const PROGRESS_TICK_MS = 50;

export function useTimedSecretReveal(visibilityMs = REVEAL_VISIBILITY_MS) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealedSecretId, setRevealedSecretId] = useState<string | null>(null);
  const [progressRemaining, setProgressRemaining] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSecretIdRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  const hideRevealed = useCallback(() => {
    clearTimers();
    activeSecretIdRef.current = null;
    startedAtRef.current = 0;
    setRevealed(null);
    setRevealedSecretId(null);
    setProgressRemaining(0);
    setSecondsLeft(0);
  }, [clearTimers]);

  const syncProgress = useCallback(
    (secretId: string) => {
      if (activeSecretIdRef.current !== secretId) return;
      const elapsed = Date.now() - startedAtRef.current;
      const remaining = Math.max(0, visibilityMs - elapsed);
      setProgressRemaining((remaining / visibilityMs) * 100);
      setSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
      if (remaining <= 0) {
        hideRevealed();
      }
    },
    [visibilityMs, hideRevealed],
  );

  const beginReveal = useCallback(
    (secretId: string, plaintext: string) => {
      clearTimers();
      activeSecretIdRef.current = secretId;
      startedAtRef.current = Date.now();
      setRevealedSecretId(secretId);
      setRevealed(plaintext);
      setProgressRemaining(100);
      setSecondsLeft(Math.ceil(visibilityMs / 1000));

      tickIntervalRef.current = setInterval(() => {
        syncProgress(secretId);
      }, PROGRESS_TICK_MS);

      hideTimeoutRef.current = setTimeout(() => {
        if (activeSecretIdRef.current === secretId) {
          hideRevealed();
        }
      }, visibilityMs);
    },
    [visibilityMs, clearTimers, hideRevealed, syncProgress],
  );

  useEffect(() => () => {
    clearTimers();
  }, [clearTimers]);

  return {
    revealed,
    revealedSecretId,
    progressRemaining,
    secondsLeft,
    beginReveal,
    hideRevealed,
  };
}
