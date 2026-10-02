import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidPlanPhone, sanitizePlanPhone } from '../lib/health-plan-phone';

describe('sanitizePlanPhone', () => {
  it('mantém só dígitos e corta em 13', () => {
    expect(sanitizePlanPhone('0800 123-4567')).toBe('08001234567');
    expect(sanitizePlanPhone('+55 (11) 91234-5678 99')).toBe('5511912345678');
  });
});

describe('isValidPlanPhone', () => {
  it('aceita de 8 a 13 dígitos', () => {
    expect(isValidPlanPhone('40041234')).toBe(true);
    expect(isValidPlanPhone('08001234567')).toBe(true);
    expect(isValidPlanPhone('5511912345678')).toBe(true);
  });
  it('recusa curto, longo, vazio e não numérico', () => {
    expect(isValidPlanPhone('1234567')).toBe(false);
    expect(isValidPlanPhone('12345678901234')).toBe(false);
    expect(isValidPlanPhone('')).toBe(false);
    expect(isValidPlanPhone(undefined)).toBe(false);
    expect(isValidPlanPhone('0800-123')).toBe(false);
  });
});

describe('tela Ambulância', () => {
  const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'ambulance.tsx'), 'utf8');
  it('disca o telefone do plano, nunca o número da carteirinha', () => {
    expect(src).toMatch(/healthPlanPhone/);
    expect(src).not.toMatch(/phone: anamnesis\?\.healthPlanNumber/);
    expect(src).not.toMatch(/phone: anamnesis\?\.healthPlanNumber \|\| ''/);
  });
});
