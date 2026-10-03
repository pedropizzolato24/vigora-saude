import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_ALARM_FORM, emptyFormFor, formFromAlarm } from '../lib/alarm-form';
import type { Alarm } from '../lib/app-context';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('formulário de check-in', () => {
  it('novo check-in: horário 09:00, nome fixo e aviso em 15 min', () => {
    expect(emptyFormFor('checkin')).toMatchObject({
      time: '09:00', description: 'Check-in', kind: 'checkin', escalateAfterMinutes: 15,
      repeat: 'daily', sound: true, vibration: true, enabled: true,
    });
  });
  it('novo remédio continua em branco', () => {
    expect(emptyFormFor('medication')).toEqual(EMPTY_ALARM_FORM);
  });
  it('editar um check-in leva kind e atraso', () => {
    const alarm: Alarm = {
      id: 'c1', time: '09:00', description: 'Check-in', enabled: true, repeat: 'daily',
      customDays: [], sound: true, vibration: true, kind: 'checkin', escalateAfterMinutes: 10,
    };
    expect(formFromAlarm(alarm)).toMatchObject({ kind: 'checkin', escalateAfterMinutes: 10 });
  });
});

describe('telas', () => {
  it('Remédios e Check-in usam a mesma lista, por tipo', () => {
    expect(read('app/(tabs)/alarms.tsx')).toMatch(/<AlarmListScreen kind="medication" \/>/);
    expect(read('app/(tabs)/checkin.tsx')).toMatch(/<AlarmListScreen kind="checkin" \/>/);
  });
  it('a aba Check-in está registrada', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/name="checkin"/);
  });
  it('o Início troca "Avisar família" por "Check-in" (contatos continuam em Tudo)', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).not.toMatch(/title="Avisar família"/);
    expect(home).toMatch(/title="Check-in"/);
    expect(read('app/(tabs)/tudo.tsx')).toMatch(/\/\(tabs\)\/contacts/);
  });
  it('o formulário esconde o nome e mostra o atraso do aviso no check-in', () => {
    const modal = read('components/alarm-form-modal.tsx');
    expect(modal).toMatch(/Avisar meu cuidador depois de/);
    expect(modal).toMatch(/CHECKIN_ESCALATE_OPTIONS/);
  });
  it('as Configurações têm só um atalho para o check-in', () => {
    const settings = read('app/(tabs)/settings.tsx');
    expect(settings).toMatch(/\/\(tabs\)\/checkin/);
    expect(settings).not.toMatch(/scheduleCheckin|cancelCheckin|DateTimePicker/);
  });
});

describe('inicializador da migração do check-in', () => {
  const src = readFileSync(join(__dirname, '..', 'components/checkin-migration-initializer.tsx'), 'utf8');
  it('cancela as notificações antigas antes das portas (desligado, cuidador, sem login)', () => {
    const cancel = src.indexOf('await cancelLegacyCheckinNotifications();');
    expect(cancel).toBeGreaterThan(src.indexOf('!user?.openId'));
    expect(src).toMatch(/!state\.settings\.checkinEnabled \|\| !user\?\.openId \|\| user\.userType === 'caregiver'\) \{\s*await cancelLegacyCheckinNotifications\(\);\s*return;/);
  });
  it('migração que falha avisa por AppDialog, uma vez por abertura', () => {
    expect(src).toMatch(/Não foi possível mover o seu check-in/);
    expect(src).toMatch(/Abrir Check-in/);
    expect(src).toMatch(/failureDialogShown/);
    expect(src).not.toMatch(/Alert\.alert/);
  });
});

describe('proibidos do aviso 60+', () => {
  it('o termo iOS de fato acusa a palavra e poupa "Remédios"', () => {
    const proibidos = readFileSync(join(__dirname, '..', 'tests/alarm-setup-prompts.test.ts'), 'utf8');
    expect(proibidos).toContain('"' + String.fromCharCode(92, 92) + 'biOS' + String.fromCharCode(92, 92) + 'b"');
    const re = new RegExp(String.fromCharCode(92) + 'biOS' + String.fromCharCode(92) + 'b', 'i');
    expect(re.test('abrir no iOS agora')).toBe(true);
    expect(re.test('Remédios')).toBe(false);
  });
});
