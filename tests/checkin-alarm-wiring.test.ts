import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('o check-in toca como alarme', () => {
  it('Android: título, corpo e botão vêm de alarmTexts (nada fixo de remédio)', () => {
    const src = read('lib/native-alarm-manager.ts');
    expect(src).toMatch(/alarmTexts\(alarm\)/);
    expect(src).not.toMatch(/dismissText: 'Dispensar'/);
    expect(src).not.toMatch(/Alarme de Medicamento'/);
  });

  it('iOS < 26: a notificação usa alarmTexts', () => {
    const src = read('lib/notifications-utils.ts');
    expect(src).toMatch(/alarmTexts\(alarm\)/);
  });

  it('iOS 26+: título e botão do AlarmKit vêm de alarmTexts', () => {
    const src = read('lib/ios-alarm-kit.ts');
    expect(src).toMatch(/texts\.alarmKitTitle/);
    expect(src).toMatch(/texts\.stopButtonLabel/);
  });

  it('o evento pré-registrado leva o tipo e o atraso', () => {
    expect(read('lib/monitoring-service.ts')).toMatch(/\.\.\.serverEventExtras\(alarm\)/);
  });

  it('a contagem usa o atraso do check-in e não o timerDuration', () => {
    const handler = read('components/alarm-notification-handler.tsx');
    expect(handler).toMatch(/isCheckinAlarm\(alarmData\)\s*\?\s*escalateSeconds\(alarmData\)/);
    const ring = read('app/alarm-ring.tsx');
    expect(ring).toMatch(/escalateSeconds\(alarm\)/);
  });

  it('a tela do alarme tem a variante de check-in', () => {
    const ring = read('app/alarm-ring.tsx');
    expect(ring).toMatch(/const isCheckin = !!alarm && isCheckinAlarm\(alarm\);/);
    expect(ring).toMatch(/ringCopy\(isCheckin\)/);
    expect(ring).toMatch(/buildCheckinSpeechText\(/);
    expect(ring).not.toMatch(/Mensagem de emergência em'/);
  });

  it('o aviso de "alarmes não confirmados" ignora check-in', () => {
    expect(read('lib/monitoring-service.ts')).toMatch(/e\.kind === 'checkin'/);
  });
});

// Todo chamador de createPendingAlarmEvent entrega um Alarm completo (com kind
// e escalateAfterMinutes): o servidor, ao ver a mesma (alarmId, scheduledAt)
// sem esses campos, volta o evento para remédio/5 min.
describe('todo pré-registro de evento de check-in leva kind e graceMinutes', () => {
  it('createPendingAlarmEvent espalha serverEventExtras(alarm) na mutation', () => {
    const src = read('lib/monitoring-service.ts');
    const fn = src.slice(src.indexOf('export async function createPendingAlarmEvent'));
    const mutation = fn.slice(0, fn.indexOf('console.log'));
    expect(mutation).toMatch(/monitoring\.createEvent/);
    expect(mutation).toMatch(/\.\.\.serverEventExtras\(alarm\)/);
  });

  it('re-sync (syncAlarmsToServer) passa o alarme inteiro do estado', () => {
    const src = read('lib/monitoring-service.ts');
    expect(src).toMatch(/createPendingAlarmEvent\(a, new Date\(fireMs\)\)/);
    expect(src).toMatch(/for \(const a of alarms\)/);
  });

  it('alarm-notification-handler relê o alarme inteiro (estado ou storage) e não monta objeto a partir do payload', () => {
    const src = read('components/alarm-notification-handler.tsx');
    expect(src).toMatch(/createPendingAlarmEvent\(alarmData, /);
    expect(src).toMatch(/alarmData = parsed\?\.alarms\?\.find\(/);
    // o payload/uid só fornece o alarmId; nunca um objeto Alarm literal
    expect(src).not.toMatch(/createPendingAlarmEvent\(\s*\{/);
  });

  it('nenhum outro módulo chama monitoring.createEvent direto', () => {
    for (const f of [
      'lib/checkin-service.ts',
      'components/alarm-notification-handler.tsx',
      'app/alarm-ring.tsx',
      'lib/ios-alarm-kit.ts',
    ]) {
      expect(read(f)).not.toMatch(/monitoring\.createEvent/);
    }
  });
});
