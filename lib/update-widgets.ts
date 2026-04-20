/**
 * update-widgets.ts
 *
 * Utilitário para atualizar os widgets Android quando os dados do app mudam.
 * Funciona apenas no Android (no-op em iOS/web).
 *
 * Funções exportadas:
 * - updateAllWidgets(alarms, healthMetrics) — atualiza todos os widgets
 * - updateAlarmWidgetOnFire(alarmName) — marca o widget como "alarme tocando agora"
 * - updateAlarmWidgetOnDismiss(alarms) — restaura o widget para o próximo alarme
 * - updateHealthWidget(healthMetrics) — atualiza apenas o widget de saúde
 */
import { Platform } from 'react-native';
import React from 'react';

import type { Alarm, HealthMetric } from './app-context';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNextAlarm(alarms: Alarm[]): Alarm | null {
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
  return sorted[0] ?? null;
}

/** Retorna a última métrica de cada tipo */
function getLatestMetrics(healthMetrics: HealthMetric[]): {
  heart_rate: HealthMetric | null;
  blood_pressure: HealthMetric | null;
  glucose: HealthMetric | null;
} {
  const sorted = [...healthMetrics].sort((a, b) => b.timestamp - a.timestamp);
  return {
    heart_rate: sorted.find((m) => m.type === 'heart_rate') ?? null,
    blood_pressure: sorted.find((m) => m.type === 'blood_pressure') ?? null,
    glucose: sorted.find((m) => m.type === 'glucose') ?? null,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Atualiza todos os widgets com os dados mais recentes.
 * Chamado pelo AppProvider quando alarmes ou métricas mudam.
 */
export async function updateAllWidgets(
  alarms: Alarm[],
  healthMetrics: HealthMetric[] = []
): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { NextAlarmWidget } = await import('../widgets/NextAlarmWidget');
    const { SosWidget } = await import('../widgets/SosWidget');
    const { HealthWidget } = await import('../widgets/HealthWidget');

    const next = getNextAlarm(alarms);
    const metrics = getLatestMetrics(healthMetrics);

    await Promise.allSettled([
      requestWidgetUpdate({
        widgetName: 'NextAlarm',
        renderWidget: () =>
          React.createElement(NextAlarmWidget, {
            hasAlarm: !!next,
            alarmTime: next?.time,
            alarmName: next?.description,
            isRinging: false,
          }),
        widgetNotFound: () => {},
      }),
      requestWidgetUpdate({
        widgetName: 'Sos',
        renderWidget: () => React.createElement(SosWidget),
        widgetNotFound: () => {},
      }),
      requestWidgetUpdate({
        widgetName: 'Health',
        renderWidget: () =>
          React.createElement(HealthWidget, {
            heartRate: metrics.heart_rate
              ? { value: metrics.heart_rate.value, unit: metrics.heart_rate.unit, timestamp: metrics.heart_rate.timestamp }
              : null,
            bloodPressure: metrics.blood_pressure
              ? { value: metrics.blood_pressure.value, unit: metrics.blood_pressure.unit, timestamp: metrics.blood_pressure.timestamp }
              : null,
            glucose: metrics.glucose
              ? { value: metrics.glucose.value, unit: metrics.glucose.unit, timestamp: metrics.glucose.timestamp }
              : null,
          }),
        widgetNotFound: () => {},
      }),
    ]);
  } catch (error) {
    console.warn('[Widgets] Falha ao atualizar widgets:', error);
  }
}

/**
 * Atualiza o widget NextAlarm para mostrar estado "alarme tocando agora".
 * Chamado imediatamente quando um alarme dispara em handleAlarmFired.
 */
export async function updateAlarmWidgetOnFire(alarmName: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { NextAlarmWidget } = await import('../widgets/NextAlarmWidget');

    await requestWidgetUpdate({
      widgetName: 'NextAlarm',
      renderWidget: () =>
        React.createElement(NextAlarmWidget, {
          hasAlarm: true,
          alarmTime: 'Agora',
          alarmName: alarmName,
          isRinging: true,
        }),
      widgetNotFound: () => {},
    });
  } catch (error) {
    console.warn('[Widgets] Falha ao atualizar widget (fire):', error);
  }
}

/**
 * Restaura o widget NextAlarm para o próximo alarme após dispensar.
 * Chamado em alarm-ring quando o usuário dispensa o alarme.
 */
export async function updateAlarmWidgetOnDismiss(alarms: Alarm[]): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { NextAlarmWidget } = await import('../widgets/NextAlarmWidget');

    const next = getNextAlarm(alarms);

    await requestWidgetUpdate({
      widgetName: 'NextAlarm',
      renderWidget: () =>
        React.createElement(NextAlarmWidget, {
          hasAlarm: !!next,
          alarmTime: next?.time,
          alarmName: next?.description,
          isRinging: false,
        }),
      widgetNotFound: () => {},
    });
  } catch (error) {
    console.warn('[Widgets] Falha ao atualizar widget (dismiss):', error);
  }
}

/**
 * Atualiza apenas o widget de saúde.
 * Chamado quando uma nova métrica de saúde é adicionada.
 */
export async function updateHealthWidget(healthMetrics: HealthMetric[]): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { HealthWidget } = await import('../widgets/HealthWidget');

    const metrics = getLatestMetrics(healthMetrics);

    await requestWidgetUpdate({
      widgetName: 'Health',
      renderWidget: () =>
        React.createElement(HealthWidget, {
          heartRate: metrics.heart_rate
            ? { value: metrics.heart_rate.value, unit: metrics.heart_rate.unit, timestamp: metrics.heart_rate.timestamp }
            : null,
          bloodPressure: metrics.blood_pressure
            ? { value: metrics.blood_pressure.value, unit: metrics.blood_pressure.unit, timestamp: metrics.blood_pressure.timestamp }
            : null,
          glucose: metrics.glucose
            ? { value: metrics.glucose.value, unit: metrics.glucose.unit, timestamp: metrics.glucose.timestamp }
            : null,
        }),
      widgetNotFound: () => {},
    });
  } catch (error) {
    console.warn('[Widgets] Falha ao atualizar widget de saúde:', error);
  }
}
