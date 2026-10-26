import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Remédios e Check-in usam o mesmo componente de lista.
const src = readFileSync(join(__dirname, '..', 'components/alarm-list-screen.tsx'), 'utf8');

describe('Remédios e Check-in: botão de voltar', () => {
  it('cabeçalho tem voltar nos dois modos, com fallback para o hub de alarmes', () => {
    const matches = src.match(/<ScreenHeaderBack fallbackRoute="\/\(tabs\)\/alarm-hub" \/>/g) ?? [];
    expect(matches.length).toBe(2);
  });
});
