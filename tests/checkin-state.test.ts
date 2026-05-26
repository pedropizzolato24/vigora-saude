// tests/checkin-state.test.ts
import { describe, it, expect } from 'vitest';
import { checkinDefaults } from '../lib/checkin-defaults';

describe('checkin defaults', () => {
  it('checkinEnabled é false por padrão', () => {
    expect(checkinDefaults.checkinEnabled).toBe(false);
  });

  it('checkinTime é 09:00 por padrão', () => {
    expect(checkinDefaults.checkinTime).toBe('09:00');
  });

  it('checkinWindowMinutes é 30 por padrão', () => {
    expect(checkinDefaults.checkinWindowMinutes).toBe(30);
  });
});
