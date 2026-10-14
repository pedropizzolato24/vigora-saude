import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('o sistema de check-in paralelo saiu', () => {
  it.each([
    'lib/checkin-service.ts',
    'lib/checkin-notification-handler.ts',
    'lib/checkin-dedup.ts',
    'lib/checkin-defaults.ts',
    'components/checkin-initializer.tsx',
    'app/checkin-response.tsx',
  ])('%s foi removido', (file) => {
    expect(existsSync(join(root, file))).toBe(false);
  });

  it('o layout raiz não monta nem roteia o check-in antigo', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).not.toMatch(/CheckinInitializer\b/);
    expect(layout).not.toMatch(/checkin-response|checkin_prompt|checkin_timeout/);
    expect(layout).toMatch(/CheckinMigrationInitializer/);
  });

  it('as rotas intocáveis não citam mais a tela antiga', () => {
    expect(read('components/app-lock-gate.tsx')).not.toMatch(/checkin-response/);
    expect(read('lib/permissions-check.ts')).not.toMatch(/checkin-response/);
    expect(read('components/update-banner.tsx')).not.toMatch(/checkin-response/);
  });

  it('o canal de notificação do check-in antigo é apagado, não recriado', () => {
    const utils = read('lib/notifications-utils.ts');
    expect(utils).toMatch(/deleteNotificationChannelAsync\(CHECKIN_CHANNEL_ID\)/);
    expect(utils).not.toMatch(/setNotificationChannelAsync\(CHECKIN_CHANNEL_ID/);
    expect(utils).not.toMatch(/checkin_prompt/);
  });

  it('a migração continua lendo os campos antigos (ficam no tipo, @deprecated)', () => {
    expect(read('lib/app-context.tsx')).toMatch(/@deprecated Fase 3/);
  });
});
