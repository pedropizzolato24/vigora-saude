/**
 * Regras puras da área "Alarmes de [nome]" do cuidador (spec 4.5 e 6.1).
 * Sem React: o que a tela mostra para cada estado do acordo e cada estado de
 * entrega de um alarme é decidido aqui.
 */
import { describe, expect, it } from 'vitest';
import {
  alarmDeliveryStatus,
  alarmRepeatLabel,
  deliveryText,
  describeMutationError,
  listSummary,
  requestExpiryText,
  screenMode,
  STALE_LIST_MESSAGE,
  toManagedInput,
  type ManagedListView,
  type ManagementView,
} from '../lib/managed-alarms-caregiver';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Horário local de 2026-10-<dia>: o formato HH:MM da tela também é local. */
const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).getTime();

const losartana = { id: 'a1', time: '08:00', description: 'Losartana', enabled: true, repeat: 'daily' as const, sound: true, vibration: true };
const checkin = { id: 'a2', time: '09:00', description: 'Check-in', enabled: true, repeat: 'daily' as const, sound: true, vibration: true, kind: 'checkin' as const, escalateAfterMinutes: 15 as const };

function list(over: Partial<ManagedListView> = {}): ManagedListView {
  return {
    version: 3,
    alarms: [losartana, checkin],
    appliedVersion: 3,
    failedAlarmIds: [],
    appliedAt: at(9, 14, 10),
    updatedAt: at(9, 14, 5),
    ...over,
  };
}

function management(over: Partial<ManagementView> = {}): ManagementView {
  return {
    id: 1,
    status: 'active',
    caregiverOpenId: 'cg-1',
    isMine: true,
    managerName: 'Ana',
    requestedAt: at(1, 10, 0),
    respondedAt: at(1, 11, 0),
    expiresAt: null,
    ...over,
  };
}

describe('screenMode — os estados da spec 6.1', () => {
  it('sem acordo', () => {
    expect(screenMode(null)).toBe('no-agreement');
  });
  it('pedido pendente meu e de outro cuidador', () => {
    expect(screenMode(management({ status: 'pending', isMine: true }))).toBe('pending');
    expect(screenMode(management({ status: 'pending', isMine: false }))).toBe('pending-other');
  });
  it('acordo ativo meu e de outro cuidador', () => {
    expect(screenMode(management({ status: 'active', isMine: true }))).toBe('active-mine');
    expect(screenMode(management({ status: 'active', isMine: false }))).toBe('active-other');
  });
});

describe('requestExpiryText', () => {
  const now = at(9, 10, 0);
  it('conta os dias que faltam, arredondando para cima', () => {
    expect(requestExpiryText(now + 3 * DAY, now)).toBe('vence em 3 dias');
    expect(requestExpiryText(now + 2 * DAY + HOUR, now)).toBe('vence em 3 dias');
    expect(requestExpiryText(now + 12 * HOUR, now)).toBe('vence em 1 dia');
  });
  it('já passou do prazo: vence hoje; sem prazo conhecido: vazio', () => {
    expect(requestExpiryText(now - HOUR, now)).toBe('vence hoje');
    expect(requestExpiryText(null, now)).toBe('');
  });
});

describe('alarmDeliveryStatus — por alarme (spec 4.5)', () => {
  it('versão confirmada e sem falha = confirmado', () => {
    expect(alarmDeliveryStatus(list(), 'a1')).toBe('confirmed');
  });
  it('versão ainda não confirmada = pendente, mesmo que o id tenha falhado na versão anterior', () => {
    expect(alarmDeliveryStatus(list({ appliedVersion: 2 }), 'a1')).toBe('pending');
    expect(alarmDeliveryStatus(list({ appliedVersion: 2, failedAlarmIds: ['a1'] }), 'a1')).toBe('pending');
  });
  it('versão confirmada com o id em failedAlarmIds = falhou; os outros seguem confirmados', () => {
    const l = list({ failedAlarmIds: ['a1'] });
    expect(alarmDeliveryStatus(l, 'a1')).toBe('failed');
    expect(alarmDeliveryStatus(l, 'a2')).toBe('confirmed');
  });
});

describe('deliveryText — as frases da spec 4.5', () => {
  const base = { name: 'Maria', alarm: losartana, pendingSince: at(9, 14, 5) };

  it('confirmado', () => {
    expect(deliveryText('confirmed', { ...base, now: at(9, 14, 20) })).toBe('Tudo certo no celular de Maria.');
  });

  it('pendente há menos de 12 h não traz o pedido para abrir o app', () => {
    expect(deliveryText('pending', { ...base, now: at(9, 20, 0) })).toBe(
      'Ainda não chegou ao celular de Maria (desde 14:05).'
    );
  });

  it('pendente há 12 h ou mais acrescenta "Peça para Maria abrir o Vigora."', () => {
    expect(deliveryText('pending', { ...base, now: at(10, 2, 5) })).toBe(
      'Ainda não chegou ao celular de Maria (desde 09/10 14:05). Peça para Maria abrir o Vigora.'
    );
    expect(deliveryText('pending', { ...base, now: at(9, 14, 5) + 12 * HOUR })).toContain('Peça para Maria abrir o Vigora.');
    expect(deliveryText('pending', { ...base, now: at(9, 14, 5) + 12 * HOUR - 1 })).not.toContain('Peça para');
  });

  it('falha traz o lembrete, o horário e o que fazer', () => {
    expect(deliveryText('failed', { ...base, now: at(9, 20, 0) })).toBe(
      'O celular de Maria não conseguiu agendar: Losartana 08:00. Abra o alarme e salve de novo para tentar outra vez.'
    );
  });

  it('alarme sem nome usa "Lembrete"', () => {
    expect(deliveryText('failed', { ...base, alarm: { ...losartana, description: ' ' }, now: at(9, 20, 0) })).toBe(
      'O celular de Maria não conseguiu agendar: Lembrete 08:00. Abra o alarme e salve de novo para tentar outra vez.'
    );
  });
});

