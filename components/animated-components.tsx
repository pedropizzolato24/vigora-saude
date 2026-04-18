import React, { useEffect, useRef } from 'react';
import { Animated, ViewProps, Easing } from 'react-native';

// ─── Fade In View ───────────────────────────────────────────────────────────
// Fades in children on mount with optional delay

interface FadeInViewProps extends ViewProps {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
}

export function FadeInView({ delay = 0, duration = 300, children, style, ...props }: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
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
  }, [opacity, translateY, delay, duration]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]} {...props}>
      {children}
    </Animated.View>
  );
}

// ─── Scale In View ──────────────────────────────────────────────────────────
// Scales in from 0.9 to 1.0 on mount

interface ScaleInViewProps extends ViewProps {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
}

export function ScaleInView({ delay = 0, duration = 250, children, style, ...props }: ScaleInViewProps) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
  }, [scale, opacity, delay, duration]);

  return (
    <Animated.View style={[{ opacity, transform: [{ scale }] }, style]} {...props}>
      {children}
    </Animated.View>
  );
}

// ─── Staggered List ─────────────────────────────────────────────────────────
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

// ─── Pulse Animation ────────────────────────────────────────────────────────
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
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      return;
    }

    // Use 3-step sequence: 1 → max → min → 1
    // Each step uses Easing.inOut(sin) for smooth acceleration/deceleration
    // Returns to 1 before loop restarts for seamless continuation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: maxScale,
          duration: duration / 3,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(scale, {
          toValue: minScale,
          duration: duration / 3,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: duration / 3,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    );

    pulse.start();

    return () => pulse.stop();
  }, [active, scale, minScale, maxScale, duration]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]} {...props}>
      {children}
    </Animated.View>
  );
}

// ─── Press Scale ────────────────────────────────────────────────────────────
// Wrapper that scales down on press for tactile feedback

interface PressScaleProps extends ViewProps {
  pressed: boolean;
  children: React.ReactNode;
}

export function PressScale({ pressed, children, style, ...props }: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: pressed ? 0.97 : 1,
      duration: 80,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [pressed, scale]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]} {...props}>
      {children}
    </Animated.View>
  );
}
