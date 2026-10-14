import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const home = readFileSync(join(__dirname, '..', 'app/(tabs)/index.tsx'), 'utf8');
const idx = (needle: string) => {
  const i = home.indexOf(needle);
  expect(i, `${needle} não encontrado`).toBeGreaterThan(-1);
  return i;
};

describe('Início: ordem dos atalhos (Check-in no lugar de Anotar saúde)', () => {
  it('modo normal: Meus remédios, Check-in, Chamar ambulância, Anotar saúde', () => {
    const ordem = [
      idx('title="Meus remédios"'),
      idx('title="Check-in"'),
      idx('title="Chamar ambulância"'),
      idx('title="Anotar saúde"'),
    ];
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('modo acessível: Meus Alarmes, Check-in, Registrar Saúde', () => {
    const ordem = [
      idx("navigate('/(tabs)/alarms')"),
      idx("navigate('/(tabs)/checkin')"),
      idx("navigate('/(tabs)/health')"),
    ];
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });
});
