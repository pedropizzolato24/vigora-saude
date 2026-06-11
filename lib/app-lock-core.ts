/**
 * lib/app-lock-core.ts
 *
 * Lógica pura do bloqueio de app (sem React/Expo) — testável em Node.
 * Decide quando travar após background, valida o formato do PIN e controla
 * o throttle de tentativas erradas. A persistência e a biometria vivem em
 * lib/app-lock-storage.ts e lib/app-lock-context.tsx.
 */

/** Tempo em background a partir do qual o app trava (carência). */
export const GRACE_PERIOD_MS = 60_000;

/** Tentativas erradas permitidas antes de entrar em cooldown. */
export const MAX_ATTEMPTS_BEFORE_COOLDOWN = 5;

/** Duração do cooldown depois de exceder as tentativas. */
export const COOLDOWN_MS = 30_000;

export const PIN_LENGTH = 4;

export function isValidPin(pin: string): boolean {
  return pin.length === PIN_LENGTH && /^\d+$/.test(pin);
}

/**
 * Trava se o app ficou em background por tempo >= carência.
 * `backgroundedAt` null = nunca foi para background (não trava).
 */
export function shouldLockAfterBackground(
  backgroundedAt: number | null,
  now: number,
  graceMs: number = GRACE_PERIOD_MS,
): boolean {
  if (backgroundedAt == null) return false;
  return now - backgroundedAt >= graceMs;
}

export interface AttemptState {
  failedCount: number;
  /** Epoch ms até quando novas tentativas ficam bloqueadas (0 = sem cooldown). */
  lockedUntil: number;
}

export const INITIAL_ATTEMPT_STATE: AttemptState = { failedCount: 0, lockedUntil: 0 };

/**
 * Registra uma tentativa errada. A partir da 5ª, cada erro impõe um
 * cooldown de 30s antes da próxima tentativa.
 */
export function registerFailedAttempt(state: AttemptState, now: number): AttemptState {
  const failedCount = state.failedCount + 1;
  const lockedUntil =
    failedCount >= MAX_ATTEMPTS_BEFORE_COOLDOWN ? now + COOLDOWN_MS : state.lockedUntil;
  return { failedCount, lockedUntil };
}

/** Quanto falta (ms) para poder tentar de novo. 0 = liberado. */
export function attemptCooldownMs(state: AttemptState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

/** Parse defensivo do estado persistido (JSON inválido → estado inicial). */
export function parseAttemptState(raw: string | null): AttemptState {
  if (!raw) return INITIAL_ATTEMPT_STATE;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.failedCount === 'number' &&
      typeof parsed?.lockedUntil === 'number' &&
      parsed.failedCount >= 0
    ) {
      return { failedCount: parsed.failedCount, lockedUntil: parsed.lockedUntil };
    }
  } catch {
    // corrompido — recomeça do zero
  }
  return INITIAL_ATTEMPT_STATE;
}
