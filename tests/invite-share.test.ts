import { describe, expect, it } from 'vitest';
import { buildInviteShareText, formatInviteCode } from '../lib/invite-share';

describe('formatInviteCode', () => {
  it('põe o hífen no meio de 6 caracteres', () => {
    expect(formatInviteCode('ABCDEF')).toBe('ABC-DEF');
  });
  it('deixa qualquer outro tamanho como veio', () => {
    expect(formatInviteCode('ABC')).toBe('ABC');
  });
});

describe('buildInviteShareText', () => {
  it('leva o código formatado e o tempo que ainda resta', () => {
    expect(buildInviteShareText('ABCDEF', 600)).toBe(
      'Meu código do Vigora é ABC-DEF. Ele vale por mais 10 minutos. Abra o app Vigora, entre como cuidador e digite o código.'
    );
  });
  it('arredonda para cima e usa o singular', () => {
    expect(buildInviteShareText('ABCDEF', 61)).toContain('por mais 2 minutos');
    expect(buildInviteShareText('ABCDEF', 30)).toContain('por mais 1 minuto.');
  });
});
