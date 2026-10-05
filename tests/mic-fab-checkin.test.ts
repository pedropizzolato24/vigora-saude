import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, '..', 'components/mic-fab.tsx'), 'utf8');
const labels = [...src.matchAll(/\{ label: '([^']+)'/g)].map((m) => m[1]);

describe('botão "?" (MicFab): atalho do Check-in', () => {
  it('"Check-in diário" vem logo depois de "Meus remédios"', () => {
    expect(labels).toEqual([
      'Meus remédios',
      'Check-in diário',
      'Anotar saúde',
      'Chamar ambulância',
      'Avisar família',
    ]);
  });

  it('fala "Abrindo seu check-in", ícone how-to-reg, cor primary e rota do check-in', () => {
    expect(src).toMatch(
      /\{ label: 'Check-in diário', spoken: 'Abrindo seu check-in', icon: 'how-to-reg', colorToken: 'primary', route: '\/\(tabs\)\/checkin' \}/
    );
  });

  it('com 5 ações a lista rola em tela pequena em vez de cortar o topo do painel', () => {
    expect(src).toMatch(/<ScrollView/);
    expect(src).toMatch(/maxHeight: windowHeight \* 0\.9/);
  });
});
