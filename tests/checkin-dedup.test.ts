// tests/checkin-dedup.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { claimTimeout, claimPrompt, PROMPT_DEDUP_WINDOW_MS } from '../lib/checkin-dedup';

// O estado dos dedups é module-level e persiste entre os testes; cada teste usa
// identifiers próprios para não contaminar os demais.

describe('claimTimeout (Set permanente)', () => {
  it('processa um identifier só uma vez, para sempre', () => {
    const id = 'timeout-once';
    expect(claimTimeout(id)).toBe(true);
    expect(claimTimeout(id)).toBe(false);
    expect(claimTimeout(id)).toBe(false);
  });

  it('identifiers diferentes (um por dia) são processados', () => {
    expect(claimTimeout('timeout-A')).toBe(true);
    expect(claimTimeout('timeout-B')).toBe(true);
  });

  it('sem identifier sempre processa', () => {
    expect(claimTimeout(undefined)).toBe(true);
    expect(claimTimeout(undefined)).toBe(true);
  });
});

describe('claimPrompt (janela de tempo)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplica o duplo de cold-start (mesma janela) e libera depois dela', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-04T09:00:00'));
    const id = 'prompt-cold-start'; // DAILY → mesmo id em todo disparo

    expect(claimPrompt(id)).toBe(true);  // _layout (cold start) processa
    expect(claimPrompt(id)).toBe(false); // listener, mesmo instante → suprimido

    // Avança além da janela: o segundo handler atrasado ainda seria suprimido só
    // até PROMPT_DEDUP_WINDOW_MS; depois disso, libera (= disparo de amanhã).
    vi.setSystemTime(Date.now() + PROMPT_DEDUP_WINDOW_MS + 1000);
    expect(claimPrompt(id)).toBe(true);
  });

  it('NÃO bloqueia o check-in do dia seguinte (24h depois, mesmo identifier)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-04T09:00:00'));
    const id = 'prompt-nextday';

    expect(claimPrompt(id)).toBe(true);
    vi.setSystemTime(new Date('2026-06-05T09:00:00')); // +24h
    // Sem a janela de tempo (Set permanente), isto seria false → re-quebraria o Bug 1.
    expect(claimPrompt(id)).toBe(true);
  });

  it('sem identifier sempre processa', () => {
    expect(claimPrompt(undefined)).toBe(true);
    expect(claimPrompt(undefined)).toBe(true);
  });
});
