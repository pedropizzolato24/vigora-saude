/**
 * AlarmRingScreen
 *
 * Full-screen alarm experience:
 * - O SOM depende da plataforma:
 *   Android — quem toca é o serviço nativo (expo-alarm-module), em loop no
 *   STREAM_ALARM, desde o disparo e independente do app estar aberto; esta
 *   tela só o pausa/retoma durante a fala. Ver docs/claude/alarmes.md.
 *   iOS — não há serviço equivalente: a notificação toca o som uma única vez
 *   e para. A partir da abertura desta tela, ela É a fonte do som (expo-audio,
 *   em loop, com playsInSilentMode).
 *   iOS 26+ (AlarmKit) — inverte tudo: o alarme tocou em tela cheia e o idoso
 *   já apertou "Desligar", e foi ISSO que abriu o app. A tela não toca som nem
 *   conta nada; só fala o remédio e confirma. Ver `vindoDoAlarmKit` abaixo.
 * - Halo que cresce e some ao redor do ícone (o ícone em si fica parado)
 * - Shows alarm name and description
 * - Reads alarm name and description aloud via expo-speech (pt-BR)
 * - "Ouvir novamente" button to replay speech
 * - Countdown timer (30s) - when it reaches 0, sends WhatsApp to all emergency contacts
 * - Large dismiss button
 * - Accessibility mode: larger elements, high contrast, simplified layout
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Vibration,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useAppContext } from '@/lib/app-context';
import { shouldVibrate } from '@/lib/_core/alarm-vibration';
import { loadCurrentAppStateRaw } from '@/lib/app-state-storage';
import { useAccessibility } from '@/lib/accessibility-context';
import { useColors } from '@/hooks/use-colors';
import { escalateAlarmToContacts } from '@/lib/alarm-escalation';
import {
  stopNativeAlarm,
  snoozeNativeAlarm,
  pauseNativeAlarmSound,
  resumeNativeAlarmSound,
} from '@/lib/native-alarm-manager';
import { dismissDeliveredAlarmNotification } from '@/lib/notifications-utils';
import { enterAlarmLockScreenMode, exitAlarmLockScreenMode } from 'expo-alarm-countdown';
import { RippleHalo } from '@/components/animated-components';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { loadAlarmTimer, clearAlarmTimer } from '@/lib/alarm-timer-store';
import { lastAlarmFireMs } from '@/lib/alarm-fire-times';
import { updateAlarmWidgetOnDismiss } from '@/lib/update-widgets';
import { confirmAlarmResponded, confirmAlarmMissed, createPendingAlarmEvent } from '@/lib/monitoring-service';
import * as Auth from '@/lib/_core/auth';

const COUNTDOWN_SECONDS = 30;
const SNOOZE_MINUTES = 5;

// Som do alarme para o iOS. No Android quem toca é o serviço nativo; no iOS
// não existe equivalente — a notificação toca o som UMA vez e para, então a
// partir daqui esta tela é a fonte do som.
const ALARM_SOUND = require('@/assets/alarm.mp3');

// Disparos já respondidos nesta sessão JS (chave: alarmId@fireMs). Se alguma
// navegação duplicada empilhar duas instâncias desta tela, a soterrada nunca
// desmonta no dismiss (router.replace só troca o topo) — sem este registro,
// ela expirava sozinha e mandava WhatsApp à família sobre um alarme que o
// idoso JÁ tinha respondido: o pior alarme falso possível do produto.
const respondedFirings = new Set<string>();

// Builds the speech text for the alarm announcement
function buildSpeechText(
  alarmDescription?: string,
  alarmTime?: string,
  vindoDoAlarmKit = false,
): string {
  const parts: string[] = [];
  parts.push('Atenção! Alarme de medicamento.');
  if (alarmTime) {
    parts.push(`Horário: ${alarmTime.replace(':', ' horas e ')} minutos.`);
  }
  if (alarmDescription) {
    parts.push(alarmDescription);
  }
  // A voz é a ÚNICA coisa que sobrevive no caminho do AlarmKit, e lá não existe
  // botão "Desligar Alarme" — mandar procurá-lo é mandar o idoso procurar o que
  // não está na tela. Lá o alarme já foi desligado; o que falta é tomar o
  // remédio.
  parts.push(
    vindoDoAlarmKit
      ? 'Você já desligou o alarme. Agora é só tomar o medicamento.'
      : 'Toque em Desligar Alarme para confirmar que tomou o medicamento.',
  );
  return parts.join(' ');
}

export default function AlarmRingScreen() {
  const router = useRouter();
  const { alarmId, expiresAt: expiresAtParam, snooze: snoozeParam, fromAlarmKit } = useLocalSearchParams<{ alarmId: string; expiresAt?: string; snooze?: string; fromAlarmKit?: string }>();
  const { state, dispatch } = useAppContext();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac } = useAccessibility();
  const colors = useColors();

  const alarm = state.alarms.find((a) => a.id === alarmId);

  // iOS 26+: o alarme JÁ tocou em tela cheia e o idoso JÁ apertou "Desligar" —
  // foi isso que abriu o app. Não há o que tocar nem o que contar: rodar o
  // countdown aqui escalaria para a família um alarme que foi atendido (a
  // confirmação já saiu em confirmAlarmKitDismissal). A tela vira confirmação.
  //
  // ⚠️ É PROCEDÊNCIA do disparo, não capacidade do aparelho. Perguntar
  // `isAlarmKitAvailable()` respondia "este iPhone tem AlarmKit", e num 26+ há
  // rotas vivas que NÃO vêm do AlarmKit: o botão "Testar" da lista de alarmes e
  // a notificação legada de um alarme agendado por build anterior, que dispara
  // antes de syncAlarmsOnStartup migrar. Nessas, dizer "não precisa fazer mais
  // nada" e desligar o countdown seria desarmar o dead man's switch num alarme
  // real não atendido. Só quem navega sabendo da procedência passa o parâmetro.
  const vindoDoAlarmKit = fromAlarmKit === '1';

  // Initialize with the configured duration; will be overridden by persisted timer on mount.
  // Note: configuredDuration from state may be stale if state hasn't loaded yet.
  // The initTimer function reads from AsyncStorage directly as fallback.
  const configuredDuration: number = state.settings.timerDuration ?? 30;
  const [secondsLeft, setSecondsLeft] = useState<number>(configuredDuration);
  const [escalated, setEscalated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const escalationDoneRef = useRef(false);
  const expiresAtRef = useRef<number | null>(null);
  // Timeout que dispara a fala (TTS). Guardado em ref para ser cancelado no
  // dismiss/unmount — senão ele fala depois que o usuário já saiu da tela (#8).
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Marca que o alarme foi respondido, para não retomar o som do alarme depois
  // que a fala termina/para (o handler onDone/onStopped roda de forma assíncrona).
  const dismissedRef = useRef(false);

  // Player do som no iOS (no Android o hook fica ocioso — quem toca é o nativo).
  const iosPlayer = useAudioPlayer(ALARM_SOUND);
  const soundOn = alarm?.sound !== false;

  /** Silencia o som do alarme durante a fala, sem encerrar o alarme. */
  const pauseAlarmSound = useCallback(() => {
    if (Platform.OS === 'ios') {
      iosPlayer.pause();
      return;
    }
    pauseNativeAlarmSound();
  }, [iosPlayer]);

  /** Retoma o som depois da fala — no Android via serviço, no iOS pelo player. */
  const resumeAlarmSound = useCallback(() => {
    // Não há som desta tela para retomar no caminho do AlarmKit — só o do
    // sistema, que já tocou e já parou. Sem esta guarda o alarm.mp3 dispararia
    // do nada quando a fala terminasse.
    if (vindoDoAlarmKit) return;
    if (Platform.OS === 'ios') {
      if (soundOn) iosPlayer.play();
      return;
    }
    resumeNativeAlarmSound();
  }, [iosPlayer, soundOn, vindoDoAlarmKit]);

  // Rota de saída pós-resposta depende do TIPO da conta logada: um cuidador que
  // tocou numa notificação de alarme atrasada (agendada pela conta monitorada
  // que usou o aparelho antes) não pode ser jogado no fluxo do monitorado.
  const [postAlarmRoute, setPostAlarmRoute] = useState<string>('/(tabs)/alarms');
  useEffect(() => {
    Auth.getUserInfo()
      .then((u) => {
        if (u?.userType === 'caregiver') setPostAlarmRoute('/(caregiver-tabs)');
      })
      .catch(() => {});
  }, []);

  // scheduledAt canônico (hora real do disparo) — usado para casar com o evento
  // pré-registrado no servidor. Confirmar com new Date() não batia e o alarme
  // respondido virava "pendente"/"não tocou" (#12.2).
  const canonicalScheduledAt = () =>
    new Date((alarm && lastAlarmFireMs(alarm)) || Date.now());

  // Chave estável do DISPARO (não da instância): duas instâncias empilhadas do
  // mesmo disparo calculam a mesma chave via lastAlarmFireMs.
  const firingKey = () => `${alarmId}@${canonicalScheduledAt().getTime()}`;

  // Speak alarm info aloud - uses speechRate and speechVolume from settings.
  // Pausa o som do alarme durante a fala (em vez de só abaixar): o loop do alarme
  // disputava o foco de áudio e deixava a voz quase inaudível (#7). Ao terminar,
  // retoma o alarme — a menos que o usuário já tenha respondido.
  // O som é o do serviço nativo, então pausar/retomar passa pelo módulo nativo.
  const speakAlarm = useCallback(() => {
    if (Platform.OS === 'web') return;
    const text = buildSpeechText(alarm?.description, alarm?.time, vindoDoAlarmKit);
    // speechVolume chega ao Android via patch do expo-speech (KEY_PARAM_VOLUME)
    // — o módulo original ignorava options.volume por completo fora do iOS.
    const speechVol = (state.settings.speechVolume ?? 90) / 100;
    const speechRate = state.settings.speechRate ?? 0.75;

    const resumeAlarm = () => {
      if (dismissedRef.current) return;
      resumeAlarmSound();
    };

    // Diagnóstico da voz muda no S10 (feedback 28/07): ainda não sabemos se o
    // TTS nem chega a iniciar, se falha, ou se fala sem sair som. Temporário.
    console.log('[Voz] Speech.speak chamado, rate=', speechRate, 'len=', text.length);

    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'pt-BR',
      rate: speechRate,
      pitch: 1.0,
      volume: speechVol,
      onStart: () => {
        console.log('[Voz] onStart');
        setIsSpeaking(true);
        // Silencia o alarme para a voz ser claramente ouvida
        pauseAlarmSound();
      },
      onDone: () => {
        console.log('[Voz] onDone');
        setIsSpeaking(false);
        resumeAlarm();
      },
      onStopped: () => {
        console.log('[Voz] onStopped');
        setIsSpeaking(false);
        resumeAlarm();
      },
      onError: (e) => {
        console.log('[Voz] onError', e);
        setIsSpeaking(false);
        resumeAlarm();
      },
    });
  }, [alarm, state.settings, pauseAlarmSound, resumeAlarmSound, vindoDoAlarmKit]);

  // Mostra a tela por cima da lock screen enquanto o alarme está ativo —
  // escopado a esta tela (não um flag fixo no app inteiro). Ao desmontar
  // (dismiss, soneca ou voltar), exitAlarmLockScreenMode manda a Activity de
  // volta pra lock screen real se o aparelho ainda estiver bloqueado, em vez
  // de deixar a tela inicial do app visível por cima dela.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    enterAlarmLockScreenMode();
    return () => {
      exitAlarmLockScreenMode();
    };
  }, []);

  // Start vibration and speech on mount (o som já está tocando, é do nativo)
  useEffect(() => {
    const startAlarm = async () => {
      try {
        if (Platform.OS !== 'web') {
          // iOS: a notificação tocou o som UMA vez e parou — não há serviço
          // nativo mantendo o alarme. Aqui a tela assume o som, em loop, até o
          // idoso responder. playsInSilentMode faz tocar mesmo com a chavinha
          // lateral no silencioso (a notificação sozinha não fura).
          // `!vindoDoAlarmKit` em vez de sair do efeito inteiro: a FALA mora
          // aqui embaixo e continua nos dois caminhos — é ela que diz qual
          // remédio é, e no caminho do AlarmKit é a primeira vez que o idoso
          // ouve isso. O outro caminho que sobe o som (resumeAlarmSound, ao
          // fim da fala) tem a guarda equivalente.
          if (Platform.OS === 'ios' && soundOn && !vindoDoAlarmKit) {
            await setAudioModeAsync({ playsInSilentMode: true });
            // Mesma curva quadrática do alarme no Android (Sound.java): escalar
            // linear soa igual de 10% a 100%, o ouvido é logarítmico.
            iosPlayer.volume = ((state.settings.alarmVolume ?? 80) / 100) ** 2;
            iosPlayer.loop = true;
            iosPlayer.play();
          }

          // O SOM é do serviço nativo (expo-alarm-module) e continua tocando —
          // esta tela NÃO o substitui. A versão anterior matava o som nativo
          // aqui para tocar via expo-audio, e no cold start o player do JS não
          // subia a tempo: o alarme ficava mudo justamente quando o app estava
          // fechado. O caminho nativo é foreground service no STREAM_ALARM e
          // não depende do boot do JS. Ver docs/claude/alarmes.md.

          // ÚNICA fonte de vibração do alarme: o canal de notificação e o
          // serviço nativo não vibram mais (patch em expo-alarm-module). Eram
          // três fontes somadas, e as duas nativas não conhecem as
          // configurações — desligar a vibração no app não surtia efeito.
          // Respeita as DUAS chaves: a global (Configurações) e a do alarme
          // (formulário). Lê do storage pelo mesmo motivo do timerDuration
          // abaixo: no disparo a frio o state ainda não hidratou e os defaults
          // (true) venceriam.
          const vibrationOk = await shouldVibrate(
            { globalEnabled: state.settings.vibrationEnabled, alarmEnabled: alarm?.vibration },
            alarmId,
            loadCurrentAppStateRaw
          );
          // `!vindoDoAlarmKit` pelo mesmo motivo do som: vibrate(..., true)
          // repete até Vibration.cancel(), e no caminho do AlarmKit o idoso já
          // desligou o alarme — o celular ficaria vibrando sem parar depois de
          // ele ter respondido.
          if (vibrationOk && !vindoDoAlarmKit) {
            Vibration.vibrate([0, 500, 500, 500], true);
          }

          // Curto atraso antes de falar, para o idoso registrar o alarme antes
          // da voz. Guardado em ref para ser cancelado se ele desligar antes
          // de a fala começar (#8).
          speechTimeoutRef.current = setTimeout(() => {
            speechTimeoutRef.current = null;
            speakAlarm();
          }, 500);
        }
      } catch (e) {
        console.warn('[AlarmRing] Error starting vibration/speech:', e);
      }
    };

    startAlarm();

    return () => {
      try {
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        Vibration.cancel();
        Speech.stop();
        // Sair da tela (desligar, soneca ou voltar) tem de calar o som do iOS —
        // no Android quem encerra é o stopNativeAlarm/snoozeNativeAlarm.
        if (Platform.OS === 'ios') iosPlayer.pause();
      } catch {}
    };
  }, []);

  // Synchronized countdown timer
  // On mount, load the persisted timer entry to sync with the real elapsed time.
  // This ensures that if the user taps the notification with 12s left, the app
  // shows exactly 12s - not a fresh 30s countdown.
  useEffect(() => {
    // O countdown é o que escala para a família. No caminho do AlarmKit o
    // idoso JÁ respondeu (foi o "Desligar" que abriu o app), então contar aqui
    // avisaria a família de um alarme atendido. Sem countdown, secondsLeft
    // nunca chega a 0 e o efeito de escalação abaixo nunca dispara.
    if (vindoDoAlarmKit) return;

    let cancelled = false;

    const startCountdown = (expiresAt: number) => {
      expiresAtRef.current = expiresAt;
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        escalationDoneRef.current = true;
        setEscalated(true);
        return;
      }
      countdownRef.current = setInterval(() => {
        if (!expiresAtRef.current) return;
        const rem = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
        setSecondsLeft(rem);
        if (rem <= 0) clearInterval(countdownRef.current!);
      }, 1000);
    };

    const initTimer = async () => {
      if (!alarmId || cancelled) return;

      // Priority 1: expiresAt passed as URL param (most reliable, no AsyncStorage race)
      if (expiresAtParam) {
        const parsedExpiresAt = parseInt(expiresAtParam, 10);
        if (!isNaN(parsedExpiresAt) && parsedExpiresAt > Date.now()) {
          startCountdown(parsedExpiresAt);
          return;
        }
      }

      // Priority 2: AsyncStorage persisted timer (fallback for cold start / re-entry)
      const entry = await loadAlarmTimer(alarmId);
      if (cancelled) return;

      if (entry && entry.expiresAt > Date.now()) {
        // Use the persisted expiresAt to compute real remaining time
        startCountdown(entry.expiresAt);
      } else {
        // Cold start (app morto no disparo, sem timer persistido). Ancoramos a
        // contagem na hora REAL do disparo agendado — não em Date.now() — para
        // continuar de onde deveria em vez de reiniciar em 30s (#10).
        let duration = configuredDuration;
        let alarmForAnchor = alarm;
        try {
          const { loadCurrentAppStateRaw } = require('@/lib/app-state-storage');
          const raw = await loadCurrentAppStateRaw();
          if (raw) {
            const parsed = JSON.parse(raw);
            const stored = parsed?.settings?.timerDuration;
            if (typeof stored === 'number' && [15, 30, 45, 60].includes(stored)) {
              duration = stored;
            }
            if (!alarmForAnchor) {
              alarmForAnchor = parsed?.alarms?.find((a: any) => a.id === alarmId);
            }
          }
        } catch {}
        const fireMs = alarmForAnchor ? lastAlarmFireMs(alarmForAnchor) : null;
        startCountdown((fireMs ?? Date.now()) + duration * 1000);
      }
    };

    initTimer();

    return () => {
      cancelled = true;
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [alarmId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // When countdown reaches 0, send WhatsApp escalation
  useEffect(() => {
    if (secondsLeft === 0 && !escalationDoneRef.current && !dismissed) {
      // Outra instância desta tela (empilhada) já registrou resposta para este
      // disparo — não escalar nem marcar como perdido.
      if (respondedFirings.has(firingKey())) {
        escalationDoneRef.current = true;
        return;
      }
      escalationDoneRef.current = true;
      setEscalated(true);
      // Confirm alarm as missed on server monitoring system
      if (alarm) {
        confirmAlarmMissed(alarm, canonicalScheduledAt()).catch(() => {});
      }

      const doEscalate = async () => {
        let userLocation: { latitude: number; longitude: number } | undefined;
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            userLocation = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
          }
        } catch {}

        if (alarm) {
          await escalateAlarmToContacts(alarm, state.emergencyContacts, userLocation);
        }
      };

      if (Platform.OS !== 'web') {
        doEscalate();
      }
    }
  }, [secondsLeft, dismissed, alarm, state.emergencyContacts]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    dismissedRef.current = true;
    respondedFirings.add(firingKey());
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    // Stop native alarm (Android AlarmManager)
    stopNativeAlarm().catch(() => {});
    // Stop speech
    Speech.stop().catch(() => {});
    // Clear persisted timer
    if (alarmId) {
      clearAlarmTimer(alarmId);
      // iOS: tira da Central a notificação já entregue deste alarme. Sem isto
      // ela sobrevive ao dismiss e, tocada depois, reabre esta tela num
      // disparo já respondido — que monta direto no estado escalado.
      dismissDeliveredAlarmNotification(alarmId);
    }

    Vibration.cancel();

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Reset missed alarm counter - user responded
    dispatch({ type: 'RESET_MISSED_ALARM' });
    // Confirm alarm as responded on server monitoring system
    if (alarm) {
      confirmAlarmResponded(alarm, canonicalScheduledAt()).catch(() => {});
    }
    // Atualiza widget Android para mostrar o próximo alarme pendente
    updateAlarmWidgetOnDismiss(state.alarms).catch(() => {});

    router.replace(postAlarmRoute as never);
    // `alarm` e `state.alarms` PRECISAM estar aqui: no cold start (alarme toca
    // com o app morto) a tela monta antes do AsyncStorage carregar, então
    // `alarm` é undefined no primeiro render. Sem eles nas deps o callback
    // ficava congelado com esse undefined — o `if (alarm)` acima nunca passava,
    // o servidor jamais recebia "responded" e o evento ficava pendente até o
    // job marcá-lo como perdido, escalando para a família um alarme que o idoso
    // TINHA respondido. (updateAlarmWidgetOnDismiss recebia [] pelo mesmo
    // motivo.) handleSnooze já dependia de `alarm` — por isso só o dismiss
    // falhava.
  }, [alarmId, alarm, state.alarms, dispatch, router, postAlarmRoute]);

  // Soneca: conta como respondido AGORA (idoso interagiu = vivo), mas re-arma um
  // disparo em 5 min. Se a soneca for ignorada, o evento +5min vira "perdido" no
  // servidor e escala — regra do usuário (feedback do beta, item 4.3).
  const handleSnooze = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    setDismissed(true); // impede a escalação do disparo atual
    dismissedRef.current = true;
    respondedFirings.add(firingKey());
    stopNativeAlarm().catch(() => {});
    Speech.stop().catch(() => {});
    if (alarmId) {
      clearAlarmTimer(alarmId);
      // Mesma limpeza do dismiss: a soneca também encerra o disparo atual, e a
      // notificação dele não pode sobreviver para reabrir a tela depois.
      dismissDeliveredAlarmNotification(alarmId);
    }
    Vibration.cancel();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (alarm) {
      dispatch({ type: 'RESET_MISSED_ALARM' });
      confirmAlarmResponded(alarm, canonicalScheduledAt()).catch(() => {});
      const fireAt = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);
      snoozeNativeAlarm(alarm, fireAt).catch(() => {});
      createPendingAlarmEvent(alarm, fireAt).catch(() => {});
    }

    router.replace(postAlarmRoute as never);
  }, [alarmId, alarm, dispatch, router, postAlarmRoute]);

  // Botão "Soneca" da notificação: chega como deep link &snooze=1 (a action
  // nativa abre o app em vez de reagendar em Java — ver native-alarm-manager).
  // Executa a soneca assim que o alarme carrega do estado; `alarm` na dep é
  // essencial no cold start (a tela monta antes do AsyncStorage carregar).
  const autoSnoozedRef = useRef(false);
  useEffect(() => {
    if (snoozeParam !== '1' || autoSnoozedRef.current || !alarm) return;
    autoSnoozedRef.current = true;
    handleSnooze();
  }, [snoozeParam, alarm, handleSnooze]);

  const handleSpeakAgain = useCallback(async () => {
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      await Speech.stop();
      setIsSpeaking(false);
    } else {
      speakAlarm();
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [speakAlarm]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // Urgent when less than 30% of the total duration remains
  const urgentThreshold = Math.ceil(configuredDuration * 0.3);
  const isUrgent = secondsLeft <= urgentThreshold && secondsLeft > 0;
  const isExpired = secondsLeft === 0;
  const alarmColor = isExpired ? colors.error : isUrgent ? colors.warning : colors.primary;

  // --- Accessibility Mode ---------------------------------------------------
  if (isAccessibilityMode) {
    // A paleta acessível é FIXA (fundo creme, clara em qualquer tema), enquanto
    // colors.* muda com claro/escuro e foi calibrado para o azul-escuro do modo
    // normal. Misturar os dois some com o alarme sobre o creme: colors.warning
    // dava 1,46:1 (claro) e 1,30:1 (escuro) contra ac.background — o ícone
    // branco dentro do círculo âmbar ficava em 1,68:1 / 1,49:1, longe dos 3:1
    // de gráfico da WCAG 1.4.11. Por isso o estado do alarme aqui sai SÓ do
    // ac.*: ac.warning (#7A5200) dá 6,04:1 contra o creme e 6,92:1 contra o
    // ícone branco, e ac.error (#B5070D) dá 6,11:1 / 7,00:1.
    const a11yAlarmColor = isExpired ? ac.error : isUrgent ? ac.warning : ac.primary;
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: ac.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        {/* Icon */}
        <View style={styles.topSection}>
          <RippleHalo size={180} color={a11yAlarmColor}>
            <View
              style={[
                styles.iconCircle,
                {
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  backgroundColor: a11yAlarmColor,
                  shadowColor: a11yAlarmColor,
                },
              ]}
            >
              <MaterialIcons name="alarm" size={88} color="#FFFFFF" />
            </View>
          </RippleHalo>
          <Text style={[styles.alarmLabel, { color: ac.muted, fontSize: af.sm + 2, letterSpacing: 3 }]}>
            ALARME
          </Text>
        </View>

        {/* Alarm info */}
        <View style={styles.infoSection}>
          <Text style={[styles.alarmTime, { color: ac.foreground, fontSize: 72 }]}>
            {alarm?.time ?? '--:--'}
          </Text>
          <Text
            style={[styles.alarmName, { color: ac.muted, fontSize: af.lg, lineHeight: af.lg * 1.4 }]}
            numberOfLines={3}
          >
            {alarm?.description || 'Alarme'}
          </Text>
        </View>

        {/* Speak again button - prominent in accessibility mode */}
        <Pressable
          style={({ pressed }) => [
            styles.speakButton,
            {
              backgroundColor: isSpeaking ? ac.primary + '33' : ac.primary + '22',
              borderColor: ac.primary,
              borderWidth: 3,
              minHeight: 72,
              paddingVertical: 18,
            },
            pressed && { opacity: 0.75 },
          ]}
          onPress={handleSpeakAgain}
          accessibilityLabel={isSpeaking ? 'Parar leitura' : 'Ouvir alarme em voz alta'}
        >
          <MaterialIcons
            name={isSpeaking ? 'stop' : 'volume-up'}
            size={40}
            color={ac.primary}
          />
          <Text style={[styles.speakButtonText, { color: ac.primary, fontSize: af.md, fontWeight: '700' }]}>
            {isSpeaking ? 'Parar Leitura' : 'Ouvir em Voz Alta'}
          </Text>
        </Pressable>

        {/* Countdown — no caminho do AlarmKit não há o que contar: o alarme já
            foi atendido na tela do sistema. (escalatedBox/escalatedText são só
            o layout de caixa de aviso; a cor é que diz o que aconteceu.) */}
        <View style={[styles.countdownSection, { gap: 10 }]}>
          {vindoDoAlarmKit ? (
            <View style={[styles.escalatedBox, { backgroundColor: ac.surface, borderColor: ac.success, borderWidth: 3 }]}>
              <MaterialIcons name="check-circle" size={36} color={ac.success} />
              <Text style={[styles.escalatedText, { color: ac.success, fontSize: af.md, lineHeight: af.md * 1.4 }]}>
                Alarme desligado. Não precisa fazer mais nada.
              </Text>
            </View>
          ) : !isExpired ? (
            <>
              {/* ac.warning, não colors.warning: o âmbar do tema (#F0C24A claro /
                  #F5D06E escuro) sobre o creme fixo desta paleta dá 1,46:1 e
                  1,30:1 — o aviso de que a mensagem de emergência está a caminho
                  sumia justamente nos segundos finais. ac.warning dá 6,04:1. */}
              <Text style={[styles.countdownLabel, { color: isUrgent ? ac.warning : ac.muted, fontSize: af.sm, fontWeight: isUrgent ? '700' : '400' }]}>
                {isUrgent ? '⚠️ Mensagem de emergência em' : 'Mensagem de emergência em'}
              </Text>
              <Text style={[styles.countdownTimer, { color: isUrgent ? ac.warning : ac.foreground, fontSize: 56 }]}>
                {formatTime(secondsLeft)}
              </Text>
              <Text style={[styles.countdownSub, { color: ac.muted, fontSize: af.xs }]}>
                Toque em "Desligar" para cancelar o envio
              </Text>
            </>
          ) : (
            /* Tokens ac.*, não colors.*: o tinte colors.errorLight assume o
               fundo do modo normal; sobre o creme ele deixava o texto em
               4,11:1 (claro) e 2,84:1 (escuro) — no escuro reprovava até o
               mínimo de texto grande (3:1) e o ícone de 36px. A paleta
               acessível não tem token de tinte de erro, então a caixa usa
               ac.surface (branco, já usado no botão de soneca) com borda e
               texto em ac.error: 7,00:1 no texto e 6,11:1 da borda contra o
               fundo, que é o que delimita a caixa. */
            <View style={[styles.escalatedBox, { backgroundColor: ac.surface, borderColor: ac.error, borderWidth: 3 }]}>
              <MaterialIcons name="warning" size={36} color={ac.error} />
              <Text style={[styles.escalatedText, { color: ac.error, fontSize: af.md, lineHeight: af.md * 1.4 }]}>
                Mensagem de emergência enviada para seus contatos
              </Text>
            </View>
          )}
        </View>

        {/* Snooze + Dismiss buttons — a soneca some no caminho do AlarmKit:
            snoozeNativeAlarm é no-op fora do Android, mas handleSnooze registra
            o evento pendente. No iPhone nada voltaria a tocar e a família seria
            avisada em 5 min sobre quem acabou de responder. */}
        <View style={[styles.bottomSection, { gap: 14 }]}>
          {!isExpired && !vindoDoAlarmKit && (
            <Pressable
              style={({ pressed }) => [
                styles.snoozeButton,
                { minHeight: 72, paddingVertical: 20, backgroundColor: ac.surface, borderColor: ac.border, borderWidth: 2 },
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleSnooze}
              accessibilityLabel={`Soneca de ${SNOOZE_MINUTES} minutos`}
            >
              <MaterialIcons name="snooze" size={36} color={ac.foreground} />
              <Text style={[styles.snoozeText, { fontSize: af.md, color: ac.foreground, fontWeight: '800' }]}>
                Soneca ({SNOOZE_MINUTES} min)
              </Text>
            </Pressable>
          )}
          {/* styles.dismissButton NÃO traz backgroundColor — quem o define é
              cada modo (no normal, colors.error logo abaixo). Sem ele aqui, o
              botão ficava transparente sobre o creme com o texto branco fixo do
              estilo: 1,15:1, ou seja, invisível — o botão mais importante do
              app, no modo feito para quem enxerga pior. ac.error/ac.onEmergency
              (o mesmo par do modo normal) põe o contraste em 7,00:1. */}
          <Pressable
            style={({ pressed }) => [
              styles.dismissButton,
              // vindoDoAlarmKit muda a cor de sucesso -> emergência, mas o
              // fundo sempre existe. A branch do AlarmKit tinha essa condição
              // sem fallback: no caminho comum o botão ficava sem
              // backgroundColor — o mesmo defeito de 1,15:1 que o creme fixo
              // já expôs uma vez neste arquivo (ver comentário acima).
              { minHeight: 88, paddingVertical: 26, backgroundColor: vindoDoAlarmKit ? ac.success : ac.error },
              vindoDoAlarmKit && { shadowColor: ac.success },
              pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
            ]}
            onPress={handleDismiss}
            accessibilityLabel={vindoDoAlarmKit ? 'Confirmado, fechar' : 'Desligar alarme'}
          >
            <MaterialIcons name={vindoDoAlarmKit ? 'check' : 'alarm-off'} size={44} color={vindoDoAlarmKit ? ac.onPrimary : ac.onEmergency} />
            <Text style={[styles.dismissText, { fontSize: af.lg, fontWeight: '900', color: vindoDoAlarmKit ? ac.onPrimary : ac.onEmergency }]}>
              {vindoDoAlarmKit ? 'Confirmado' : 'Desligar Alarme'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // --- Normal Mode ----------------------------------------------------------
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* Top section: ícone parado com halo pulsando por trás */}
      <View style={styles.topSection}>
        <RippleHalo size={160} color={alarmColor}>
          <View style={[
            styles.iconCircle,
            { backgroundColor: alarmColor, shadowColor: alarmColor },
          ]}>
            <MaterialIcons
              name="alarm"
              size={72}
              color={colors.onPrimary}
            />
          </View>
        </RippleHalo>

        <Text style={styles.alarmLabel}>ALARME</Text>
      </View>

      {/* Middle section: alarm info */}
      <View style={styles.infoSection}>
        <Text style={styles.alarmTime}>{alarm?.time ?? '--:--'}</Text>
        <Text style={styles.alarmName} numberOfLines={2}>
          {alarm?.description || 'Alarme'}
        </Text>
      </View>

      {/* Speak again button */}
      <Pressable
        style={({ pressed }) => [
          styles.speakButton,
          isSpeaking && styles.speakButtonActive,
          pressed && { opacity: 0.75 },
        ]}
        onPress={handleSpeakAgain}
        accessibilityLabel={isSpeaking ? 'Parar leitura' : 'Ouvir alarme em voz alta'}
      >
        <MaterialIcons
          name={isSpeaking ? 'stop' : 'volume-up'}
          size={24}
          color="#93C5FD"
        />
        <Text style={styles.speakButtonText}>
          {isSpeaking ? 'Parar Leitura' : 'Ouvir em Voz Alta'}
        </Text>
      </Pressable>

      {/* Countdown timer — ver a nota do modo acessível: no caminho do
          AlarmKit o alarme já foi respondido, não há contagem. */}
      <View style={styles.countdownSection}>
        {vindoDoAlarmKit ? (
          // Mesma regra da caixa de erro logo abaixo: o container deste
          // arquivo é um azul-escuro FIXO (não muda com o tema), então a cor
          // por cima também precisa ser. `colors.success` claro (#0C7A40) foi
          // escurecido para funcionar sobre um fundo CLARO — sobre este
          // container dava 3,14:1 como texto e 3,34:1 como ícone/borda.
          <View style={[styles.escalatedBox, { backgroundColor: '#22C55E20', borderColor: '#22C55E' }]}>
            <MaterialIcons name="check-circle" size={28} color="#22C55E" />
            <Text style={[styles.escalatedText, { color: '#86EFAC' }]}>
              Alarme desligado. Não precisa fazer mais nada.
            </Text>
          </View>
        ) : !isExpired ? (
          <>
            <Text style={[styles.countdownLabel, isUrgent && { color: colors.warning, fontWeight: '600' }]}>
              {isUrgent ? '⚠️ Mensagem de emergência em' : 'Mensagem de emergência em'}
            </Text>
            <Text style={[styles.countdownTimer, isUrgent && { color: colors.warning }]}>
              {formatTime(secondsLeft)}
            </Text>
            <Text style={styles.countdownSub}>
              Toque em "Desligar" para cancelar o envio
            </Text>
          </>
        ) : (
          // O container do modo normal é um azul-escuro FIXO, então a caixa
          // também precisa ser: `colors.error` no tema claro é um vermelho
          // ESCURO (calibrado para fundo claro) e dava 3,37:1 sobre o azul.
          <View style={[styles.escalatedBox, { backgroundColor: '#F0404020', borderColor: '#F04040' }]}>
            <MaterialIcons name="warning" size={28} color="#F04040" />
            <Text style={[styles.escalatedText, { color: '#FCA5A5' }]}>
              Mensagem de emergência enviada para seus contatos
            </Text>
          </View>
        )}
      </View>

      {/* Snooze + Dismiss buttons — ver a nota do modo acessível: sem soneca
          no caminho do AlarmKit. */}
      <View style={[styles.bottomSection, { gap: 12 }]}>
        {!isExpired && !vindoDoAlarmKit && (
          <Pressable
            style={({ pressed }) => [styles.snoozeButton, pressed && { opacity: 0.8 }]}
            onPress={handleSnooze}
            accessibilityLabel={`Soneca de ${SNOOZE_MINUTES} minutos`}
          >
            <MaterialIcons name="snooze" size={24} color="#FFFFFF" />
            <Text style={styles.snoozeText}>Soneca ({SNOOZE_MINUTES} min)</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.dismissButton,
            vindoDoAlarmKit
              ? { backgroundColor: colors.success, shadowColor: colors.success }
              : { backgroundColor: colors.error, shadowColor: colors.error },
            pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
          ]}
          onPress={handleDismiss}
          accessibilityLabel={vindoDoAlarmKit ? 'Confirmado, fechar' : 'Desligar alarme'}
        >
          <MaterialIcons name={vindoDoAlarmKit ? 'check' : 'alarm-off'} size={32} color={vindoDoAlarmKit ? colors.onSuccess : colors.onEmergency} />
          <Text style={[styles.dismissText, vindoDoAlarmKit && { color: colors.onSuccess }]}>
            {vindoDoAlarmKit ? 'Confirmado' : 'Desligar Alarme'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  topSection: {
    alignItems: 'center',
    gap: 16,
    marginTop: 24,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  alarmLabel: {
    // 15 é o corpo mínimo do CLAUDE.md; era 13.
    fontSize: 15,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 4,
  },
  infoSection: {
    alignItems: 'center',
    gap: 8,
  },
  alarmTime: {
    fontSize: 64,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  alarmName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 30,
  },
  speakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#93C5FD18',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#93C5FD44',
    minHeight: 48,
    width: '100%',
  },
  speakButtonActive: {
    backgroundColor: '#93C5FD30',
    borderColor: '#93C5FD88',
  },
  speakButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#93C5FD',
  },
  countdownSection: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  countdownLabel: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
  },
  countdownLabelUrgent: {
    fontWeight: '600',
  },
  countdownTimer: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  countdownTimerUrgent: {},
  countdownSub: {
    // 15 é o corpo mínimo do CLAUDE.md; era 12, o menor da tela, justo na
    // linha que ensina a impedir o acionamento da família. O rótulo acima
    // subiu junto (16) para o primário não ficar menor que o secundário.
    fontSize: 15,
    // slate-400, não slate-500: o 500 dava 3,81:1 sobre o container.
    color: '#94A3B8',
    textAlign: 'center',
    // Entrelinha do estilo COMPARTILHADO: o modo acessível troca o fontSize
    // por af.xs (16) e herda esta linha — 18 apertava o texto lá também.
    lineHeight: 21,
  },
  escalatedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
  },
  escalatedText: {
    // Esta caixa ocupa o lugar do bloco do cronômetro quando o tempo acaba,
    // então o aviso de que a família já foi acionada não pode chegar menor
    // que o rótulo que ele substitui (countdownLabel, 16). Era 14.
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    lineHeight: 22,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
  },
  dismissButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 40,
    width: '100%',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  dismissText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  snoozeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  snoozeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
