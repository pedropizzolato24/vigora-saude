import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('as três exportações têm Baixar e Compartilhar', () => {
  it('dados em JSON', () => {
    expect(read('components/data-export-button.tsx')).toMatch(/<ExportFileButtons/);
  });
  it('relatório de saúde na seção Dados e Armazenamento (nos dois modos)', () => {
    const settings = read('app/(tabs)/settings.tsx');
    expect((settings.match(/<HealthReportExport \/>/g) ?? []).length).toBe(2);
    expect(read('components/health-report-export.tsx')).toMatch(/<ExportFileButtons/);
  });
  it('ficha de anamnese', () => {
    const anamnesis = read('app/(tabs)/anamnesis.tsx');
    expect((anamnesis.match(/<ExportFileButtons/g) ?? []).length).toBe(2);
    expect(anamnesis).not.toMatch(/exportAnamnesisToPDF/);
  });
});
