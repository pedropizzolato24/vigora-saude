import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';

export interface AdBannerProps {
  title: string;
  description: string;
  imageUrl?: string;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress?: () => void;
  onClose?: () => void;
  backgroundColor?: string;
}

/**
 * Ad Banner Component for monetization
 * Displays promotional content with optional image, icon, and CTA button
 */
export function AdBanner({
  title,
  description,
  imageUrl,
  icon = 'local-offer',
  onPress,
  onClose,
  backgroundColor,
}: AdBannerProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: backgroundColor || colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Close button */}
      {onClose && (
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <MaterialIcons name="close" size={20} color={colors.muted} />
        </Pressable>
      )}

      {/* Content container */}
      <View style={styles.content}>
        {/* Image or Icon */}
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} />
        ) : (
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: colors.primary },
            ]}
          >
            <MaterialIcons name={icon} size={32} color={colors.onPrimary} />
          </View>
        )}

        {/* Text content */}
        <View style={styles.textContainer}>
          <Text
            style={[styles.title, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text
            style={[styles.description, { color: colors.muted }]}
            numberOfLines={2}
          >
            {description}
          </Text>
        </View>

        {/* CTA Button */}
        {onPress && (
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [
              styles.ctaButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
    zIndex: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 32,
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
  },
  ctaButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
