import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Idioma removido (não havia tradução por trás)', () => {
  it('a tela de configurações não oferece idioma', () => {
    expect(read('app/(tabs)/settings.tsx')).not.toMatch(/title="Idioma"/);
  });
  it('o estado não guarda mais a preferência', () => {
    const ctx = read('lib/app-context.tsx');
    expect(ctx).not.toMatch(/language: 'pt' \| 'en'/);
    expect(ctx).not.toMatch(/language: 'pt',/);
  });
});

describe('Interruptores de notificação do cuidador removidos', () => {
  it('a tela do cuidador não tem os três interruptores', () => {
    const src = read('app/(caregiver-tabs)/settings.tsx');
    expect(src).not.toMatch(/Medicação perdida|SOS acionado|Dead man's switch/);
    expect(src).not.toMatch(/updateNotificationPrefs/);
  });
  it('o estado do cuidador não guarda mais preferências', () => {
    expect(read('lib/caregiver-state.ts')).not.toMatch(/notificationPrefs|UPDATE_PREFS/);
    expect(read('lib/caregiver-context.tsx')).not.toMatch(/notificationPrefs|updateNotificationPrefs/);
  });
});
