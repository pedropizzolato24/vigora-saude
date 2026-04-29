import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { HexColor } from 'react-native-android-widget/src/widgets/utils/style.props';

interface MetricData {
  value: number;
  unit: string;
  timestamp: number;
}

interface HealthWidgetProps {
  heartRate: MetricData | null;
  bloodPressure: MetricData | null;
  glucose: MetricData | null;
}

/** Retorna cor baseada no status da métrica */
function getStatusColor(type: 'heart_rate' | 'blood_pressure' | 'glucose', value: number): HexColor {
  switch (type) {
    case 'heart_rate':
      if (value >= 60 && value <= 100) return '#22C55E'; // normal
      if (value >= 50 && value <= 120) return '#F59E0B'; // warning
      return '#EF4444'; // critical
    case 'blood_pressure':
      if (value >= 90 && value <= 120) return '#22C55E';
      if (value >= 80 && value <= 140) return '#F59E0B';
      return '#EF4444';
    case 'glucose':
      if (value >= 70 && value <= 100) return '#22C55E';
      if (value >= 60 && value <= 140) return '#F59E0B';
      return '#EF4444';
    default:
      return '#9BA1A6';
  }
}

/** Formata timestamp relativo (ex: "2h atrás", "ontem") */
function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

interface MetricRowProps {
  icon: string;
  label: string;
  value: string;
  statusColor: HexColor;
  timeAgo: string;
}

function MetricRow({ icon, label, value, statusColor, timeAgo }: MetricRowProps) {
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: 'match_parent',
        marginBottom: 6,
      }}
    >
      {/* Ícone + label */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flex: 1,
        }}
      >
        {/* Indicador de status (bolinha colorida) */}
        <FlexWidget
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: statusColor,
            marginRight: 6,
          }}
        />
        <TextWidget
          text={`${icon} ${label}`}
          style={{
            fontSize: 11,
            color: '#687076',
          }}
        />
      </FlexWidget>

      {/* Valor + tempo */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <TextWidget
          text={value}
          style={{
            fontSize: 13,
            fontWeight: 'bold',
            color: statusColor,
            marginRight: 4,
          }}
        />
        <TextWidget
          text={timeAgo}
          style={{
            fontSize: 10,
            color: '#9BA1A6',
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/**
 * Widget de Métricas de Saúde - exibe as últimas leituras de
 * frequência cardíaca, pressão arterial e glicemia com indicadores
 * visuais de status (verde/amarelo/vermelho).
 *
 * Layout:
 * ┌---------------------------------┐
 * │  ❤️  Vigora Saúde               │
 * │  Saúde                          │
 * │  ● ♥ Freq. Cardíaca  72 bpm 2h │
 * │  ● 🩸 Pressão        118 mmHg 1d│
 * │  ● 🍬 Glicemia       95 mg/dL 3h│
 * └---------------------------------┘
 */
export function HealthWidget({ heartRate, bloodPressure, glucose }: HealthWidgetProps) {
  const hasAnyData = heartRate || bloodPressure || glucose;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
      }}
      clickAction="OPEN_APP"
    >
      {/* Header */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <TextWidget
          text="❤️"
          style={{
            fontSize: 14,
            marginRight: 6,
          }}
        />
        <TextWidget
          text="Vigora Saúde"
          style={{
            fontSize: 12,
            fontWeight: 'bold',
            color: '#0033CC',
          }}
        />
      </FlexWidget>

      {/* Label */}
      <TextWidget
        text="Métricas de Saúde"
        style={{
          fontSize: 11,
          color: '#687076',
          marginBottom: 8,
        }}
      />

      {hasAnyData ? (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
          }}
        >
          {heartRate ? (
            <MetricRow
              icon="♥"
              label="Freq. Cardíaca"
              value={`${heartRate.value} ${heartRate.unit}`}
              statusColor={getStatusColor('heart_rate', heartRate.value)}
              timeAgo={formatRelativeTime(heartRate.timestamp)}
            />
          ) : (
            <MetricRow
              icon="♥"
              label="Freq. Cardíaca"
              value="-"
              statusColor="#9BA1A6"
              timeAgo=""
            />
          )}

          {bloodPressure ? (
            <MetricRow
              icon="🩸"
              label="Pressão"
              value={`${bloodPressure.value} ${bloodPressure.unit}`}
              statusColor={getStatusColor('blood_pressure', bloodPressure.value)}
              timeAgo={formatRelativeTime(bloodPressure.timestamp)}
            />
          ) : (
            <MetricRow
              icon="🩸"
              label="Pressão"
              value="-"
              statusColor="#9BA1A6"
              timeAgo=""
            />
          )}

          {glucose ? (
            <MetricRow
              icon="🍬"
              label="Glicemia"
              value={`${glucose.value} ${glucose.unit}`}
              statusColor={getStatusColor('glucose', glucose.value)}
              timeAgo={formatRelativeTime(glucose.timestamp)}
            />
          ) : (
            <MetricRow
              icon="🍬"
              label="Glicemia"
              value="-"
              statusColor="#9BA1A6"
              timeAgo=""
            />
          )}
        </FlexWidget>
      ) : (
        <TextWidget
          text="Nenhuma métrica registrada"
          style={{
            fontSize: 13,
            color: '#9BA1A6',
            fontStyle: 'italic',
          }}
        />
      )}
    </FlexWidget>
  );
}
