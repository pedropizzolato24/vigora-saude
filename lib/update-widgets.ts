/**
 * update-widgets.ts
 *
 * Utilitário para atualizar os widgets Android quando os dados do app mudam.
 * Deve ser chamado sempre que alarmes forem adicionados, removidos ou alterados.
 *
 * Funciona apenas no Android (no-op em iOS/web).
 */
import { Platform } from 'react-native';
import React from 'react';

import type { Alarm } from './app-context';

/**
 * Calcula o próximo alarme ativo a partir de uma lista de alarmes.
 */
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

/**
 * Atualiza todos os widgets Android com os dados mais recentes.
 * Deve ser chamado após qualquer mudança nos alarmes.
 *
 * @param alarms - Lista atual de alarmes do AppContext
 */
export async function updateAllWidgets(alarms: Alarm[]): Promise<void> {
  // Widgets Android só existem no Android
  if (Platform.OS !== 'android') return;

  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { NextAlarmWidget } = await import('../widgets/NextAlarmWidget');
    const { SosWidget } = await import('../widgets/SosWidget');

    const next = getNextAlarm(alarms);

    // Atualiza o widget de próximo alarme
    await requestWidgetUpdate({
      widgetName: 'NextAlarm',
      renderWidget: () =>
        React.createElement(NextAlarmWidget, {
          hasAlarm: !!next,
          alarmTime: next?.time,
          alarmName: next?.description,
        }),
      widgetNotFound: () => {
        // Widget não está na tela inicial — nenhuma ação necessária
      },
    });

    // Atualiza o widget SOS (conteúdo estático, mas garante que está renderizado)
    await requestWidgetUpdate({
      widgetName: 'Sos',
      renderWidget: () => React.createElement(SosWidget),
      widgetNotFound: () => {},
    });
  } catch (error) {
    // Silencia erros de widget (ex: widget não instalado no dispositivo)
    console.warn('[Widgets] Falha ao atualizar widgets:', error);
  }
}
