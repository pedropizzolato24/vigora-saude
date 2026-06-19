import React, { useEffect, useRef, useState } from 'react';
import { Animated, ViewProps, Easing, AccessibilityInfo } from 'react-native';

/**
 * Respects the OS reduce-motion preference (iOS "Reduce Motion" / Android "Remove animations").
 * When true, all enter/exit animations skip to their final state instantly.
 */
function useReducedMotion(): boolean {
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
