import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { NextAlarmWidget } from './NextAlarmWidget';
import { SosWidget } from './SosWidget';

const STORAGE_KEY = 'vigora_app_state';

interface AlarmData {
  id: string;
  time: string;
  description: string;
  enabled: boolean;
}

/**
 * Lê os alarmes do AsyncStorage e retorna o próximo alarme ativo.
 */
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

/**
 * Widget Task Handler — chamado pelo sistema Android para renderizar/atualizar widgets.
 *
 * Eventos tratados:
 * - WIDGET_ADDED: widget adicionado à tela inicial
 * - WIDGET_UPDATE: atualização periódica (configurada no app.config.ts)
 * - WIDGET_RESIZED: widget redimensionado
 * - WIDGET_DELETED: widget removido (sem renderização necessária)
 * - WIDGET_CLICK: clique em área interativa do widget
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
          />
        );
      } else if (widgetName === 'Sos') {
        renderWidget(<SosWidget />);
      }
      break;
    }

    case 'WIDGET_DELETED':
      // Nenhuma ação necessária
      break;

    case 'WIDGET_CLICK':
      // Cliques com OPEN_APP são tratados nativamente pelo sistema
      // Cliques customizados podem ser tratados aqui se necessário
      break;

    default:
      break;
  }
}
