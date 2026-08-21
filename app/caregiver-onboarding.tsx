/**
 * caregiver-onboarding.tsx
 *
 * One-time slideshow shown the first time a caregiver lands in the app after
 * completing registration. Sets `vigora_caregiver_onboarding_completed` on
 * exit so it never reappears.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import * as Auth from '@/lib/_core/auth';
import { markCaregiverOnboardingCompleted } from '@/lib/caregiver-onboarding-flag';

const { width } = Dimensions.get('window');

interface Slide {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'favorite',
    title: 'Bem-vindo, cuidador',
    description: 'Acompanhe a saúde de quem você ama, sem precisar estar do lado.',
  },
  {
    icon: 'link',
    title: 'Vincule a pessoa que você cuida',
    description: 'Por código de convite, email ou telefone, ou escaneando um QR code.',
  },
  {
    icon: 'notifications-active',
    title: 'Receba alertas em tempo real',
    description: 'Medicação perdida, SOS acionado e outros sinais importantes.',
  },
  {
    icon: 'check-circle',
    title: 'Pronto?',
    description: 'Vincule agora ou explore o app primeiro — você decide.',
  },
];

export default function CaregiverOnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const finish = async (destination: '/(caregiver-tabs)/link' | '/(caregiver-tabs)') => {
    const user = await Auth.getUserInfo();
    if (user?.openId) await markCaregiverOnboardingCompleted(user.openId);
    router.replace(destination);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    if (newIndex !== index) setIndex(newIndex);
  };

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    }
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name={slide.icon} size={72} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>{slide.title}</Text>
            <Text style={[styles.description, { color: colors.muted }]}>{slide.description}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.indicators}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === index ? colors.primary : colors.border,
                width: i === index ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        {isLast ? (
          <>
            <Pressable
              onPress={() => finish('/(caregiver-tabs)/link')}
              style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.primaryText}>Vincular agora</Text>
            </Pressable>
            <Pressable onPress={() => finish('/(caregiver-tabs)')} hitSlop={8}>
              <Text style={[styles.secondary, { color: colors.muted }]}>Explorar primeiro</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={goNext}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.primaryText}>Continuar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 18 },
  iconCircle: {
    width: 144, height: 144, borderRadius: 72,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 16, textAlign: 'center', lineHeight: 24, maxWidth: 320 },
  indicators: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: { height: 8, borderRadius: 4 },
  actions: { paddingHorizontal: 24, gap: 14, alignItems: 'center' },
  primary: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary: { fontSize: 16, fontWeight: '600', padding: 8 },
});
