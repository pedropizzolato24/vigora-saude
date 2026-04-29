import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { NextAlarmWidget } from './NextAlarmWidget';
import { SosWidget } from './SosWidget';
import { HealthWidget } from './HealthWidget';

const STORAGE_KEY = 'vigora_app_state';

interface AlarmData {
  id: string;
  time: string;
  description: string;
  enabled: boolean;
}

interface HealthMetricData {
  id: string;
  type: 'heart_rate' | 'blood_pressure' | 'glucose';
  value: number;
  unit: string;
  timestamp: number;
}

/** Lê os alarmes do AsyncStorage e retorna o próximo alarme ativo. */
async function getNextAlarmFromStorage(): Promise<{ time: string; name: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as { alarms?: AlarmData[] };
    const alarms: AlarmData[] = state.alarms ?? [];
    const enabled = alarms.filter((a) => a.enabled);
    if (enabled.length === 0) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const sorted = [...enabled].sort((a, b) => {
      const [ah, am] = a.time.split(':').map(Number);
      const [bh, bm] = b.time.split(':').map(Number);
      const aMin = ah * 60 + am;
      const bMin = bh * 60 + bm;
      const aDiff = aMin >= nowMinutes ? aMin - nowMinutes : aMin + 1440 - nowMinutes;
      const bDiff = bMin >= nowMinutes ? bMin - nowMinutes : bMin + 1440 - nowMinutes;
      return aDiff - bDiff;
    });
    const next = sorted[0];
    if (!next) return null;
    return { time: next.time, name: next.description };
  } catch {
    return null;
  }
}

/** Lê as métricas de saúde do AsyncStorage e retorna a última de cada tipo. */
async function getLatestMetricsFromStorage(): Promise<{
  heart_rate: { value: number; unit: string; timestamp: number } | null;
  blood_pressure: { value: number; unit: string; timestamp: number } | null;
  glucose: { value: number; unit: string; timestamp: number } | null;
}> {
  const empty = { heart_rate: null, blood_pressure: null, glucose: null };
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const state = JSON.parse(raw) as { healthMetrics?: HealthMetricData[] };
    const metrics: HealthMetricData[] = state.healthMetrics ?? [];
    const sorted = [...metrics].sort((a, b) => b.timestamp - a.timestamp);
    return {
      heart_rate: sorted.find((m) => m.type === 'heart_rate') ?? null,
      blood_pressure: sorted.find((m) => m.type === 'blood_pressure') ?? null,
      glucose: sorted.find((m) => m.type === 'glucose') ?? null,
    };
  } catch {
    return empty;
  }
}

/**
 * Widget Task Handler - chamado pelo sistema Android para renderizar/atualizar widgets.
 *
 * Widgets suportados:
 * - NextAlarm: próximo alarme de medicamento
 * - Sos: botão de emergência rápida
 * - Health: métricas de saúde (FC, PA, Glicemia)
 */
export async function widgetTaskHandler({
  widgetInfo,
  widgetAction,
  renderWidget,
}: WidgetTaskHandlerProps): Promise<void> {
  const { widgetName } = widgetInfo;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      if (widgetName === 'NextAlarm') {
        const next = await getNextAlarmFromStorage();
        renderWidget(
          <NextAlarmWidget
            hasAlarm={!!next}
            alarmTime={next?.time}
            alarmName={next?.name}
            isRinging={false}
          />
        );
      } else if (widgetName === 'Sos') {
        renderWidget(<SosWidget />);
      } else if (widgetName === 'Health') {
        const metrics = await getLatestMetricsFromStorage();
        renderWidget(
          <HealthWidget
            heartRate={metrics.heart_rate}
            bloodPressure={metrics.blood_pressure}
            glucose={metrics.glucose}
          />
        );
      }
      break;
    }

    case 'WIDGET_DELETED':
      // Nenhuma ação necessária
      break;

    case 'WIDGET_CLICK':
      // Cliques com OPEN_APP são tratados nativamente pelo sistema
      break;

    default:
      break;
  }
}
