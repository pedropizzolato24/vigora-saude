import React, { useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '@/components/animated-components';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type StyleFn = (state: { pressed: boolean }) => StyleProp<ViewStyle>;

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Mesma assinatura do Pressable: estilo direto ou função de ({ pressed }). */
  style?: StyleProp<ViewStyle> | StyleFn;
  /** Escala no toque. Menor = afunda mais. */
  scaleTo?: number;
  children?: React.ReactNode;
}

/**
 * Pressable que afunda com uma transição curta em vez de saltar de uma vez.
 *
 * O app já encolhia alguns botões no toque (SOS, tiles da tela inicial), mas
 * instantaneamente — o toque parecia um corte, não uma reação. Aqui a escala é
 * interpolada em ~120ms na descida e ~160ms na volta (subida um pouco mais
 * lenta: é o que dá a sensação de "soltou").
 *
 * Respeita "reduzir movimento" do sistema: nesse caso a escala não anima e o
 * feedback fica por conta do estilo de `pressed` do próprio chamador.
 */
export function PressableScale({
  style,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const animateTo = (value: number, duration: number) => {
    if (reduceMotion) return;
    Animated.timing(scale, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressIn = (e: GestureResponderEvent) => {
    setPressed(true);
    animateTo(scaleTo, 120);
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    setPressed(false);
    animateTo(1, 160);
    onPressOut?.(e);
  };

  // O estilo é resolvido aqui (e não passado como função) para o Animated
  // enxergar o transform e conseguir animá-lo pela thread nativa.
  const resolved = typeof style === 'function' ? style({ pressed }) : style;

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolved, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