describe('listSummary — o resumo no topo da lista', () => {
  const now = at(9, 20, 0);

  it('tudo confirmado', () => {
    expect(listSummary(list(), 'Maria', now)).toEqual({ tone: 'ok', text: 'Tudo certo no celular de Maria.' });
  });

  it('pendente: mesma frase do alarme pendente, desde a última gravação', () => {
    expect(listSummary(list({ appliedVersion: 2 }), 'Maria', now)).toEqual({
      tone: 'pending',
      text: 'Ainda não chegou ao celular de Maria (desde 14:05).',
    });
  });

  it('falhas: conta só os ids que ainda estão na lista', () => {
    expect(listSummary(list({ failedAlarmIds: ['a1'] }), 'Maria', now)).toEqual({
      tone: 'failed',
      text: 'O celular de Maria não conseguiu agendar 1 alarme. Veja abaixo.',
    });
    expect(listSummary(list({ failedAlarmIds: ['a1', 'a2'] }), 'Maria', now).text).toBe(
      'O celular de Maria não conseguiu agendar 2 alarmes. Veja abaixo.'
    );
    expect(listSummary(list({ failedAlarmIds: ['apagado-ha-muito'] }), 'Maria', now).tone).toBe('ok');
  });
});

describe('alarmRepeatLabel', () => {
  it('descreve a repetição em português', () => {
    expect(alarmRepeatLabel({ ...losartana, repeat: 'daily' })).toBe('Todos os dias');
    expect(alarmRepeatLabel({ ...losartana, repeat: 'weekdays' })).toBe('Dias úteis');
    expect(alarmRepeatLabel({ ...losartana, repeat: 'weekends' })).toBe('Fins de semana');
    expect(alarmRepeatLabel({ ...losartana, repeat: 'custom', customDays: [1, 3, 5] })).toBe('Seg, Qua, Sex');
    expect(alarmRepeatLabel({ ...losartana, repeat: 'custom', customDays: [] })).toBe('Sem dias escolhidos');
  });
});

describe('toManagedInput — o que o AlarmFormModal manda para a rota', () => {
  it('leva só os campos que a rota valida (sem id, sem ids de agendamento)', () => {
    const input = toManagedInput({
      time: '08:00',
      description: 'Losartana',
      enabled: true,
      repeat: 'custom',
      customDays: [1, 3],
      sound: true,
      vibration: false,
      notificationId: 'n-1',
      nativeAlarmUids: ['u-1'],
    });
    expect(input).toEqual({
      time: '08:00',
      description: 'Losartana',
      enabled: true,
      repeat: 'custom',
      customDays: [1, 3],
      sound: true,
      vibration: false,
    });
  });

  it('o "Desligar/Ligar" da linha passa o alarme inteiro: o id não vaza para a rota', () => {
    expect('id' in toManagedInput({ ...losartana, enabled: false })).toBe(false);
  });

  it('check-in leva kind e atraso; remédio não inventa esses campos', () => {
    expect(toManagedInput(checkin)).toMatchObject({ kind: 'checkin', escalateAfterMinutes: 15 });
    const med = toManagedInput({ time: '08:00', description: 'X', enabled: true, repeat: 'daily', sound: true, vibration: true });
    expect('kind' in med).toBe(false);
    expect('escalateAfterMinutes' in med).toBe(false);
    expect('customDays' in med).toBe(false);
  });
});

describe('describeMutationError', () => {
  const NETWORK = 'Não foi possível falar com o servidor. Confira a internet e tente de novo.';

  it('lista velha (CONFLICT) vira o texto da spec', () => {
    expect(describeMutationError({ data: { code: 'CONFLICT' }, message: 'qualquer coisa' }, { staleList: true })).toEqual({
      kind: 'conflict',
      message: 'A lista mudou. Confira de novo.',
    });
    expect(STALE_LIST_MESSAGE).toBe('A lista mudou. Confira de novo.');
  });

  it('CONFLICT fora da lista (outro pedido já existe) mostra a mensagem do servidor', () => {
    expect(describeMutationError({ data: { code: 'CONFLICT' }, message: 'Já existe um pedido para esta pessoa.' }, { staleList: false })).toEqual({
      kind: 'server',
      message: 'Já existe um pedido para esta pessoa.',
    });
  });

  it('mensagem do servidor em português passa direto (limite de 24)', () => {
    expect(describeMutationError({ data: { code: 'BAD_REQUEST' }, message: 'Limite de 24 alarmes atingido.' }, { staleList: true })).toEqual({
      kind: 'server',
      message: 'Limite de 24 alarmes atingido.',
    });
  });

  it('erro de validação do Zod (JSON em inglês) não vai para a tela', () => {
    const r = describeMutationError({ data: { code: 'BAD_REQUEST' }, message: '[\n  { "code": "too_big" }\n]' }, { staleList: true });
    expect(r).toEqual({ kind: 'server', message: 'Não foi possível salvar. Confira os dados e tente de novo.' });
  });

  it('sem resposta do servidor (rede) e erro interno viram a mensagem de conexão', () => {
    expect(describeMutationError(new TypeError('Network request failed'), { staleList: true })).toEqual({ kind: 'network', message: NETWORK });
    expect(describeMutationError({ data: { code: 'INTERNAL_SERVER_ERROR' }, message: 'boom' }, { staleList: true })).toEqual({ kind: 'network', message: NETWORK });
    expect(describeMutationError(undefined, { staleList: false })).toEqual({ kind: 'network', message: NETWORK });
  });
});
