import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidPlanPhone, sanitizePlanPhone } from '../lib/health-plan-phone';

describe('sanitizePlanPhone', () => {
  it('mantém só dígitos', () => {
    expect(sanitizePlanPhone('0800 123-4567')).toBe('08001234567');
  });
  it('descarta o 55 do país em número com 12 ou 13 dígitos', () => {
    expect(sanitizePlanPhone('5511912345678')).toBe('11912345678');
    expect(sanitizePlanPhone('+55 (11) 91234-5678')).toBe('11912345678');
    expect(sanitizePlanPhone('551134567890')).toBe('1134567890');
  });
});

describe('isValidPlanPhone', () => {
  it('aceita de 8 a 11 dígitos', () => {
    expect(isValidPlanPhone('40041234')).toBe(true);
    expect(isValidPlanPhone('08001234567')).toBe(true);
    expect(isValidPlanPhone('11912345678')).toBe(true);
    expect(isValidPlanPhone(sanitizePlanPhone('5511912345678'))).toBe(true);
  });
  it('recusa curto, longo, vazio e não numérico', () => {
    expect(isValidPlanPhone('1234567')).toBe(false);
    expect(isValidPlanPhone('123456789012')).toBe(false);
    expect(isValidPlanPhone('1234567890123')).toBe(false);
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
  it('normaliza o telefone na exibição e na discagem', () => {
    expect(src).toMatch(/sanitizePlanPhone\(anamnesis\?\.healthPlanPhone/);
  });
});

describe('tela Anamnese', () => {
  const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'anamnesis.tsx'), 'utf8');
  it('reage ao parâmetro ?step=plan mesmo já montada', () => {
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(stepParam === 'plan'\) setWizardStep\(3\);\s*\}, \[stepParam\]\)/);
  });
});
