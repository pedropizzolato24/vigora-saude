/**
 * CheckinInitializer
 *
 * Componente sem UI que roda no startup e:
 * 1. Garante que o check-in está agendado corretamente se `checkinEnabled` for true.
 * 2. Exibe popup in-app (Modal) quando o check-in chega com o app em foreground.
 * 3. Navega para /checkin-response quando o usuário toca a notificação da bandeja.
 * 4. Escalona para contatos de emergência quando o check-in expira (checkin_timeout).
 *
 * O popup tem dois estados:
 * - 'asking': card verde pastel com "Você está bem?" — tap em qualquer lugar confirma
 * - 'confirmed': card com ✅ "Ótimo!" — some automaticamente após 2 segundos
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/lib/app-context';
import { scheduleCheckin, cancelCheckin, createNextCheckinEvent } from '@/lib/checkin-service';
import { handleCheckinTimeout, handleCheckinPromptResponse } from '@/lib/checkin-notification-handler';

type PopupState = 'asking' | 'confirmed';

export function CheckinInitializer() {
  const { state } = useAppContext();
  const router = useRouter();
  const { checkinEnabled, checkinTime, checkinWindowMinutes, notificationsEnabled } = state.settings;

  // Popup state
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupState, setPopupState] = useState<PopupState>('asking');
  const [popupCheckinTime, setPopupCheckinTime] = useState('');
  const [popupWindowMinutes, setPopupWindowMinutes] = useState(30);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, []);

  // Re-agenda (ou cancela) o check-in sempre que as configurações mudarem.
  // Debounce de 400ms para evitar múltiplos scheduleCheckin() por renders rápidos no startup.
  useEffect(() => {
    if (state.isLoading) return;

    const timer = setTimeout(() => {
      if (checkinEnabled && notificationsEnabled) {
        scheduleCheckin(checkinTime, checkinWindowMinutes).catch((err) =>
          console.error('[CheckinInitializer] Failed to schedule checkin:', err)
        );
        createNextCheckinEvent(checkinTime, checkinWindowMinutes).catch(() => {});
      } else {
        cancelCheckin().catch((err) =>
          console.error('[CheckinInitializer] Failed to cancel checkin:', err)
        );
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [state.isLoading, checkinEnabled, checkinTime, checkinWindowMinutes, notificationsEnabled]);

  // Tap no popup (overlay ou card) confirma o check-in.
  // identifier undefined: popup in-app não tem handler concorrente para deduplicar.
  const handleConfirm = useCallback(async () => {
    if (popupState !== 'asking') return;
    await handleCheckinPromptResponse(popupCheckinTime, popupWindowMinutes, undefined).catch(() => {});
    setPopupState('confirmed');
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    autoCloseRef.current = setTimeout(() => {
      setPopupVisible(false);
      setPopupState('asking');
    }, 2000);
  }, [popupState, popupCheckinTime, popupWindowMinutes]);

  // Listener foreground: app aberto quando a notificação chega
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;

      if (data?.type === 'checkin_prompt') {
        setPopupCheckinTime((data.checkinTime as string | undefined) ?? checkinTime);
        setPopupWindowMinutes((data.windowMinutes as number | undefined) ?? checkinWindowMinutes);
        setPopupState('asking');
        setPopupVisible(true);
      } else if (data?.type === 'checkin_timeout') {
        const ct = (data.checkinTime as string | undefined) ?? checkinTime;
        const wm = (data.windowMinutes as number | undefined) ?? checkinWindowMinutes;
        const identifier = notification.request.identifier;
        handleCheckinTimeout(ct, wm, state.emergencyContacts, identifier).then((handled) => {
          if (handled) router.push('/checkin-response');
        });
      }
    });

    return () => subscription.remove();
  }, [router, checkinTime, checkinWindowMinutes, state.emergencyContacts]);

  // Listener de tap: usuário tocou na notificação da bandeja
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;

      if (data?.type === 'checkin_prompt') {
        const ct = (data.checkinTime as string | undefined) ?? checkinTime;
        const wm = (data.windowMinutes as number | undefined) ?? checkinWindowMinutes;
        const identifier = response.notification.request.identifier;
        handleCheckinPromptResponse(ct, wm, identifier).then((handled) => {
          if (handled) router.push('/checkin-response');
        });
      } else if (data?.type === 'checkin_timeout') {
        const ct = (data.checkinTime as string | undefined) ?? checkinTime;
        const wm = (data.windowMinutes as number | undefined) ?? checkinWindowMinutes;
        const identifier = response.notification.request.identifier;
        handleCheckinTimeout(ct, wm, state.emergencyContacts, identifier).then((handled) => {
          if (handled) router.push('/checkin-response');
        });
      }
    });

    return () => subscription.remove();
  }, [router, checkinTime, checkinWindowMinutes, state.emergencyContacts]);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={popupVisible}
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={handleConfirm}>
        <View style={[
          styles.card,
          popupState === 'confirmed' ? styles.cardConfirmed : styles.cardAsking,
        ]}>
          {popupState === 'asking' ? <AskingContent /> : <ConfirmedContent />}
        </View>
      </Pressable>
    </Modal>
  );
}

function AskingContent() {
  return (
    <>
      <Text style={styles.cardEmoji}>🌿</Text>
      <Text style={styles.cardTitle}>Você está bem?</Text>
      <Text style={styles.cardBody}>
        Olá! Só passando para saber{'\n'}se está tudo bem com você 💚
      </Text>
      <View style={styles.tapHint}>
        <Text style={styles.tapHintText}>Toque em qualquer lugar para confirmar</Text>
      </View>
      <Text style={styles.cardHint}>Responda em até 30 minutos</Text>
    </>
  );
}

function ConfirmedContent() {
  return (
    <>
      <View style={styles.checkCircle}>
        <Text style={styles.checkEmoji}>✅</Text>
      </View>
      <Text style={styles.confirmedTitle}>Ótimo! Que bom que{'\n'}você está bem.</Text>
      <Text style={styles.confirmedBody}>Recebemos seu check-in 🌿</Text>
      <Text style={styles.cardHint}>Fechando automaticamente...</Text>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '82%',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    gap: 10,
  },
  cardAsking: {
    backgroundColor: '#F1F8E9',
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
  },
  cardConfirmed: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#66BB6A',
  },
  cardEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#1B5E20',
    textAlign: 'center',
    lineHeight: 27,
  },
  cardBody: {
    fontSize: 16,
    color: '#388E3C',
    textAlign: 'center',
    lineHeight: 22,
  },
  tapHint: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1.5,
    borderColor: '#A5D6A7',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
  },
  tapHintText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    textAlign: 'center',
  },
  cardHint: {
    fontSize: 15,
    color: '#81C784',
    textAlign: 'center',
    marginTop: 4,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkEmoji: {
    fontSize: 36,
  },
  confirmedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1B5E20',
    textAlign: 'center',
    lineHeight: 30,
  },
  confirmedBody: {
    fontSize: 16,
    color: '#388E3C',
    textAlign: 'center',
  },
});
