/**
 * SOSActiveScreen
 *
 * Full-screen modal shown immediately after the SOS is activated.
 * Displays:
 *  - Emergency status header (pulsing red)
 *  - List of contacts notified with status icons
 *  - Step-by-step instructions (call SAMU, stay calm, etc.)
 *  - Elapsed time since SOS activation
 *  - "Desativar SOS" button
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmergencyContact } from '@/lib/app-context';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';

interface SOSActiveScreenProps {
  visible: boolean;
  contacts: EmergencyContact[];
  activatedAt: number | null; // Unix ms when SOS was activated
  onDeactivate: () => void;
}

const INSTRUCTIONS = [
  {
    icon: 'phone' as const,
    title: 'Ligue para o SAMU',
    description: 'Disque 192 para atendimento médico de emergência.',
    color: '#EF4444',
  },
  {
    icon: 'self-improvement' as const,
    title: 'Mantenha a calma',
    description: 'Respire fundo. Ajuda está a caminho.',
    color: '#F59E0B',
  },
  {
    icon: 'location-on' as const,
    title: 'Informe sua localização',
    description: 'Diga seu endereço completo ao atendente do SAMU.',
    color: '#3B82F6',
  },
  {
    icon: 'people' as const,
    title: 'Aguarde os contatos',
    description: 'Seus contatos de emergência foram notificados.',
    color: '#10B981',
  },
];

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export function SOSActiveScreen({
  visible,
  contacts,
  activatedAt,
  onDeactivate,
}: SOSActiveScreenProps) {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();

  // Elapsed time counter
  const [elapsed, setElapsed] = useState(0);

  // Pulsing animation for the SOS header
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Contact notification status (simulated: sent after 1-3s)
  const [contactStatus, setContactStatus] = useState<Record<string, 'sending' | 'sent' | 'failed'>>({});

  useEffect(() => {
    if (!visible) {
      fadeAnim.setValue(0);
      setElapsed(0);
      setContactStatus({});
      return;
    }

    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Pulse loop
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();

    // Haptic on open
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    // Elapsed timer
    const timer = setInterval(() => {
      if (activatedAt) {
        setElapsed(Date.now() - activatedAt);
      }
    }, 1000);

    // Simulate contact notification status
    const initialStatus: Record<string, 'sending' | 'sent' | 'failed'> = {};
    contacts.forEach((c) => { initialStatus[c.id] = 'sending'; });
    setContactStatus(initialStatus);

    const statusTimers = contacts.map((c, i) =>
      setTimeout(() => {
        setContactStatus((prev) => ({ ...prev, [c.id]: 'sent' }));
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }, 1200 + i * 600)
    );

    return () => {
      pulse.stop();
      clearInterval(timer);
      statusTimers.forEach(clearTimeout);
    };
  }, [visible, activatedAt, contacts]);

  const handleDeactivate = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onDeactivate();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* -- Header -- */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Animated.View style={[styles.sosIconWrap, { backgroundColor: colors.error, shadowColor: colors.error, transform: [{ scale: pulseAnim }] }]}>
            <MaterialIcons name="warning" size={40} color="#fff" />
          </Animated.View>
          <Text style={styles.headerTitle}>SOS ATIVADO</Text>
          {activatedAt && (
            <Text style={styles.headerElapsed}>
              Ativo há {formatElapsed(elapsed)}
            </Text>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* -- Contacts notified -- */}
          {contacts.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: fs.scaled(14) }]}>
                Contatos notificados
              </Text>
              {contacts.map((contact) => {
                const status = contactStatus[contact.id] ?? 'sending';
                return (
                  <View key={contact.id} style={styles.contactRow}>
                    <View style={styles.contactInfo}>
                      <MaterialIcons name="person" size={18} color={colors.muted} />
                      <View style={styles.contactText}>
                        <Text style={[styles.contactName, { color: colors.foreground, fontSize: fs.scaled(14) }]}>
                          {contact.name}
                        </Text>
                        <Text style={[styles.contactRelation, { color: colors.muted, fontSize: fs.scaled(12) }]}>
                          {contact.relation} · {contact.phone}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.statusBadge}>
                      {status === 'sending' && (
                        <MaterialIcons name="schedule" size={20} color={colors.warning} />
                      )}
                      {status === 'sent' && (
                        <MaterialIcons name="check-circle" size={20} color={colors.success} />
                      )}
                      {status === 'failed' && (
                        <MaterialIcons name="error" size={20} color={colors.error} />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {contacts.length === 0 && (
            <View style={[styles.card, styles.noContactsCard, { backgroundColor: '#7F1D1D', borderColor: '#991B1B' }]}>
              <MaterialIcons name="person-add" size={24} color="#FCA5A5" />
              <Text style={[styles.noContactsText, { fontSize: fs.scaled(13) }]}>
                Nenhum contato de emergência cadastrado. Adicione contatos na aba Contatos para que sejam notificados automaticamente.
              </Text>
            </View>
          )}

          {/* -- Instructions -- */}
          <Text style={[styles.sectionTitle, { color: '#FCA5A5', fontSize: fs.scaled(13) }]}>
            O QUE FAZER AGORA
          </Text>

          {INSTRUCTIONS.map((item, index) => (
            <View key={index} style={[styles.instructionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.instructionIcon, { backgroundColor: item.color + '22' }]}>
                <MaterialIcons name={item.icon} size={24} color={item.color} />
              </View>
              <View style={styles.instructionText}>
                <Text style={[styles.instructionTitle, { color: colors.foreground, fontSize: fs.scaled(14) }]}>
                  {item.title}
                </Text>
                <Text style={[styles.instructionDesc, { color: colors.muted, fontSize: fs.scaled(12) }]}>
                  {item.description}
                </Text>
              </View>
            </View>
          ))}

          {/* -- Emergency numbers -- */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: fs.scaled(14) }]}>
              Números de emergência
            </Text>
            {[
              { name: 'SAMU', number: '192', icon: 'local-hospital' as const },
              { name: 'Bombeiros', number: '193', icon: 'local-fire-department' as const },
              { name: 'Polícia', number: '190', icon: 'local-police' as const },
            ].map((item) => (
              <View key={item.number} style={styles.emergencyNumberRow}>
                <MaterialIcons name={item.icon} size={20} color={colors.error} />
                <Text style={[styles.emergencyNumberName, { color: colors.foreground, fontSize: fs.scaled(14) }]}>
                  {item.name}
                </Text>
                <Text style={[styles.emergencyNumber, { color: colors.error, fontSize: fs.scaled(20) }]}>
                  {item.number}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* -- Deactivate button -- */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: '#1A0000' }]}>
          <Pressable
            onPress={handleDeactivate}
            style={({ pressed }) => [
              styles.deactivateButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
          >
            <MaterialIcons name="cancel" size={22} color="#fff" />
            <Text style={[styles.deactivateText, { fontSize: fs.scaled(16) }]}>
              Desativar SOS
            </Text>
          </Pressable>
          <Text style={[styles.footerHint, { fontSize: fs.scaled(11) }]}>
            Toque apenas se a emergência foi resolvida
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0000',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
    backgroundColor: '#7F1D1D',
    borderBottomWidth: 1,
    borderBottomColor: '#991B1B',
  },
  sosIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 3,
  },
  headerElapsed: {
    marginTop: 6,
    fontSize: 16,
    color: '#FCA5A5',
    fontWeight: '500',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  noContactsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noContactsText: {
    flex: 1,
    color: '#FCA5A5',
    lineHeight: 18,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  contactText: {
    flex: 1,
  },
  contactName: {
    fontWeight: '600',
  },
  contactRelation: {
    marginTop: 1,
  },
  statusBadge: {
    marginLeft: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 4,
    marginBottom: -4,
  },
  instructionCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  instructionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionText: {
    flex: 1,
  },
  instructionTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  instructionDesc: {
    lineHeight: 17,
  },
  emergencyNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  emergencyNumberName: {
    flex: 1,
    fontWeight: '500',
  },
  emergencyNumber: {
    fontWeight: '800',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#991B1B',
    alignItems: 'center',
    gap: 8,
  },
  deactivateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#374151',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
  },
  deactivateText: {
    color: '#fff',
    fontWeight: '700',
  },
  footerHint: {
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
