import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, ViewProps, Easing, AccessibilityInfo, StyleProp, ViewStyle } from 'react-native';

/**
 * Respects the OS reduce-motion preference (iOS "Reduce Motion" / Android "Remove animations").
 * When true, all enter/exit animations skip to their final state instantly.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

// --- Fade In View -----------------------------------------------------------
// Fades in children on mount with optional delay

interface FadeInViewProps extends ViewProps {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
}

export function FadeInView({ delay = 0, duration = 300, children, style, ...props }: FadeInViewProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 12)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, [opacity, translateY, delay, duration, reduceMotion]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]} {...props}>
      {children}
    </Animated.View>
  );
}

// --- Scale In View ----------------------------------------------------------
// Scales in from 0.9 to 1.0 on mount

interface ScaleInViewProps extends ViewProps {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
}

export function ScaleInView({ delay = 0, duration = 250, children, style, ...props }: ScaleInViewProps) {
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.92)).current;
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      opacity.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: duration * 0.7,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, [scale, opacity, delay, duration, reduceMotion]);

  return (
    <Animated.View style={[{ opacity, transform: [{ scale }] }, style]} {...props}>
      {children}
    </Animated.View>
  );
}

// --- Staggered List ---------------------------------------------------------
// Renders children with staggered fade-in animation

interface StaggeredItemProps extends ViewProps {
  index: number;
  staggerDelay?: number;
  children: React.ReactNode;
}

export function StaggeredItem({ index, staggerDelay = 60, children, style, ...props }: StaggeredItemProps) {
  return (
    <FadeInView delay={index * staggerDelay} duration={300} style={style} {...props}>
      {children}
    </FadeInView>
  );
}

// --- Pulse Animation --------------------------------------------------------
// Continuous pulse effect for SOS button

interface PulseViewProps extends ViewProps {
  active?: boolean;
  minScale?: number;
  maxScale?: number;
  duration?: number;
  children: React.ReactNode;
}

export function PulseView({
  active = true,
  minScale = 0.97,
  maxScale = 1.03,
  duration = 1200,
  children,
  style,
  ...props
}: PulseViewProps) {
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(minScale)).current;

  useEffect(() => {
    if (!active || reduceMotion) {
      scale.setValue(1);
      return;
    }

    // Set starting point to minScale before looping
    scale.setValue(minScale);

    // 2-step sequence: min -> max -> min
    // Easing.inOut(sin) gives smooth ease-in/out at both ends
    // Since the sequence starts and ends at minScale, the loop is perfectly seamless
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: maxScale,
          duration: duration / 2,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(scale, {
          toValue: minScale,
          duration: duration / 2,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    );

    pulse.start();

    return () => pulse.stop();
  }, [active, scale, minScale, maxScale, duration, reduceMotion]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]} {...props}>
      {children}
    </Animated.View>
  );
}

// --- Ripple Halo ------------------------------------------------------------
// Onda circular que nasce atrás do conteúdo, cresce para fora e some. O
// conteúdo (ex.: o ícone do despertador) fica PARADO — pulsar o ícone inteiro
// junto passava tensão/urgência na tela de alarme (feedback do teste).

interface RippleHaloProps {
  /** Diâmetro da onda em repouso — normalmente o mesmo do círculo de baixo. */
  size: number;
  color: string;
  active?: boolean;
  /** Até onde a onda cresce antes de sumir. */
  maxScale?: number;
  /** Opacidade máxima da onda. Baixa de propósito: o efeito é discreto. */
  maxOpacity?: number;
  duration?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function RippleHalo({
  size,
  color,
  active = true,
  maxScale = 1.45,
  maxOpacity = 0.28,
  duration = 2400,
  children,
  style,
}: RippleHaloProps) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const animating = active && !reduceMotion;

  useEffect(() => {
    if (!animating) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      })
    );
    loop.start();
    return () => loop.stop();
  }, [animating, duration, progress]);

  // Sobe do zero no começo e volta a zero no fim: o loop reinicia invisível,
  // então não há "pulo" quando a onda recomeça.
  const opacity = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, maxOpacity, 0],
  });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, maxScale] });

  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      {animating ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity,
            transform: [{ scale }],
          }}
        />
      ) : null}
      {children}
    </View>
  );
}

// --- Collapsible ------------------------------------------------------------
// Abre/fecha o conteúdo deslizando a altura em vez de aparecer seco. A altura
// real é medida por um filho absoluto (não influencia a altura do container),
// então a animação sempre vai de 0 até o tamanho certo do conteúdo.

/** Duração do slide. Exportada para o conteúdo entrar logo APÓS a abertura. */
export const COLLAPSE_DURATION = 260;

interface CollapsibleProps {
  open: boolean;
  duration?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Collapsible({ open, duration = COLLAPSE_DURATION, children, style }: CollapsibleProps) {
  const reduceMotion = useReducedMotion();
  // Continua montado durante o fechamento para a altura poder animar até 0.
  const [visible, setVisible] = useState(open);
  const [contentHeight, setContentHeight] = useState(0);
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) setVisible(true);
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      anim.setValue(open ? 1 : 0);
      if (!open) setVisible(false);
      return;
    }
    // Sem a altura medida ainda não dá para animar — o onLayout dispara este
    // efeito de novo assim que ela chega.
    if (open && contentHeight === 0) return;
    const animation = Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !open) setVisible(false);
    });
    return () => animation.stop();
  }, [open, visible, contentHeight, duration, reduceMotion, anim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        {
          overflow: 'hidden',
          height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] }),
        },
        style,
      ]}
    >
      <View
        style={{ position: 'absolute', left: 0, right: 0 }}
        onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  );
}
