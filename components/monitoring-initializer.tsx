/**
 * monitoring-initializer.tsx
 *
 * Invisible component that bootstraps the server monitoring system:
 * 1. Registers the device on first launch
 * 2. Starts the heartbeat service
 * 3. Syncs alarms to the server
 * 4. Checks for offline alarms on startup
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
} from "@/lib/monitoring-service";
import * as Location from "expo-location";
import { Platform } from "react-native";

async function getCurrentLocationString(): Promise<string | undefined> {
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

export function MonitoringInitializer() {
  const { state } = useAppContext();
  const initializedRef = useRef(false);
  const lastAlarmHashRef = useRef<string>("");

  // Register device and start heartbeat on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      try {
        // Get current location for registration
        const location = await getCurrentLocationString();

        // Build emergency contacts payload
        const contacts = state.emergencyContacts.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          relation: c.relation,
          whatsapp: c.whatsapp ?? false,
        }));

        // Register device with server
        await registerDevice({
          userName: state.anamnesis?.fullName,
          emergencyContacts: contacts,
          lastLocation: location,
        });

        // Start heartbeat service
        startHeartbeat(getCurrentLocationString);

        // Sync current alarms
        await syncAlarmsToServer(state.alarms);

        // Check for offline alarms (not_sent) from previous sessions
        const { notSentCount } = await checkOfflineAlarms(state.alarms);
        if (notSentCount > 0) {
          console.log(
            `[Monitoring] ${notSentCount} alarm(s) were not sent while device was offline`
          );
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

  return null;
}
