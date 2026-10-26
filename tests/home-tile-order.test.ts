import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const home = readFileSync(join(__dirname, '..', 'app/(tabs)/index.tsx'), 'utf8');
const idx = (needle: string) => {
  const i = home.indexOf(needle);
  expect(i, `${needle} não encontrado`).toBeGreaterThan(-1);
  return i;
};

describe('Início: ordem dos atalhos (Histórico médico no lugar de Anotar saúde)', () => {
  it('modo normal: Meus remédios, Check-in, Chamar ambulância, Histórico médico', () => {
    const ordem = [
      idx('title="Meus remédios"'),
      idx('title="Check-in"'),
      idx('title="Chamar ambulância"'),
      idx('title="Histórico médico"'),
    ];
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('modo acessível: Meus Alarmes, Check-in, Histórico Médico', () => {
    const ordem = [
      idx("navigate('/(tabs)/alarms')"),
      idx("navigate('/(tabs)/checkin')"),
      idx("navigate('/(tabs)/anamnesis')"),
    ];
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  // Saúde continua acessível pela barra inferior; a home não duplica o atalho.
  it('a home não leva mais direto para Anotar saúde', () => {
    expect(home).not.toContain('Anotar saúde');
    expect(home).not.toContain("navigate('/(tabs)/health')");
  });

  it('cores: Check-in verde, Ambulância vermelha, Histórico azul', () => {
    const tile = (title: string) => {
      const end = idx(`title="${title}"`);
      return home.slice(home.lastIndexOf('<BigTile', end), end);
    };
    expect(tile('Check-in')).toContain('iconColor={colors.success}');
    expect(tile('Chamar ambulância')).toContain('iconColor={colors.emergency}');
    expect(tile('Histórico médico')).toContain('iconColor={colors.primary}');
  });
});
