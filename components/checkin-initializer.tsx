/**
 * CheckinInitializer
 *
 * Componente sem UI que roda no startup e:
 * 1. Garante que o check-in está agendado corretamente se `checkinEnabled` for true.
 * 2. Reage a mudanças de configuração (horário, janela, toggle) re-agendando.
 * 3. Trata toques na notificação de check-in (prompt e timeout) navegando para /checkin-response.
 *
 * Monta dentro do AppProvider (estado já carregado do AsyncStorage),
 * por isso pode ler `state.settings` com segurança.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/lib/app-context';
import { scheduleCheckin, cancelCheckin } from '@/lib/checkin-service';

export function CheckinInitializer() {
  const { state } = useAppContext();
  const router = useRouter();
  const { checkinEnabled, checkinTime, checkinWindowMinutes, notificationsEnabled } = state.settings;

  // Re-agenda (ou cancela) o check-in sempre que as configurações mudarem
  useEffect(() => {
    if (state.isLoading) return; // Aguarda o estado carregar do AsyncStorage

    if (checkinEnabled && notificationsEnabled) {
      scheduleCheckin(checkinTime, checkinWindowMinutes).catch((err) =>
        console.error('[CheckinInitializer] Failed to schedule checkin:', err)
      );
    } else {
      cancelCheckin().catch((err) =>
        console.error('[CheckinInitializer] Failed to cancel checkin:', err)
      );
    }
  }, [state.isLoading, checkinEnabled, checkinTime, checkinWindowMinutes, notificationsEnabled]);

  // Trata toques em notificações de check-in vindas da bandeja
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'checkin_prompt' || data?.type === 'checkin_timeout') {
        router.push('/checkin-response');
      }
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}
