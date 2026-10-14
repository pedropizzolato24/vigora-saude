import * as Print from 'expo-print';
import type { Alarm, HealthMetric, UserProfile } from '@/lib/app-context';
import { buildReportHtml } from '@/lib/health-report-generator';

/** Gera o PDF do relatório de saúde no cache do app. `html` volta para o fallback de impressão da web. */
export async function createHealthReportPdf(data: {
  profile: UserProfile;
  healthMetrics: HealthMetric[];
  alarms: Alarm[];
}): Promise<{ uri: string; html: string }> {
  const html = buildReportHtml({ ...data, generatedAt: Date.now() });
  const { uri } = await Print.printToFileAsync({
    html,
    width: 612, // US Letter width em pontos (72 PPI)
    height: 792, // US Letter height em pontos
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  return { uri, html };
}
