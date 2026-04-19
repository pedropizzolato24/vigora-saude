/**
 * WheelPicker — drum-roll style time selector
 *
 * Uses a plain ScrollView (not FlatList) so it can be safely nested inside
 * another ScrollView without triggering the "VirtualizedLists nested" warning.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';

const ITEM_HEIGHT = 56;
const VISIBLE_ITEMS = 5; // odd number so selected is centred
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
// Repeat the sequence many times so the user can scroll freely in both directions
const LOOP_COUNT = 200;

interface WheelPickerProps {
  /** Total number of values (e.g. 24 for hours, 60 for minutes) */
  count: number;
  /** Currently selected value (0-based) */
  value: number;
  /** Called when the user settles on a new value */
  onChange: (value: number) => void;
  /** Label shown below the wheel (e.g. "hora", "min") */
  label?: string;
  /** Pad values with a leading zero */
  padStart?: boolean;
}

export function WheelPicker({
  count,
  value,
  onChange,
  label,
  padStart = true,
}: WheelPickerProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const totalItems = count * LOOP_COUNT;
  // Start in the middle of the loop
  const midOffset = Math.floor(LOOP_COUNT / 2) * count;

  const scrollToValue = useCallback(
    (val: number, animated = false) => {
      const targetIndex = midOffset + val;
      scrollRef.current?.scrollTo({
        y: targetIndex * ITEM_HEIGHT,
        animated,
      });
    },
    [midOffset],
  );

  // Scroll to the correct position whenever `value` changes externally
  useEffect(() => {
    const timer = setTimeout(() => scrollToValue(value, false), 50);
    return () => clearTimeout(timer);
  }, [value, scrollToValue]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.y;
      const index = Math.round(offset / ITEM_HEIGHT);
      const newValue = ((index % count) + count) % count;

      if (newValue !== value) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onChange(newValue);
      }

      // Re-centre in the middle section to prevent reaching the ends
      const normalizedIndex = midOffset + newValue;
      const normalizedOffset = normalizedIndex * ITEM_HEIGHT;
      if (Math.abs(offset - normalizedOffset) > ITEM_HEIGHT * count) {
        scrollRef.current?.scrollTo({ y: normalizedOffset, animated: false });
      }
    },
    [count, value, onChange, midOffset],
  );

  const increment = (delta: number) => {
    const next = ((value + delta) + count) % count;
    onChange(next);
    scrollToValue(next, true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // Build the full item list once
  const items = Array.from({ length: totalItems }, (_, i) => {
    const itemValue = ((i % count) + count) % count;
    return { index: i, itemValue };
  });

  return (
    <View style={styles.container}>
      {/* Up button */}
      <Pressable
        onPress={() => increment(1)}
        style={({ pressed }) => [
          styles.stepBtn,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons name="keyboard-arrow-up" size={26} color={colors.primary} />
      </Pressable>

      {/* Wheel */}
      <View style={[styles.wheelWrapper, { borderColor: colors.primary }]}>
        {/* Selection highlight */}
        <View
          pointerEvents="none"
          style={[
            styles.selectionOverlay,
            { borderColor: colors.primary + '60', backgroundColor: colors.primary + '12' },
          ]}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={16}
          nestedScrollEnabled
          contentContainerStyle={styles.scrollContent}
        >
          {items.map(({ index, itemValue }) => {
            const isSelected = itemValue === value;
            const displayText = padStart
              ? String(itemValue).padStart(2, '0')
              : String(itemValue);
            return (
              <View key={index} style={styles.item}>
                <Text
                  style={[
                    styles.itemText,
                    { color: isSelected ? colors.primary : colors.muted },
                    isSelected && styles.itemTextSelected,
                  ]}
                >
                  {displayText}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Down button */}
      <Pressable
        onPress={() => increment(-1)}
        style={({ pressed }) => [
          styles.stepBtn,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons name="keyboard-arrow-down" size={26} color={colors.primary} />
      </Pressable>

      {/* Label */}
      {label && (
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 90,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelWrapper: {
    width: 90,
    height: WHEEL_HEIGHT,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  selectionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    height: ITEM_HEIGHT,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    zIndex: 1,
  },
  scrollContent: {
    // Padding so first/last items can be centred in the visible area
    paddingVertical: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 28,
    fontWeight: '500',
  },
  itemTextSelected: {
    fontSize: 36,
    fontWeight: '800',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
