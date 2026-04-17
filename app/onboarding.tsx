import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ONBOARDING_KEY = 'vigora_onboarding_completed';

interface OnboardingSlide {
  id: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    icon: 'favorite',
    iconColor: '#FFFFFF',
    iconBg: '#0066CC',
    title: 'Bem-vindo ao Vigora Saúde',
    description:
      'Seu assistente pessoal de saúde e segurança. Monitore sua saúde, configure alarmes de medicamentos e tenha acesso rápido a serviços de emergência.',
  },
  {
    id: '2',
    icon: 'warning',
    iconColor: '#FFFFFF',
    iconBg: '#DC2626',
    title: 'Botão SOS',
    description:
      'Em caso de emergência, pressione o botão SOS na tela inicial. Seus contatos de emergência serão notificados automaticamente via WhatsApp com sua localização.',
  },
  {
    id: '3',
    icon: 'alarm',
    iconColor: '#FFFFFF',
    iconBg: '#F59E0B',
    title: 'Alarmes Inteligentes',
    description:
      'Configure até 24 alarmes para medicamentos e consultas. Se você não responder, o app notifica automaticamente seus contatos de emergência.',
  },
  {
    id: '4',
    icon: 'people',
    iconColor: '#FFFFFF',
    iconBg: '#22C55E',
    title: 'Contatos de Emergência',
    description:
      'Cadastre contatos de emergência ou importe direto da agenda do celular. Eles serão notificados via WhatsApp em situações de emergência.',
  },
  {
    id: '5',
    icon: 'local-hospital',
    iconColor: '#FFFFFF',
    iconBg: '#8B5CF6',
    title: 'Ambulância e Saúde',
    description:
      'Chame ambulância com um toque (SAMU, Plano de Saúde, Bombeiros). Registre métricas de saúde e mantenha sua ficha médica sempre atualizada.',
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {}
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    router.replace('/(tabs)');
  };

  const handleNext = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={styles.slideContent}>
        {/* Icon Circle */}
        <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
          <MaterialIcons name={item.icon as any} size={56} color={item.iconColor} />
        </View>

        {/* Title */}
        <Text style={[styles.slideTitle, { color: colors.foreground }]}>{item.title}</Text>

        {/* Description */}
        <Text style={[styles.slideDescription, { color: colors.muted }]}>
          {item.description}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Skip Button */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={{ width: 60 }} />
        <Text style={[styles.pageIndicator, { color: colors.muted }]}>
          {currentIndex + 1} / {SLIDES.length}
        </Text>
        {currentIndex < SLIDES.length - 1 ? (
          <Pressable
            onPress={handleSkip}
            style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.skipText, { color: colors.primary }]}>Pular</Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
      />

      {/* Bottom Section */}
      <View style={[styles.bottomSection, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}>
        {/* Dots */}
        <View style={styles.dotsContainer}>
          {SLIDES.map((_, index) => {
            const inputRange = [
              (index - 1) * SCREEN_WIDTH,
              index * SCREEN_WIDTH,
              (index + 1) * SCREEN_WIDTH,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Next / Start Button */}
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.nextButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {currentIndex === SLIDES.length - 1 ? (
            <>
              <Text style={styles.nextButtonText}>Começar</Text>
              <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
            </>
          ) : (
            <>
              <Text style={styles.nextButtonText}>Próximo</Text>
              <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  pageIndicator: {
    fontSize: 14,
    fontWeight: '600',
  },
  skipButton: {
    width: 60,
    alignItems: 'flex-end',
    padding: 4,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
  },
  slideDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomSection: {
    paddingHorizontal: 24,
    gap: 24,
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
