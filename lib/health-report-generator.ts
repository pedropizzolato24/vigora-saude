/**
 * health-report-generator.ts
 *
 * Gera um relatório de saúde mensal em PDF usando expo-print.
 * O relatório inclui:
 * - Cabeçalho com dados do paciente e período
 * - Resumo das métricas (última leitura + status)
 * - Gráficos SVG de evolução para cada tipo de métrica
 * - Tabela de alarmes do mês (horário, medicamento, status)
 *
 * Usa HTML + SVG inline para compatibilidade máxima com expo-print.
 *
 * SECURITY: All user-supplied strings (profile.name, alarm.description,
 * anamnesis.fullName, etc.) are routed through `esc()` before being
 * interpolated. The previous version concatenated raw user input into
 * the HTML, allowing trivial HTML/script injection when the PDF was
 * later viewed in a WebView or shared as HTML.
 */

import type { HealthMetric, Alarm, UserProfile } from './app-context';

/**
 * Escape a string for safe interpolation into HTML.
 * Maps the 5 HTML metacharacters to entities. We do NOT pre-encode the
 * '/' character because that would break URLs and date strings, but
 * '/' alone is not enough to escape an attribute.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Tipos --------------------------------------------------------------------

export interface ReportData {
  profile: UserProfile;
  healthMetrics: HealthMetric[];
  alarms: Alarm[];
  generatedAt: number;
}

// --- Helpers -----------------------------------------------------------------

function getStatusLabel(type: HealthMetric['type'], value: number): { label: string; color: string } {
  switch (type) {
    case 'heart_rate':
      if (value >= 60 && value <= 100) return { label: 'Normal', color: '#22C55E' };
      if (value >= 50 && value <= 120) return { label: 'Atenção', color: '#F59E0B' };
      return { label: 'Crítico', color: '#EF4444' };
    case 'blood_pressure':
      if (value >= 90 && value <= 120) return { label: 'Normal', color: '#22C55E' };
      if (value >= 80 && value <= 140) return { label: 'Atenção', color: '#F59E0B' };
      return { label: 'Crítico', color: '#EF4444' };
    case 'glucose':
      if (value >= 70 && value <= 100) return { label: 'Normal', color: '#22C55E' };
      if (value >= 60 && value <= 140) return { label: 'Atenção', color: '#F59E0B' };
      return { label: 'Crítico', color: '#EF4444' };
    default:
      return { label: '-', color: '#9BA1A6' };
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR');
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function getMetricLabel(type: HealthMetric['type']): string {
  switch (type) {
    case 'heart_rate': return 'Frequência Cardíaca';
    case 'blood_pressure': return 'Pressão Arterial';
    case 'glucose': return 'Glicemia';
    default: return type;
  }
}

function getMetricUnit(type: HealthMetric['type']): string {
  switch (type) {
    case 'heart_rate': return 'bpm';
    case 'blood_pressure': return 'mmHg';
    case 'glucose': return 'mg/dL';
    default: return '';
  }
}

function getMetricColor(type: HealthMetric['type']): string {
  switch (type) {
    case 'heart_rate': return '#EF4444';
    case 'blood_pressure': return '#3B82F6';
    case 'glucose': return '#F59E0B';
    default: return '#6B7280';
  }
}

function getNormalRange(type: HealthMetric['type']): { min: number; max: number } {
  switch (type) {
    case 'heart_rate': return { min: 60, max: 100 };
    case 'blood_pressure': return { min: 90, max: 120 };
    case 'glucose': return { min: 70, max: 100 };
    default: return { min: 0, max: 100 };
  }
}

// --- SVG Chart Generator -----------------------------------------------------

function buildSvgChart(
  metrics: HealthMetric[],
  type: HealthMetric['type'],
  width = 520,
  height = 160
): string {
  const filtered = metrics
    .filter((m) => m.type === type)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-30); // Últimas 30 leituras

  if (filtered.length === 0) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#9BA1A6" font-size="14" font-family="Arial">
        Sem dados registrados
      </text>
    </svg>`;
  }

  const color = getMetricColor(type);
  const normal = getNormalRange(type);
  const values = filtered.map((m) => m.value);
  const minVal = Math.min(...values, normal.min) * 0.9;
  const maxVal = Math.max(...values, normal.max) * 1.1;
  const range = maxVal - minVal || 1;

  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 32;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  // Normaliza valor para coordenada Y (invertido: maior valor = menor Y)
  const toY = (v: number) => padT + chartH - ((v - minVal) / range) * chartH;
  const toX = (i: number) => padL + (filtered.length === 1 ? chartW / 2 : (i / (filtered.length - 1)) * chartW);

  // Linha da faixa normal (fundo verde claro)
  const normalY1 = toY(normal.max);
  const normalY2 = toY(normal.min);
  const normalRect = `<rect x="${padL}" y="${normalY1}" width="${chartW}" height="${normalY2 - normalY1}" fill="#22C55E22" />`;

  // Linha de referência normal.min e normal.max
  const refLines = `
    <line x1="${padL}" y1="${normalY1}" x2="${padL + chartW}" y2="${normalY1}" stroke="#22C55E" stroke-width="0.8" stroke-dasharray="4,3" />
    <line x1="${padL}" y1="${normalY2}" x2="${padL + chartW}" y2="${normalY2}" stroke="#22C55E" stroke-width="0.8" stroke-dasharray="4,3" />
  `;

  // Polyline dos pontos
  const points = filtered.map((m, i) => `${toX(i)},${toY(m.value)}`).join(' ');
  const polyline = `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;

  // Área sob a curva
  const areaPoints = `${toX(0)},${padT + chartH} ${points} ${toX(filtered.length - 1)},${padT + chartH}`;
  const area = `<polygon points="${areaPoints}" fill="${color}22" />`;

  // Pontos (círculos)
  const dots = filtered
    .map((m, i) => {
      const status = getStatusLabel(type, m.value);
      return `<circle cx="${toX(i)}" cy="${toY(m.value)}" r="3.5" fill="${status.color}" stroke="white" stroke-width="1.5" />`;
    })
    .join('');

  // Eixo Y - 4 labels
  const yLabels = [0, 0.33, 0.67, 1].map((t) => {
    const val = Math.round(minVal + t * range);
    const y = padT + chartH - t * chartH;
    return `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" fill="#6B7280" font-size="10" font-family="Arial">${val}</text>
             <line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#E5E7EB" stroke-width="0.5" />`;
  }).join('');

  // Eixo X - datas (máx 6 labels)
  const xStep = Math.max(1, Math.floor(filtered.length / 6));
  const xLabels = filtered
    .filter((_, i) => i % xStep === 0 || i === filtered.length - 1)
    .map((m, idx, arr) => {
      const origIdx = filtered.indexOf(m);
      const x = toX(origIdx);
      const label = new Date(m.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      return `<text x="${x}" y="${height - 4}" text-anchor="middle" fill="#6B7280" font-size="9" font-family="Arial">${label}</text>`;
    })
    .join('');

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${normalRect}
    ${refLines}
    ${area}
    ${polyline}
    ${dots}
    ${yLabels}
    ${xLabels}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#D1D5DB" stroke-width="1" />
    <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#D1D5DB" stroke-width="1" />
  </svg>`;
}

// --- Summary Cards ------------------------------------------------------------

function buildSummaryCard(metrics: HealthMetric[], type: HealthMetric['type']): string {
  const filtered = metrics.filter((m) => m.type === type).sort((a, b) => b.timestamp - a.timestamp);
  const latest = filtered[0];
  const label = getMetricLabel(type);
  const unit = getMetricUnit(type);
  const color = getMetricColor(type);

  if (!latest) {
    return `<div class="summary-card">
      <div class="summary-icon" style="background:${color}20; color:${color}">${type === 'heart_rate' ? '♥' : type === 'blood_pressure' ? '🩸' : '🍬'}</div>
      <div class="summary-info">
        <div class="summary-label">${esc(label)}</div>
        <div class="summary-value" style="color:#9BA1A6">-</div>
        <div class="summary-status" style="color:#9BA1A6">Sem dados</div>
      </div>
    </div>`;
  }

  const status = getStatusLabel(type, latest.value);
  const avg = filtered.length > 1
    ? Math.round(filtered.reduce((s, m) => s + m.value, 0) / filtered.length)
    : null;

  return `<div class="summary-card">
    <div class="summary-icon" style="background:${color}20; color:${color}">${type === 'heart_rate' ? '♥' : type === 'blood_pressure' ? '🩸' : '🍬'}</div>
    <div class="summary-info">
      <div class="summary-label">${esc(label)}</div>
      <div class="summary-value" style="color:${color}">${esc(latest.value)} <span class="summary-unit">${esc(unit)}</span></div>
      <div class="summary-status" style="background:${status.color}20; color:${status.color}">${esc(status.label)}</div>
      ${avg !== null ? `<div class="summary-avg">Média: ${avg} ${esc(unit)} (${filtered.length} leituras)</div>` : ''}
    </div>
  </div>`;
}

// --- Alarm Table --------------------------------------------------------------

function buildAlarmTable(alarms: Alarm[]): string {
  if (alarms.length === 0) {
    return `<p style="color:#9BA1A6; text-align:center; padding:16px;">Nenhum alarme configurado.</p>`;
  }

  const rows = alarms
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((alarm) => {
      const repeatLabel: Record<string, string> = {
        daily: 'Diário',
        weekdays: 'Dias úteis',
        weekends: 'Fins de semana',
        custom: 'Personalizado',
      };
      const statusColor = alarm.enabled ? '#22C55E' : '#9BA1A6';
      const statusLabel = alarm.enabled ? 'Ativo' : 'Inativo';
      return `<tr>
        <td>${esc(alarm.time)}</td>
        <td>${esc(alarm.description || '-')}</td>
        <td>${esc(repeatLabel[alarm.repeat] || alarm.repeat)}</td>
        <td><span style="background:${statusColor}20; color:${statusColor}; padding:2px 8px; border-radius:6px; font-size:12px; font-weight:600;">${statusLabel}</span></td>
      </tr>`;
    })
    .join('');

  return `<table>
    <thead>
      <tr>
        <th>Horário</th>
        <th>Medicamento</th>
        <th>Repetição</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// --- Main HTML Builder --------------------------------------------------------

export function buildReportHtml(data: ReportData): string {
  const { profile, healthMetrics, alarms, generatedAt } = data;

  // Filtra métricas do último mês
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentMetrics = healthMetrics.filter((m) => m.timestamp >= oneMonthAgo);
  const allMetrics = healthMetrics; // Para gráficos usa todas

  const metricTypes: HealthMetric['type'][] = ['heart_rate', 'blood_pressure', 'glucose'];

  const summaryCards = metricTypes.map((t) => buildSummaryCard(recentMetrics, t)).join('');

  const chartSections = metricTypes.map((type) => {
    const typeMetrics = allMetrics.filter((m) => m.type === type).sort((a, b) => a.timestamp - b.timestamp);
    const label = getMetricLabel(type);
    const unit = getMetricUnit(type);
    const color = getMetricColor(type);
    const normal = getNormalRange(type);
    const svg = buildSvgChart(allMetrics, type);

    const recentForType = recentMetrics.filter((m) => m.type === type).sort((a, b) => b.timestamp - a.timestamp);
    const tableRows = recentForType.slice(0, 15).map((m) => {
      const status = getStatusLabel(type, m.value);
      return `<tr>
        <td>${esc(formatDateTime(m.timestamp))}</td>
        <td style="font-weight:700; color:${color}">${esc(m.value)} ${esc(unit)}</td>
        <td><span style="background:${status.color}20; color:${status.color}; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600;">${esc(status.label)}</span></td>
      </tr>`;
    }).join('');

    const hasData = recentForType.length > 0;

    return `<div class="section">
      <div class="section-header" style="border-left:4px solid ${color}">
        <h2 style="color:${color}">${esc(label)}</h2>
        <span class="section-unit">${esc(unit)} · Faixa normal: ${normal.min}–${normal.max}</span>
      </div>
      <div class="chart-container">
        ${svg}
      </div>
      ${hasData ? `
      <table style="margin-top:12px">
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${recentForType.length > 15 ? `<p class="more-records">+ ${recentForType.length - 15} registros anteriores não exibidos</p>` : ''}
      ` : `<p style="color:#9BA1A6; text-align:center; padding:12px;">Nenhum registro nos últimos 30 dias.</p>`}
    </div>`;
  }).join('');

  const patientName = esc(profile?.name || 'Paciente');
  const reportDate = esc(formatDate(generatedAt));
  const periodStart = esc(formatDate(oneMonthAgo));
  const patientBirthDate = esc(profile?.birthDate ?? '');
  const patientBloodType = esc(profile?.bloodType ?? '');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Saúde - ${patientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Arial', sans-serif;
      font-size: 13px;
      color: #11181C;
      background: #fff;
      padding: 32px 40px;
      line-height: 1.5;
    }
    /* --- Header --- */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #0033CC;
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      width: 48px; height: 48px; border-radius: 12px;
      background: #0033CC; display: flex; align-items: center;
      justify-content: center; font-size: 24px;
    }
    .brand-name { font-size: 22px; font-weight: 800; color: #0033CC; }
    .brand-tagline { font-size: 12px; color: #687076; margin-top: 2px; }
    .report-meta { text-align: right; }
    .report-title { font-size: 16px; font-weight: 700; color: #11181C; }
    .report-period { font-size: 12px; color: #687076; margin-top: 4px; }
    /* --- Patient Info --- */
    .patient-card {
      background: #F8FAFF;
      border: 1px solid #E0E7FF;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 28px;
      display: flex;
      gap: 32px;
    }
    .patient-field { flex: 1; }
    .patient-field-label { font-size: 11px; color: #687076; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .patient-field-value { font-size: 15px; font-weight: 700; color: #11181C; margin-top: 2px; }
    /* --- Summary --- */
    .summary-grid {
      display: flex;
      gap: 16px;
      margin-bottom: 32px;
    }
    .summary-card {
      flex: 1;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .summary-icon {
      width: 40px; height: 40px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; flex-shrink: 0;
    }
    .summary-info { flex: 1; }
    .summary-label { font-size: 11px; color: #687076; font-weight: 600; }
    .summary-value { font-size: 20px; font-weight: 800; margin-top: 2px; }
    .summary-unit { font-size: 12px; font-weight: 400; }
    .summary-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      margin-top: 4px;
    }
    .summary-avg { font-size: 11px; color: #687076; margin-top: 4px; }
    /* --- Sections --- */
    .section {
      margin-bottom: 36px;
      page-break-inside: avoid;
    }
    .section-header {
      padding-left: 12px;
      margin-bottom: 14px;
    }
    .section-header h2 { font-size: 17px; font-weight: 800; }
    .section-unit { font-size: 12px; color: #687076; }
    /* --- Chart --- */
    .chart-container {
      background: #FAFAFA;
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      padding: 12px;
      overflow: hidden;
    }
    /* --- Tables --- */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      background: #F3F4F6;
      color: #374151;
      font-weight: 700;
      padding: 8px 12px;
      text-align: left;
      border-bottom: 2px solid #E5E7EB;
    }
    td {
      padding: 7px 12px;
      border-bottom: 1px solid #F3F4F6;
      color: #374151;
    }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #FAFAFA; }
    .more-records { font-size: 11px; color: #9BA1A6; text-align: right; margin-top: 6px; }
    /* --- Alarm Section --- */
    .alarm-section { margin-bottom: 36px; }
    .alarm-section h2 { font-size: 17px; font-weight: 800; color: #11181C; margin-bottom: 14px; padding-left: 12px; border-left: 4px solid #687076; }
    /* --- Footer --- */
    .report-footer {
      border-top: 1px solid #E5E7EB;
      padding-top: 16px;
      margin-top: 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #9BA1A6;
    }
    .footer-disclaimer { max-width: 420px; line-height: 1.4; }
    @media print {
      body { padding: 20px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <!-- Cabeçalho -->
  <div class="report-header">
    <div class="brand">
      <div class="brand-icon">❤️</div>
      <div>
        <div class="brand-name">Vigora</div>
        <div class="brand-tagline">Seu assistente pessoal de saúde</div>
      </div>
    </div>
    <div class="report-meta">
      <div class="report-title">Relatório de Saúde Mensal</div>
      <div class="report-period">Período: ${periodStart} a ${reportDate}</div>
      <div class="report-period">Gerado em: ${formatDateTime(generatedAt)}</div>
    </div>
  </div>

  <!-- Dados do Paciente -->
  <div class="patient-card">
    <div class="patient-field">
      <div class="patient-field-label">Paciente</div>
      <div class="patient-field-value">${patientName}</div>
    </div>
    ${patientBirthDate ? `<div class="patient-field">
      <div class="patient-field-label">Data de Nascimento</div>
      <div class="patient-field-value">${patientBirthDate}</div>
    </div>` : ''}
    ${patientBloodType ? `<div class="patient-field">
      <div class="patient-field-label">Tipo Sanguíneo</div>
      <div class="patient-field-value">${patientBloodType}</div>
    </div>` : ''}
    <div class="patient-field">
      <div class="patient-field-label">Total de Registros</div>
      <div class="patient-field-value">${recentMetrics.length} métricas (30 dias)</div>
    </div>
  </div>

  <!-- Resumo das Métricas -->
  <div class="summary-grid">
    ${summaryCards}
  </div>

  <!-- Gráficos e Tabelas por Métrica -->
  ${chartSections}

  <!-- Alarmes Configurados -->
  <div class="alarm-section">
    <h2>💊 Alarmes de Medicamentos</h2>
    ${buildAlarmTable(alarms)}
  </div>

  <!-- Rodapé -->
  <div class="report-footer">
    <div class="footer-disclaimer">
      ⚠️ Este relatório é gerado automaticamente pelo app Vigora e tem caráter informativo.
      Não substitui consulta médica profissional. Compartilhe com seu médico para avaliação clínica.
    </div>
    <div>Vigora · ${reportDate}</div>
  </div>
</body>
</html>`;
}
