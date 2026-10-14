/**
 * HealthReportExport — o relatório de saúde em PDF com Baixar e Compartilhar,
 * para a seção "Dados e Armazenamento". (O botão rápido da aba Saúde,
 * HealthReportButton, continua só compartilhando.)
 */
import React from 'react';
import { ExportFileButtons } from '@/components/export-file-buttons';
import { useAppContext } from '@/lib/app-context';
import { medicationAlarms } from '@/lib/alarm-kind';
import { createHealthReportPdf } from '@/lib/health-report-file';

function reportFileName(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `vigora-relatorio-saude-${yyyy}-${mm}-${dd}.pdf`;
}

export function HealthReportExport() {
  const { state } = useAppContext();

  const prepare = async () => {
    const { uri } = await createHealthReportPdf({
      profile: state.profile,
      healthMetrics: state.healthMetrics,
      alarms: medicationAlarms(state.alarms),
    });
    return {
      uri,
      fileName: reportFileName(),
      mimeType: 'application/pdf',
      uti: 'com.adobe.pdf',
      dialogTitle: 'Relatório de saúde',
    };
  };

  return (
    <ExportFileButtons
      label="Relatório de saúde (PDF)"
      hint="Suas medições e lembretes, para mostrar ao médico."
      prepare={prepare}
    />
  );
}
