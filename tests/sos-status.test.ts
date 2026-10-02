import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SOS_CALL_NUMBER,
  SOS_SPOKEN_CONFIRMATION,
  emptyEscalation,
  sosContactStatus,
  sosSummary,
} from '../lib/sos-status';
import type { EmergencyContact } from '../lib/app-context';
import type { EscalationResult } from '../lib/alarm-escalation';

const contact = (over: Partial<EmergencyContact> = {}): EmergencyContact => ({
  id: 'c1',
  name: 'Ana',
  phone: '11999990000',
  relation: 'Filha',
  whatsapp: true,
  ...over,
});

const result = (totalSent: number): EscalationResult => ({
  method: totalSent > 0 ? 'server_api' : 'none',
  deepLinkSent: 0,
  deepLinkFailed: 0,
  serverApiSent: totalSent,
  serverApiFailed: 0,
  totalSent,
  totalFailed: 0,
});

describe('sosContactStatus', () => {
  it('contato sem WhatsApp nunca é avisado', () => {
    expect(sosContactStatus(contact({ whatsapp: false }), 2, result(2))).toBe('no_whatsapp');
    expect(sosContactStatus(contact({ whatsapp: false }), 2, null)).toBe('no_whatsapp');
  });

  it('enquanto o envio não terminou, está enviando', () => {
    expect(sosContactStatus(contact(), 2, null)).toBe('sending');
  });

  it('todos alcançados: enviado', () => {
    expect(sosContactStatus(contact(), 2, result(2))).toBe('sent');
  });

  it('ninguém alcançado: falhou', () => {
    expect(sosContactStatus(contact(), 2, result(0))).toBe('failed');
  });

  it('só alguns alcançados: parcial (o resultado não diz quais)', () => {
    expect(sosContactStatus(contact(), 3, result(1))).toBe('partial');
  });
});

const deepLinkOnly = (n: number): EscalationResult => ({
  method: 'deeplink',
  deepLinkSent: n,
  deepLinkFailed: 0,
  serverApiSent: 0,
  serverApiFailed: 0,
  totalSent: n,
  totalFailed: 0,
});

describe('deep link não conta como aviso enviado', () => {
  it('só deep link: WhatsApp aberto, falta enviar', () => {
    expect(sosContactStatus(contact(), 2, deepLinkOnly(2))).toBe('opened');
    expect(sosSummary(2, deepLinkOnly(2))).toBe('WhatsApp aberto: toque em enviar para avisar');
  });
  it('enviado pelo servidor segue igual', () => {
    expect(sosContactStatus(contact(), 2, result(2))).toBe('sent');
    expect(sosSummary(2, result(2))).toBe('2 de 2 contato(s) avisado(s)');
  });
  it('misto: a contagem usa só o que o servidor enviou', () => {
    const mixed: EscalationResult = { ...result(1), method: 'both', deepLinkSent: 2, totalSent: 3 };
    expect(sosContactStatus(contact(), 3, mixed)).toBe('partial');
    expect(sosSummary(3, mixed)).toBe('1 de 3 contato(s) avisado(s)');
  });
});

describe('sosSummary', () => {
  it('sem contato com WhatsApp não há resumo', () => {
    expect(sosSummary(0, null)).toBeNull();
  });
  it('enviando e concluído', () => {
    expect(sosSummary(3, null)).toBe('Enviando os avisos…');
    expect(sosSummary(3, result(2))).toBe('2 de 3 contato(s) avisado(s)');
  });
  it('nunca passa de 100% (deep link + servidor podem somar além)', () => {
    expect(sosSummary(2, result(5))).toBe('2 de 2 contato(s) avisado(s)');
  });
});

describe('emptyEscalation', () => {
  it('é um resultado de falha total', () => {
    const r = emptyEscalation(3);
    expect(r.totalSent).toBe(0);
    expect(r.totalFailed).toBe(3);
    expect(r.method).toBe('none');
  });
});

describe('SOS não promete o que não faz', () => {
  it('a voz não diz que está ligando para o SAMU', () => {
    expect(SOS_SPOKEN_CONFIRMATION).not.toMatch(/ligando/i);
    expect(SOS_SPOKEN_CONFIRMATION).toMatch(/toque no botão vermelho/i);
  });

  it('o diálogo de contagem fala o texto honesto', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'sos-countdown-dialog.tsx'), 'utf8');
    expect(src).toMatch(/Speech\.speak\(SOS_SPOKEN_CONFIRMATION/);
    expect(src).not.toMatch(/ligando para o SAMU/);
  });

  it('a tela do SOS abre o discador com o 192 e não simula status por timer', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'sos-active-screen.tsx'), 'utf8');
    expect(src).toMatch(/Linking\.openURL\(`tel:\$\{SOS_CALL_NUMBER\}`\)/);
    expect(src).not.toMatch(/1200 \+ i \* 600/);
    expect(SOS_CALL_NUMBER).toBe('192');
  });

  it('o tel:192 só é aberto dentro do onPress do botão de confirmação', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'sos-active-screen.tsx'), 'utf8');
    const open = 'Linking.openURL(`tel:${SOS_CALL_NUMBER}`)';
    expect(src.split(open).length - 1).toBe(1);
    const btn = src.indexOf('text: `Ligar ${SOS_CALL_NUMBER}`');
    const call = src.indexOf(open);
    expect(btn).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(btn);
    expect(src.slice(btn, call)).toMatch(/onPress/);
  });

  it('a tela não afirma ajuda a caminho nem contatos notificados', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'sos-active-screen.tsx'), 'utf8');
    expect(src).not.toMatch(/Ajuda está a caminho/);
    expect(src).not.toMatch(/foram notificados/);
  });
});
