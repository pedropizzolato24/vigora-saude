import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// lib/app-context.tsx e o widget (react-native-android-widget) não carregam sob
// vitest, então estas travas são no nível do código-fonte.
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('widget de remédios', () => {
  const src = read('widgets/widget-task-handler.tsx');
  it('getNextAlarmFromStorage ignora check-in (sem kind = remédio)', () => {
    expect(src).toContain("import { medicationAlarms } from '@/lib/alarm-kind';");
    expect(src).toContain("kind?: 'medication' | 'checkin';");
    expect(src).toMatch(/medicationAlarms\(alarms\)\.filter\(\(a\) => a\.enabled\)/);
  });
});

describe('ADD_ALARM idempotente por id', () => {
  const src = read('lib/app-context.tsx').replace(/\r\n/g, '\n');
  const block = src.slice(src.indexOf("case 'ADD_ALARM'"), src.indexOf("case 'UPDATE_ALARM'"));
  it('substitui no lugar e o teto só vale para alarme novo', () => {
    expect(block).toContain('const exists = state.alarms.some((a) => a.id === action.payload.id);');
    expect(block).toContain('if (!exists && state.alarms.length >= 24) return state;');
    expect(block).toContain('state.alarms.filter((a) => a.id !== action.payload.id)');
  });
});
