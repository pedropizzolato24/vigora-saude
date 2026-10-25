/**
 * Cirurgias e internações da ficha de anamnese.
 *
 * Só guarda o que a pessoa digitou: nada aqui interpreta, classifica ou
 * sugere algo a partir do registro (linha ANVISA, app não clínico).
 */

export interface SurgeryRecord {
  id: string;
  /** O que foi feito, em texto livre. Ex.: "Cirurgia de catarata". */
  name: string;
  /** Mês com 2 dígitos ("01" a "12") ou "" quando a pessoa não lembra. */
  month: string;
  /** Ano com 4 dígitos ou "" quando não informado. */
  year: string;
  /** Observação livre opcional (hospital, médico, lado operado...). */
  notes: string;
}

export const SURGERY_LIMITS = {
  maxItems: 30,
  name: 80,
  notes: 200,
} as const;

const MIN_YEAR = 1900;

export function emptySurgery(id: string): SurgeryRecord {
  return { id, name: '', month: '', year: '', notes: '' };
}

/** Mantém só dígitos, até `max` caracteres (para os campos de mês e ano). */
export function digitsOnly(input: string, max: number): string {
  return input.replace(/\D/g, '').slice(0, max);
}

export type SurgeryDateError = 'month' | 'year' | 'month-without-year' | null;

/** Valida mês e ano. Os dois são opcionais, mas mês sozinho não diz quando foi. */
export function surgeryDateError(s: Pick<SurgeryRecord, 'month' | 'year'>, now = new Date()): SurgeryDateError {
  const { month, year } = s;
  if (month) {
    const m = Number(month);
    if (!/^\d{1,2}$/.test(month) || m < 1 || m > 12) return 'month';
  }
  if (year) {
    const y = Number(year);
    if (!/^\d{4}$/.test(year) || y < MIN_YEAR || y > now.getFullYear()) return 'year';
  }
  if (month && !year) return 'month-without-year';
  return null;
}

export const SURGERY_DATE_ERROR_TEXT: Record<Exclude<SurgeryDateError, null>, string> = {
  month: 'Mês inválido. Use um número de 1 a 12.',
  year: 'Ano inválido. Use 4 números, como 2015.',
  'month-without-year': 'Informe também o ano.',
};

/** "03/2015", "2015" ou "Data não informada". */
export function formatSurgeryDate(s: Pick<SurgeryRecord, 'month' | 'year'>): string {
  if (!s.year) return 'Data não informada';
  if (!s.month) return s.year;
  return `${s.month.padStart(2, '0')}/${s.year}`;
}

/**
 * Lê a lista vinda do aparelho, da nuvem ou do cuidador. Fichas antigas não
 * têm o campo; dado malformado vira lista vazia em vez de quebrar a tela.
 */
export function readSurgeries(value: unknown): SurgeryRecord[] {
  if (!Array.isArray(value)) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    .map((v, i) => ({
      id: str(v.id) || `surgery-${i}`,
      name: str(v.name),
      month: str(v.month),
      year: str(v.year),
      notes: str(v.notes),
    }))
    .slice(0, SURGERY_LIMITS.maxItems);
}

/** Antes de salvar: tira espaços, descarta itens sem nome e aplica os limites. */
export function cleanSurgeries(list: SurgeryRecord[]): SurgeryRecord[] {
  return list
    .map((s) => ({
      ...s,
      name: s.name.trim().slice(0, SURGERY_LIMITS.name),
      month: s.month ? s.month.padStart(2, '0') : '',
      year: s.year.trim(),
      notes: s.notes.trim().slice(0, SURGERY_LIMITS.notes),
    }))
    .filter((s) => s.name.length > 0)
    .slice(0, SURGERY_LIMITS.maxItems);
}

/** Índice do primeiro item com data inválida, ou -1. Itens sem nome são ignorados. */
export function firstInvalidSurgery(list: SurgeryRecord[], now = new Date()): number {
  return list.findIndex((s) => s.name.trim() && surgeryDateError(s, now) !== null);
}

/** Para leitura (PDF e cuidador): mais recente primeiro, sem data no fim. */
export function sortSurgeriesForDisplay(list: SurgeryRecord[]): SurgeryRecord[] {
  const key = (s: SurgeryRecord) => (s.year ? Number(s.year) * 100 + (Number(s.month) || 0) : -1);
  return [...list].sort((a, b) => key(b) - key(a));
}
