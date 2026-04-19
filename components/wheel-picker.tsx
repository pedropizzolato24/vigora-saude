/**
 * WheelPicker — drum-roll style time selector
 *
 * Renders only the visible items (VISIBLE_ITEMS) plus a small buffer.
 * Uses a plain ScrollView (not FlatList) so it can be safely nested inside
 * another ScrollView without triggering the "VirtualizedLists nested" warning.
 *
 * The list wraps: scrolling past the last item loops back to the first,
 * achieved by keeping the scroll position in the middle of a 3× repeated
 * sequence and silently re-centering after each settle.
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
const VISIBLE_ITEMS = 5; // must be odd so the selected item is centred
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
// We render 3 full copies of the list so the user can always scroll in both
// directions without hitting an edge. After settling we silently re-centre.
const COPIES = 3;

interface WheelPickerProps {
  count: number;       // total values (24 for hours, 60 for minutes)
  value: number;       // currently selected value (0-based)
  onChange: (v: number) => void;
  label?: string;
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
  // The "centre copy" starts at this offset
  const centreStart = count * Math.floor(COPIES / 2);

  const scrollToIndex = useCallback(
    (index: number, animated = false) => {
      scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated });
    },
    [],
  );

  // Scroll to the correct position whenever `value` changes externally
  useEffect(() => {
    const targetIndex = centreStart + value;
    const timer = setTimeout(() => scrollToIndex(targetIndex, false), 50);
    return () => clearTimeout(timer);
  }, [value, centreStart, scrollToIndex]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.y;
      const rawIndex = Math.round(offset / ITEM_HEIGHT);
      const newValue = ((rawIndex % count) + count) % count;

      if (newValue !== value) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onChange(newValue);
      }

      // Re-centre silently so there is always room to scroll in both directions
      const centredIndex = centreStart + newValue;
      if (rawIndex !== centredIndex) {
        scrollRef.current?.scrollTo({ y: centredIndex * ITEM_HEIGHT, animated: false });
      }
    },
    [count, value, onChange, centreStart],
  );

  // ▲ button: advance value (scroll list upward visually = next number appears)
  // ▼ button: decrease value (scroll list downward visually = prev number appears)
  const increment = (delta: number) => {
    const next = ((value + delta) + count) % count;
    onChange(next);
    scrollToIndex(centreStart + next, true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // Build items for COPIES copies of the sequence
  const totalItems = count * COPIES;

  return (
    <View style={styles.container}>
      {/* ▲ — increases value */}
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
            {
              borderColor: colors.primary + '60',
              backgroundColor: colors.primary + '12',
            },
          ]}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={32}
          nestedScrollEnabled
          contentContainerStyle={styles.scrollContent}
        >
          {Array.from({ length: totalItems }, (_, i) => {
            const itemValue = ((i % count) + count) % count;
            const isSelected = itemValue === value;
            const displayText = padStart
              ? String(itemValue).padStart(2, '0')
              : String(itemValue);
            return (
              <View key={i} style={styles.item}>
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

      {/* ▼ — decreases value */}
      <Pressable
        onPress={() => increment(-1)}
        style={({ pressed }) => [
          styles.stepBtn,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons name="keyboard-arrow-down" size={26} color={colors.primary} />
      </Pressable>

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
