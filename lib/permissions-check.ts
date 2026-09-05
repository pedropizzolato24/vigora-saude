/**
 * permissions-check.ts
 *
 * Fonte única do que o Vigora precisa do sistema para funcionar.
 *
 * Antes, cada permissão era pedida UMA vez, na tela que a usa. Quem tocasse
 * "Agora não" — ou não entendesse o diálogo do sistema, o que é a regra num
 * público de 60+ — ficava sem ela para sempre, e em silêncio: o alarme não
 * toma a tela, o OEM mata o app antes de o alarme tocar, o dead man's switch
 * fica desarmado. Nada disso aparece para o filho que comprou o app.
 *
 * Aqui só existe a LEITURA do estado e a ação de pedir. Quem mostra é
 * `app/permissions.tsx`; quem decide mostrar no boot é
 * `components/permissions-gate.tsx`.
 */
import * as Notifications from 'expo-notifications';
import {
  canScheduleExactAlarms,
  canUseFullScreenIntent,
  isIgnoringBatteryOptimizations,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
} from 'expo-alarm-countdown';
import { Linking, Platform } from 'react-native';

import { oemBatteryHint } from '@/lib/_core/oem-battery-hint';
import { openBatteryOptimizationSettings } from '@/lib/battery-optimization';
import { isAlarmKitAvailable, requestAlarmKitAuthorization } from '@/lib/ios-alarm-kit';
import {
  isBackgroundLocationGranted,
  isForegroundLocationGranted,
  openLocationSettings,
  requestBackgroundLocation,
  requestForegroundLocation,
} from '@/lib/location-permission';
import { requestNotificationPermissions } from '@/lib/notifications-utils';

export type PermissionKey =
  | 'notifications'
  | 'exactAlarm'
  | 'fullScreen'
  | 'battery'
  | 'alarmKit'
  | 'locationForeground'
  | 'locationBackground';

export interface PermissionItem {
  key: PermissionKey;
  /** Nome curto, na língua do idoso — não o nome da permissão no Android. */
  title: string;
  /** O que quebra sem ela, em uma frase. */
  why: string;
  granted: boolean;
  /** Pede a permissão, ou abre os Ajustes quando o sistema não pergunta mais. */
  request: () => Promise<void>;
}

/**
 * Abre a página do próprio app nos Ajustes — o caminho de última instância
 * quando o sistema já decidiu e não pergunta mais.
 */
async function abrirAjustesDoApp(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL('app-settings:').catch((e) =>
      console.warn('[permissions] não abriu os ajustes do app:', e),
    );
    return;
  }
  await Linking.openSettings().catch((e) =>
    console.warn('[permissions] não abriu os ajustes do app:', e),
  );
}

/**
 * Texto do item de bateria, com os passos numerados e o passo extra do
 * fabricante quando ele existe.
 *
 * A numeração é contratual: `oemBatteryHint` continua do "3.", então os passos
 * 1 e 2 precisam estar aqui. Samsung e Xiaomi têm listas próprias que fecham o
 * app mesmo com a isenção padrão concedida — sem esse passo o idoso "libera" a
 * permissão e o alarme continua não tocando.
 */
function porqueDaBateria(): string {
  const base =
    'Para economizar energia, o celular pode fechar o Vigora sozinho — e aí o alarme não toca.\n' +
    '1. Toque em "Liberar" aqui embaixo\n' +
    '2. Na pergunta que aparecer, escolha "Permitir"';
  const manufacturer = (Platform.constants as { Manufacturer?: string })?.Manufacturer ?? '';
  const extra = oemBatteryHint(manufacturer);
  return extra ? `${base}\n\n${extra}` : base;
}

/**
 * Roda uma checagem que depende do aparelho.
 *
 * Devolve `null` quando o aparelho não sabe responder (ROM enxuta, módulo
 * nativo ausente, app de sistema desativado) — e aí o item some da lista em vez
 * de virar um alerta vermelho que o idoso não tem como resolver. O motivo real
 * vai para o log; nunca engolir.
 */
