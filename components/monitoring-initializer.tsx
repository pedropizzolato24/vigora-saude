/**
 * monitoring-initializer.tsx
 *
 * Invisible component that bootstraps the server monitoring system:
 * 1. Registers the device on first launch
 * 2. Starts the heartbeat service
 * 3. Syncs alarms to the server
 * 4. Checks for offline alarms on startup and shows a summary dialog
 *
 * Mount this inside AppProvider so it has access to app state.
 */
import { useEffect, useRef } from "react";
import { useAppContext } from "@/lib/app-context";
import {
  registerDevice,
  startHeartbeat,
  stopHeartbeat,
  syncAlarmsToServer,
  checkOfflineAlarms,
  getWarningLog,
} from "@/lib/monitoring-service";
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
  const lastAlarmHashRef = useRef<string>("");
  const { dialogProps, showDialog, hideDialog } = useAppDialog();

  // Register device and start heartbeat on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      try {
        // Get current location ONLY if the user opted in to location sharing.
        // Respecting the autoShareLocation setting (Privacy) — see Fix #13.
        const optedIn = state.settings?.autoShareLocation ?? false;
        const location = await getCurrentLocationStringIfOptedIn(optedIn);

        // Build emergency contacts payload
        const contacts = state.emergencyContacts.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          relation: c.relation,
          whatsapp: c.whatsapp ?? false,
          email: c.email,
        }));

        // Register device with server
        await registerDevice({
          userName: state.anamnesis?.fullName,
          emergencyContacts: contacts,
          lastLocation: location,
        });

        // Start heartbeat service. We re-read the opt-in flag on each
        // tick (via closure over `state`) so toggling it in Settings
        // takes effect without a restart.
        startHeartbeat(() =>
          getCurrentLocationStringIfOptedIn(
            state.settings?.autoShareLocation ?? false
          )
        );

        // Sync current alarms
        await syncAlarmsToServer(state.alarms);

        // Check for offline alarms (not_sent) from previous sessions
        const { notSentCount } = await checkOfflineAlarms(state.alarms);

        if (notSentCount > 0) {
          console.log(
            `[Monitoring] ${notSentCount} alarm(s) were not sent while device was offline`
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
          let message = `Nas últimas 48 horas, ${notSentCount} ${alarmWord} de remédio não ${notSentCount === 1 ? "tocou" : "tocaram"} — provavelmente o celular estava desligado, sem bateria ou sem conexão.`;

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
              title: "Alarmes Perdidos",
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
        console.warn("[Monitoring] Initialization failed:", error);
      }
    };

    init();

    return () => {
      stopHeartbeat();
    };
  }, []);

  // Re-register when emergency contacts or name change
  useEffect(() => {
    if (!initializedRef.current) return;

    const contacts = state.emergencyContacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      relation: c.relation,
      whatsapp: c.whatsapp ?? false,
      email: c.email,
    }));

    registerDevice({
      userName: state.anamnesis?.fullName,
      emergencyContacts: contacts,
    }).catch(console.warn);
  }, [state.emergencyContacts, state.anamnesis?.fullName]);

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
