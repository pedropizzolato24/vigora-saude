import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESYNC_MIN_GAP_MS, shouldResync } from '../lib/resync-throttle';

describe('shouldResync', () => {
  const NOW = 1_800_000_000_000;

  it('sempre sincroniza na primeira vez', () => {
    expect(shouldResync(null, NOW)).toBe(true);
  });

  it('bloqueia dentro do intervalo mínimo', () => {
    expect(shouldResync(NOW - RESYNC_MIN_GAP_MS + 1, NOW)).toBe(false);
  });

  it('libera no limite exato', () => {
    expect(shouldResync(NOW - RESYNC_MIN_GAP_MS, NOW)).toBe(true);
  });

  it('libera se o relógio voltou para trás (não trava por horas)', () => {
    expect(shouldResync(NOW + 3_600_000, NOW)).toBe(true);
  });
});

describe('MonitoringInitializer — voltar ao app re-registra os disparos', () => {
  const src = readFileSync(
    join(__dirname, '..', 'components', 'monitoring-initializer.tsx'),
    'utf8'
  );

  it('escuta o AppState e passa pelo limitador', () => {
    expect(src).toMatch(/AppState\.addEventListener\("change"/);
    expect(src).toMatch(/shouldResync\(lastResyncRef\.current, now\)/);
  });

  it('só re-sincroniza com o monitoramento já inicializado', () => {
    expect(src).toMatch(/next !== "active" \|\| !initializedRef\.current/);
  });
});
