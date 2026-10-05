import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeAlarmCount, alarmHubStatus } from '../lib/alarm-kind';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

type A = { enabled: boolean; time: string; kind?: 'checkin' };
const med = (time: string, enabled = true): A => ({ enabled, time });
const chk = (time: string, enabled = true): A => ({ enabled, time, kind: 'checkin' });
const ao10h = new Date(2026, 9, 5, 10, 0);

describe('alarmHubStatus', () => {
  it('conta só remédios ligados no card Remédios (singular, plural, nenhum)', () => {
    expect(alarmHubStatus([], ao10h).medicationText).toBe('Nenhum lembrete ativo');
    expect(alarmHubStatus([med('08:00', false), chk('09:00')], ao10h).medicationText).toBe('Nenhum lembrete ativo');
    expect(alarmHubStatus([med('08:00'), chk('09:00')], ao10h).medicationText).toBe('1 lembrete ativo');
    expect(alarmHubStatus([med('08:00'), med('20:00'), med('22:00', false)], ao10h).medicationText).toBe('2 lembretes ativos');
  });

  it('mostra o próximo check-in ligado, dando a volta na meia-noite', () => {
    expect(alarmHubStatus([chk('09:00'), chk('21:00')], ao10h).checkinText).toBe('Próximo: 21:00');
    expect(alarmHubStatus([chk('09:00')], ao10h).checkinText).toBe('Próximo: 09:00');
    expect(alarmHubStatus([chk('09:00'), chk('08:00')], ao10h).checkinText).toBe('Próximo: 08:00');
  });

  it('sem check-in ligado: "Nenhum check-in ativo" (remédio e desligado não contam)', () => {
    expect(alarmHubStatus([], ao10h).checkinText).toBe('Nenhum check-in ativo');
    expect(alarmHubStatus([med('12:00'), chk('21:00', false)], ao10h).checkinText).toBe('Nenhum check-in ativo');
  });
});

describe('activeAlarmCount (selo da aba)', () => {
  it('soma remédios ligados e check-ins ligados', () => {
    expect(activeAlarmCount([])).toBe(0);
    expect(activeAlarmCount([med('08:00'), med('09:00', false), chk('10:00'), chk('11:00', false)])).toBe(2);
    expect(activeAlarmCount([chk('10:00')])).toBe(1);
  });
});

describe('barra de abas', () => {
  const bar = read('components/custom-tab-bar.tsx');
  it('a aba virou "Alarmes", ícone alarm, rota do hub', () => {
    expect(bar).toMatch(/\{ label: 'Alarmes', icon: 'alarm', route: '\/\(tabs\)\/alarm-hub'/);
    expect(bar).not.toMatch(/label: 'Remédios'/);
  });
  it('fica ativa no hub, em /alarms e em /checkin', () => {
    expect(bar).toMatch(/alsoActiveOn: \['\/\(tabs\)\/alarms', '\/\(tabs\)\/checkin'\]/);
    expect(bar).toMatch(/\.some\(/);
  });
  it('o selo é do hub e conta remédios + check-ins', () => {
    expect(bar).toMatch(/tab\.route === '\/\(tabs\)\/alarm-hub' && activeCount > 0/);
    expect(bar).toMatch(/activeAlarmCount\(state\.alarms\)/);
  });
});

describe('tela Alarmes (hub)', () => {
  const hubSrc = () => read('app/(tabs)/alarm-hub.tsx');
  it('está registrada no layout das abas', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/name="alarm-hub"/);
  });
  it('tem os dois cartões com rota, texto e ícone', () => {
    expect(hubSrc()).toMatch(/title: 'Remédios'/);
    expect(hubSrc()).toMatch(/icon: 'medication'/);
    expect(hubSrc()).toMatch(/Lembretes para tomar seus remédios na hora certa\./);
    expect(hubSrc()).toMatch(/route: '\/\(tabs\)\/alarms'/);
    expect(hubSrc()).toMatch(/title: 'Check-in diário'/);
    expect(hubSrc()).toMatch(/Todo dia o Vigora pergunta se está tudo bem\. Se você não responder, sua família é avisada\./);
    expect(hubSrc()).toMatch(/route: '\/\(tabs\)\/checkin'/);
  });
  it('cartão inteiro tocável, com rótulo de título + status', () => {
    expect(hubSrc()).toMatch(/accessibilityRole="button"/);
    expect(hubSrc()).toMatch(/accessibilityLabel=\{`\$\{card\.title\}\. \$\{status\}/);
  });
  it('título "Alarmes", safe area e ramo do modo acessível', () => {
    expect(hubSrc()).toMatch(/Alarmes/);
    expect(hubSrc()).toMatch(/insets\.top \+ 12/);
    expect(hubSrc()).toMatch(/if \(isAccessibilityMode\)/);
    expect(hubSrc()).toMatch(/a11yColors/);
  });
});
