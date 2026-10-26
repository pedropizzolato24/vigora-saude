import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-print', () => ({ printToFileAsync: vi.fn() }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));

import {
  cleanSurgeries,
  firstInvalidSurgery,
  formatSurgeryDate,
  readSurgeries,
  sortSurgeriesForDisplay,
  surgeryDateError,
  SURGERY_LIMITS,
  type SurgeryRecord,
} from '../lib/surgeries';
import { generateAnamnesisPDF } from '../lib/pdf-utils-v2';
import type { AnamnesesData } from '../lib/app-context';

const NOW = new Date('2026-10-25T12:00:00Z');
const s = (over: Partial<SurgeryRecord> = {}): SurgeryRecord => ({ id: 'x', name: 'Catarata', month: '', year: '', notes: '', ...over });

describe('cirurgias: datas', () => {
  it('mês e ano são opcionais; mês sozinho pede o ano', () => {
    expect(surgeryDateError(s(), NOW)).toBeNull();
    expect(surgeryDateError(s({ year: '2015' }), NOW)).toBeNull();
    expect(surgeryDateError(s({ month: '3', year: '2015' }), NOW)).toBeNull();
    expect(surgeryDateError(s({ month: '3' }), NOW)).toBe('month-without-year');
  });

  it('recusa mês fora de 1 a 12 e ano fora de 1900 até o ano atual', () => {
    expect(surgeryDateError(s({ month: '0', year: '2015' }), NOW)).toBe('month');
    expect(surgeryDateError(s({ month: '13', year: '2015' }), NOW)).toBe('month');
    expect(surgeryDateError(s({ year: '1899' }), NOW)).toBe('year');
    expect(surgeryDateError(s({ year: '2027' }), NOW)).toBe('year');
    expect(surgeryDateError(s({ year: '201' }), NOW)).toBe('year');
  });

  it('formata como MM/AAAA, AAAA ou "Data não informada"', () => {
    expect(formatSurgeryDate(s({ month: '3', year: '2015' }))).toBe('03/2015');
    expect(formatSurgeryDate(s({ year: '2015' }))).toBe('2015');
    expect(formatSurgeryDate(s())).toBe('Data não informada');
  });

  it('firstInvalidSurgery ignora itens sem nome', () => {
    expect(firstInvalidSurgery([s({ name: '', month: '99' }), s({ year: '2015' })], NOW)).toBe(-1);
    expect(firstInvalidSurgery([s({ year: '2015' }), s({ month: '13', year: '2015' })], NOW)).toBe(1);
  });
});

describe('cirurgias: leitura e limpeza', () => {
  it('ficha antiga ou dado malformado vira lista vazia', () => {
    expect(readSurgeries(undefined)).toEqual([]);
    expect(readSurgeries('texto')).toEqual([]);
    expect(readSurgeries([null, 3, { name: 'Apendicite', year: 1990 }])).toEqual([
      { id: 'surgery-0', name: 'Apendicite', month: '', year: '', notes: '' },
    ]);
  });

  it('ao salvar: tira espaços, descarta itens sem nome, completa o mês e aplica limites', () => {
    const out = cleanSurgeries([
      s({ name: '  Catarata  ', month: '3', year: '2015', notes: ' olho direito ' }),
      s({ id: 'y', name: '   ' }),
      s({ id: 'z', name: 'x'.repeat(200) }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: 'Catarata', month: '03', notes: 'olho direito' });
    expect(out[1].name).toHaveLength(SURGERY_LIMITS.name);
    const many = Array.from({ length: 40 }, (_, i) => s({ id: String(i) }));
    expect(cleanSurgeries(many)).toHaveLength(SURGERY_LIMITS.maxItems);
  });

  it('para leitura: mais recente primeiro, sem data no fim', () => {
    const out = sortSurgeriesForDisplay([
      s({ id: 'a', year: '' }),
      s({ id: 'b', year: '2010' }),
      s({ id: 'c', month: '5', year: '2020' }),
      s({ id: 'd', month: '1', year: '2020' }),
    ]);
    expect(out.map((x) => x.id)).toEqual(['c', 'd', 'b', 'a']);
  });
});

describe('cirurgias no PDF', () => {
  const base = {
    fullName: 'Maria', birthDate: '12/04/1950', gender: 'F', allergies: '', medications: '', diseases: '',
    susNumber: '', healthPlanProvider: '', healthPlanNumber: '',
  } as AnamnesesData;

  it('lista cada cirurgia com data e observação, com escape de HTML', () => {
    const html = generateAnamnesisPDF({
      ...base,
      surgeries: [s({ name: 'Catarata <b>x</b>', month: '3', year: '2015', notes: 'olho direito' })],
    });
    expect(html).toContain('Cirurgias e Internações');
    expect(html).toContain('03/2015');
    expect(html).toContain('olho direito');
    expect(html).toContain('Catarata &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('sem cirurgias (ou ficha antiga), mostra "Nenhuma informada"', () => {
    const html = generateAnamnesisPDF(base);
    const secao = html.slice(html.indexOf('Cirurgias e Internações'));
    expect(secao).toContain('Nenhuma informada');
  });

  it('data de nascimento no formato do app (DD/MM/AAAA) sai certa', () => {
    const html = generateAnamnesisPDF(base);
    expect(html).toContain('12/04/1950');
    expect(html).not.toContain('undefined');
  });
});

describe('telas', () => {
  const root = join(__dirname, '..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('anamnese: passo "Cirurgias" no wizard (4 passos) e no modo acessível', () => {
    const src = read('app/(tabs)/anamnesis.tsx');
    expect(src.match(/total=\{4\}/g)).toHaveLength(4);
    expect(src).toContain('categoryTag="Cirurgias"');
    expect(src.match(/<SurgeryListEditor /g)).toHaveLength(2);
    // ?step=plan continua abrindo o passo do plano
    expect(src).toContain("stepParam === 'plan' ? 4 : 1");
  });

  it('cuidador vê a seção de cirurgias', () => {
    const src = read('app/(caregiver-tabs)/person.tsx');
    expect(src).toContain('title="Cirurgias e internações"');
    expect(src).toContain('readSurgeries(anamnesis?.surgeries)');
  });
});
