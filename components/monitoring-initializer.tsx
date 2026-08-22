/**
 * monitoring-initializer.tsx
 *
 * Invisible component that bootstraps the server monitoring system:
 * 1. Starts the heartbeat service (liveness da conta; contatos/nome sobem
 *    pelo cloud backup userData.put — não há mais registro de device)
 * 2. Pre-registers expected alarm events on the server
 * 3. Checks for offline alarms on startup and shows a summary dialog
 *
 * Mount this inside AppProvider so it has access to app state.
 */
import { useEffect, useRef } from "react";
import { useAppContext } from "@/lib/app-context";
import {
  startHeartbeat,
  stopHeartbeat,
  syncAlarmsToServer,
  checkOfflineAlarms,
  getWarningLog,
  flushPendingConfirmations,
} from "@/lib/monitoring-service";
import * as Auth from "@/lib/_core/auth";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { AppDialog, useAppDialog } from "@/components/app-dialog";

/**
 * Returns the user's current location string ("lat,lng") only when:
 *  - native platform
 *  - foreground permission already granted (no prompts)
 *  - the user explicitly opted-in to location sharing
 *
 * The user-facing privacy copy claims location is shared "in emergencies
 * / when you tap Share", so we honor the `autoShareLocation` setting
 * before sending periodic heartbeat coordinates to the server.
 */
async function getCurrentLocationStringIfOptedIn(
  optedIn: boolean
): Promise<string | undefined> {
  if (!optedIn) return undefined;
  try {
    if (Platform.OS === "web") return undefined;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return undefined;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return `${loc.coords.latitude},${loc.coords.longitude}`;
  } catch {
    return undefined;
  }
}

/** Formata a data de um warning para exibição */
function formatWarningDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/** Traduz o nível de severidade do aviso */
function translateSeverity(level: string): string {
  switch (level) {
    case "warning": return "aviso leve";
    case "concern": return "preocupação moderada";
    case "alert":   return "alerta sério";
    default:        return level;
  }
}

export function MonitoringInitializer() {
  const { state } = useAppContext();
  const initializedRef = useRef(false);
  const bootstrappedOpenIdRef = useRef<string | null>(null);
  const lastAlarmHashRef = useRef<string>("");
  // Ref sempre com o state mais recente: o bootstrap pode rodar num login
  // TARDIO (sessão ausente/expirada no mount), quando o closure do efeito já
  // capturou um state velho.
  const stateRef = useRef(state);
  stateRef.current = state;
  const { dialogProps, showDialog, hideDialog } = useAppDialog();

  // Bootstrap do monitoramento (registro + heartbeat + sync + aviso de offline)
  // amarrado ao usuário AUTENTICADO — não só ao mount. Antes rodava uma vez no
  // mount e marcava initializedRef=true na hora; se a sessão não existia ainda
  // (token expirado, login posterior), TODAS as chamadas caíam em 401 e o dead
  // man's switch nunca era armado, sem nunca re-tentar após o login.
  useEffect(() => {
    const bootstrap = async (openId: string) => {
      if (bootstrappedOpenIdRef.current === openId) return; // já feito p/ este usuário
      bootstrappedOpenIdRef.current = openId;
      initializedRef.current = true;
      const s = stateRef.current;

      try {
        // Start heartbeat service. We re-read the opt-in flag on each tick
        // (via stateRef) so toggling it in Settings takes effect without a
        // restart. startHeartbeat is idempotente (no-op se já rodando).
        startHeartbeat(() =>
          getCurrentLocationStringIfOptedIn(
            stateRef.current.settings?.autoShareLocation ?? false
          )
        );

        // ANTES de sincronizar: reenvia resposta de alarme que não chegou ao
        // servidor (rede caída no dismiss, app morto logo depois). Se ficar
        // para depois, o monitoring-job pode escalar para a família um alarme
        // que o idoso respondeu.
        await flushPendingConfirmations();

        // Sync current alarms
        await syncAlarmsToServer(s.alarms);

        // Check for offline alarms (not_sent) from previous sessions
        const { notSentCount } = await checkOfflineAlarms(s.alarms);

        if (notSentCount > 0) {
          console.log(
            `[Monitoring] ${notSentCount} alarm(s) were not confirmed while the app was closed/offline`
          );

          // Check if the server sent any warnings to contacts during the offline period
          const warnings = await getWarningLog(5);
          const recentWarnings = warnings.filter((w) => {
            // Only show warnings from the last 7 days
            const warningDate = new Date(w.sentAt ?? w.created_at ?? "");
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return warningDate > sevenDaysAgo;
          });

          // Build the dialog message
          const alarmWord = notSentCount === 1 ? "alarme" : "alarmes";
          let message = `Nas últimas 48 horas, ${notSentCount} ${alarmWord} de remédio não ${notSentCount === 1 ? "foi confirmado" : "foram confirmados"} — o celular pode ter ficado desligado, sem internet ou com o app fechado.`;

          if (recentWarnings.length > 0) {
            const lastWarning = recentWarnings[0];
            const severity = translateSeverity(lastWarning.level ?? lastWarning.severity ?? "");
            const date = formatWarningDate(lastWarning.sentAt ?? lastWarning.created_at ?? "");
            message += `\n\nO servidor enviou um ${severity} aos seus contatos de emergência em ${date}.`;
          } else {
            message += "\n\nNenhum aviso foi enviado aos seus contatos de emergência.";
          }

          message += "\n\nVocê pode ver o histórico completo na tela de Alarmes.";

          // Small delay to let the app fully initialize before showing the dialog
          setTimeout(() => {
            showDialog({
              title: "Alarmes não confirmados",
              message,
              variant: recentWarnings.length > 0 ? "warning" : "info",
              buttons: [
                {
                  text: "Entendido",
                  onPress: hideDialog,
                  style: "default",
                },
              ],
            });
          }, 2000);
        }

        console.log("[Monitoring] Initialized successfully");
      } catch (error) {
        // Falhou (rede/401): libera o marcador para re-tentar no próximo
        // login/notify em vez de ficar preso sem monitoramento.
        bootstrappedOpenIdRef.current = null;
        console.warn("[Monitoring] Initialization failed:", error);
      }
    };

    // Startup já-logado: nenhuma notificação de troca de conta é emitida
    // (setUserInfo só roda no login), então dispara o bootstrap na mão.
    (async () => {
      const user = await Auth.getUserInfo();
      if (user?.openId) bootstrap(user.openId);
    })();

    // Login posterior (sessão estava ausente/expirada no mount): re-bootstrap.
    // Logout: para o heartbeat e libera para re-armar no próximo login.
    const unsubscribe = Auth.subscribeActiveUser((openId) => {
      if (openId) {
        bootstrap(openId);
      } else {
        stopHeartbeat();
        bootstrappedOpenIdRef.current = null;
        initializedRef.current = false;
      }
    });

    return () => {
      unsubscribe();
      stopHeartbeat();
    };
  }, []);

  // Sync alarms whenever the alarm list changes
  useEffect(() => {
    if (!initializedRef.current) return;

    const hash = state.alarms.map((a) => `${a.id}:${a.time}:${a.enabled}`).join("|");
    if (hash === lastAlarmHashRef.current) return;
    lastAlarmHashRef.current = hash;

    syncAlarmsToServer(state.alarms).catch(console.warn);
  }, [state.alarms]);

  // Render the offline alarms dialog (invisible until triggered)
  return <AppDialog {...dialogProps} />;
}
