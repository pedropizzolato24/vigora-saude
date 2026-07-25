import { describe, expect, it } from 'vitest';
import { MIN_TOUCH, SCALE_FACTORS, touchTargetFor } from '@/lib/_core/font-scale';

describe('touchTargetFor', () => {
  it('mantém o tamanho declarado na escala média', () => {
    expect(touchTargetFor(56, SCALE_FACTORS.medium)).toBe(56);
    expect(touchTargetFor(48, SCALE_FACTORS.medium)).toBe(48);
  });

  it('cresce junto com a fonte na escala grande', () => {
    expect(touchTargetFor(56, SCALE_FACTORS.large)).toBe(67);
    expect(touchTargetFor(48, SCALE_FACTORS.large)).toBe(58);
  });

  it('encolhe na escala pequena, mas nunca abaixo do piso de toque', () => {
    // 56 × 0.85 = 47.6 → 48 (acima do piso, encolhe de verdade)
    expect(touchTargetFor(56, SCALE_FACTORS.small)).toBe(48);
    // 44 × 0.85 = 37.4 → travado no piso
    expect(touchTargetFor(44, SCALE_FACTORS.small)).toBe(MIN_TOUCH);
    expect(touchTargetFor(36, SCALE_FACTORS.small)).toBe(MIN_TOUCH);
  });

  it('respeita o piso em todas as escalas', () => {
    for (const scale of Object.values(SCALE_FACTORS)) {
      for (const base of [36, 40, 44, 48, 52, 56, 64, 80]) {
        expect(touchTargetFor(base, scale)).toBeGreaterThanOrEqual(MIN_TOUCH);
      }
    }
  });

  it('é monotônico entre escalas (pequeno ≤ médio ≤ grande)', () => {
    for (const base of [44, 48, 52, 56, 64, 80]) {
      const small = touchTargetFor(base, SCALE_FACTORS.small);
      const medium = touchTargetFor(base, SCALE_FACTORS.medium);
      const large = touchTargetFor(base, SCALE_FACTORS.large);
      expect(small).toBeLessThanOrEqual(medium);
      expect(medium).toBeLessThanOrEqual(large);
    }
  });
});