async function checar(key: PermissionKey, fn: () => Promise<boolean>): Promise<boolean | null> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[permissions] ${key}: este aparelho não respondeu à checagem —`, e);
    return null;
  }
}

/**
 * Estado atual de todas as permissões que o perfil precisa, na ordem em que
 * devem ser resolvidas (as do alarme primeiro: são as do dead man's switch).
 *
 * O cuidador só recebe notificações — o perfil dele não toca alarme nem usa
 * localização; pedir o resto seria pedir por pedir.
 */
export async function checkPermissions(
  userType: 'monitored' | 'caregiver',
): Promise<PermissionItem[]> {
  const itens: PermissionItem[] = [];

  const adicionar = async (
    item: Omit<PermissionItem, 'granted'>,
    check: () => Promise<boolean>,
  ): Promise<boolean> => {
    const granted = await checar(item.key, check);
    if (granted === null) return false;
    itens.push({ ...item, granted });
    return granted;
  };

  await adicionar(
    {
      key: 'notifications',
      title: 'Avisos do Vigora',
      why: 'Sem eles o celular não mostra o lembrete de remédio nem o alarme.',
      request: async () => {
        // canAskAgain false = o sistema não abre mais o diálogo; insistir aqui
        // não faria nada aparecer na tela e o idoso acharia que o app travou.
        const { canAskAgain } = await Notifications.getPermissionsAsync();
        if (canAskAgain) {
          await requestNotificationPermissions();
          return;
        }
        await abrirAjustesDoApp();
      },
    },
    async () => (await Notifications.getPermissionsAsync()).status === 'granted',
  );

  if (userType === 'caregiver') return itens;

  if (Platform.OS === 'android') {
    await adicionar(
      {
        key: 'exactAlarm',
        title: 'Alarme na hora certa',
        why: 'Sem isso o alarme do remédio pode atrasar vários minutos.',
        request: openExactAlarmSettings,
      },
      canScheduleExactAlarms,
    );

    await adicionar(
      {
        key: 'fullScreen',
        title: 'Alarme na tela toda',
        why: 'Sem isso o alarme chega como um aviso pequeno no alto da tela, fácil de não perceber.',
        request: openFullScreenIntentSettings,
      },
      canUseFullScreenIntent,
    );

    await adicionar(
      {
        key: 'battery',
        title: 'Não desligar o Vigora',
        why: porqueDaBateria(),
        request: openBatteryOptimizationSettings,
      },
      isIgnoringBatteryOptimizations,
    );
  }

  // iOS 26+: o AlarmKit é o que faz o alarme furar o silencioso e o Foco.
  // A checagem é a própria chamada de autorização — o AlarmKit não expõe um
  // getter só de leitura. Quando o status já está decidido ela devolve na hora,
  // sem diálogo; e no primeiro boot o _layout já a chamou antes desta.
  if (isAlarmKitAvailable()) {
    await adicionar(
      {
        key: 'alarmKit',
        title: 'Alarme mesmo no silencioso',
        why: 'Sem isso o alarme fica mudo quando o celular está no silencioso ou no modo Foco.',
        request: async () => {
          if ((await requestAlarmKitAuthorization()) === 'authorized') return;
          await abrirAjustesDoApp();
        },
      },
      async () => (await requestAlarmKitAuthorization()) === 'authorized',
    );
  }

  const localizacaoEmUso = await adicionar(
    {
      key: 'locationForeground',
      title: 'Localização',
      why: 'É o que permite mandar onde você está para a família quando você pede ajuda.',
      request: async () => {
        if (await requestForegroundLocation()) return;
        await openLocationSettings();
      },
    },
    isForegroundLocationGranted,
  );

  // "O tempo todo" só depois de "durante o uso": no Android ela é uma ampliação
  // da primeira, e oferecê-la antes leva a uma tela de Ajustes onde a opção nem
  // aparece.
  if (localizacaoEmUso) {
    await adicionar(
      {
        key: 'locationBackground',
        title: 'Localização o tempo todo',
        why: 'É o que permite achar você mesmo com o Vigora fechado.',
        request: async () => {
          if (await requestBackgroundLocation()) return;
          await openLocationSettings();
        },
      },
      isBackgroundLocationGranted,
    );
  }

  return itens;
}

/**
 * Rotas em que a central de permissões NÃO pode aparecer por cima.
 *
 * A primeira linha é a que importa: um alarme tocando (ou um check-in aberto)
 * nunca pode ser coberto — é a resposta do idoso que arma o dead man's switch.
 * O resto é o funil de entrada, que o OnboardingGate está navegando no mesmo
 * instante do boot; empilhar aqui roubaria a tela dele.
 */
const ROTAS_INTOCAVEIS = [
  '/alarm-ring',
  '/checkin-response',
  '/onboarding',
  '/caregiver-onboarding',
  '/login',
  '/email-login',
  '/phone-login',
  '/register',
  '/convite',
  '/oauthredirect',
  '/oauth',
  '/permissions',
  '/paywall',
  '/customer-center',
];

/**
 * A rota atual aceita ser interrompida pela central de permissões?
 *
 * `null`/`undefined` (rota ainda não resolvida no cold start) responde `false`:
 * na dúvida, não interrompe — o custo de esperar o próximo boot é zero, o de
 * cobrir um alarme é a família receber alerta à toa.
 */
export function canInterruptRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const rota = pathname.split('?')[0];
  return !ROTAS_INTOCAVEIS.some((r) => rota === r || rota.startsWith(`${r}/`));
}
