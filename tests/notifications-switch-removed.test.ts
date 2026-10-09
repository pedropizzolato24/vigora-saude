import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Interruptor "Notificações" removido da tela do monitorado', () => {
  const src = read('app/(tabs)/settings.tsx');

  it('nenhum controle (modo acessível ou normal) é ligado a notificationsEnabled', () => {
    expect(src).not.toMatch(/notificationsEnabled/);
  });

  it('o rótulo do interruptor não aparece nos dois modos', () => {
    expect(src).not.toMatch(/label="Notificações"/);
    expect(src).not.toMatch(/Alertas de alarmes/);
    expect(src).not.toMatch(/Avisos quando o alarme tocar/);
  });

  it('a vibração continua nos dois modos', () => {
    const ocorrencias = src.match(/updateSetting\('vibrationEnabled'/g) ?? [];
    expect(ocorrencias).toHaveLength(2);
  });
});

describe('notificationsEnabled continua no tipo, marcado como obsoleto', () => {
  const ctx = read('lib/app-context.tsx');

  it('o campo e o padrão permanecem (a migração do check-in lê o valor)', () => {
    expect(ctx).toMatch(/notificationsEnabled: boolean;/);
    expect(ctx).toMatch(/notificationsEnabled: true,/);
  });

  it('o campo no tipo tem @deprecated citando a migração', () => {
    expect(ctx).toMatch(/\/\*\*\s*@deprecated[^*]*checkin-migration[^*]*\*\/\s*\n\s*notificationsEnabled: boolean;/);
  });
});
