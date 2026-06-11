import { describe, expect, it } from 'vitest';
import {
  attemptCooldownMs,
  COOLDOWN_MS,
  GRACE_PERIOD_MS,
  INITIAL_ATTEMPT_STATE,
  isValidPin,
  MAX_ATTEMPTS_BEFORE_COOLDOWN,
  parseAttemptState,
  registerFailedAttempt,
  shouldLockAfterBackground,
  type AttemptState,
} from '@/lib/app-lock-core';

describe('isValidPin', () => {
  it('aceita exatamente 4 dígitos', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('0000')).toBe(true);
  });

  it('rejeita comprimento errado', () => {
    expect(isValidPin('')).toBe(false);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12345')).toBe(false);
  });

  it('rejeita caracteres não numéricos', () => {
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('abcd')).toBe(false);
    expect(isValidPin('12.4')).toBe(false);
    expect(isValidPin('-123')).toBe(false);
  });
});

describe('shouldLockAfterBackground', () => {
  const NOW = 1_000_000;

  it('não trava se nunca foi para background', () => {
    expect(shouldLockAfterBackground(null, NOW)).toBe(false);
  });

  it('não trava dentro da carência', () => {
    expect(shouldLockAfterBackground(NOW - GRACE_PERIOD_MS + 1, NOW)).toBe(false);
    expect(shouldLockAfterBackground(NOW, NOW)).toBe(false);
  });

  it('trava quando a carência expira', () => {
    expect(shouldLockAfterBackground(NOW - GRACE_PERIOD_MS, NOW)).toBe(true);
    expect(shouldLockAfterBackground(NOW - GRACE_PERIOD_MS - 1, NOW)).toBe(true);
  });

  it('respeita carência customizada', () => {
    expect(shouldLockAfterBackground(NOW - 5_000, NOW, 10_000)).toBe(false);
    expect(shouldLockAfterBackground(NOW - 10_000, NOW, 10_000)).toBe(true);
  });
});

describe('registerFailedAttempt / attemptCooldownMs', () => {
  const NOW = 2_000_000;

  it('incrementa sem cooldown abaixo do limite', () => {
    let state: AttemptState = INITIAL_ATTEMPT_STATE;
    for (let i = 1; i < MAX_ATTEMPTS_BEFORE_COOLDOWN; i++) {
      state = registerFailedAttempt(state, NOW);
      expect(state.failedCount).toBe(i);
      expect(attemptCooldownMs(state, NOW)).toBe(0);
    }
  });

  it('impõe cooldown na 5ª tentativa errada', () => {
    let state: AttemptState = INITIAL_ATTEMPT_STATE;
    for (let i = 0; i < MAX_ATTEMPTS_BEFORE_COOLDOWN; i++) {
      state = registerFailedAttempt(state, NOW);
    }
    expect(state.lockedUntil).toBe(NOW + COOLDOWN_MS);
    expect(attemptCooldownMs(state, NOW)).toBe(COOLDOWN_MS);
    expect(attemptCooldownMs(state, NOW + COOLDOWN_MS)).toBe(0);
  });

  it('cada erro após o limite renova o cooldown', () => {
    let state: AttemptState = { failedCount: MAX_ATTEMPTS_BEFORE_COOLDOWN, lockedUntil: NOW };
    const later = NOW + 60_000;
    state = registerFailedAttempt(state, later);
    expect(state.failedCount).toBe(MAX_ATTEMPTS_BEFORE_COOLDOWN + 1);
    expect(state.lockedUntil).toBe(later + COOLDOWN_MS);
  });

  it('não modifica o estado original (imutável)', () => {
    const original: AttemptState = { failedCount: 1, lockedUntil: 0 };
    registerFailedAttempt(original, NOW);
    expect(original).toEqual({ failedCount: 1, lockedUntil: 0 });
  });
});

describe('parseAttemptState', () => {
  it('null/vazio → estado inicial', () => {
    expect(parseAttemptState(null)).toEqual(INITIAL_ATTEMPT_STATE);
    expect(parseAttemptState('')).toEqual(INITIAL_ATTEMPT_STATE);
  });

  it('JSON inválido → estado inicial', () => {
    expect(parseAttemptState('not json')).toEqual(INITIAL_ATTEMPT_STATE);
    expect(parseAttemptState('{broken')).toEqual(INITIAL_ATTEMPT_STATE);
  });

  it('shape errado → estado inicial', () => {
    expect(parseAttemptState('{}')).toEqual(INITIAL_ATTEMPT_STATE);
    expect(parseAttemptState('{"failedCount":"x","lockedUntil":0}')).toEqual(INITIAL_ATTEMPT_STATE);
    expect(parseAttemptState('{"failedCount":-1,"lockedUntil":0}')).toEqual(INITIAL_ATTEMPT_STATE);
    expect(parseAttemptState('[1,2]')).toEqual(INITIAL_ATTEMPT_STATE);
  });

  it('round-trip de estado válido', () => {
    const state: AttemptState = { failedCount: 3, lockedUntil: 123456 };
    expect(parseAttemptState(JSON.stringify(state))).toEqual(state);
  });
});
