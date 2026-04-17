import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import type { EmergencyContact } from '@/lib/app-context';

interface ContactCardProps {
  contact: EmergencyContact;
  onEdit: (contact: EmergencyContact) => void;
  onDelete: (id: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function ContactCard({ contact, onEdit, onDelete }: ContactCardProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
        <Text style={styles.avatarText}>{getInitials(contact.name)}</Text>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <View style={styles.phoneRow}>
          <MaterialIcons name="phone" size={14} color={colors.muted} />
          <Text style={[styles.phone, { color: colors.muted }]}>{contact.phone}</Text>
        </View>
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.tagText, { color: colors.primary }]}>{contact.relation}</Text>
          </View>
          {contact.whatsapp && (
            <View style={[styles.tag, { backgroundColor: colors.successLight }]}>
              <MaterialIcons name="chat" size={12} color="#22C55E" />
              <Text style={[styles.tagText, { color: colors.success }]}>WhatsApp</Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => onEdit(contact)}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Editar contato"
        >
          <MaterialIcons name="edit" size={20} color={colors.muted} />
        </Pressable>
        <Pressable
          onPress={() => onDelete(contact.id)}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Excluir contato"
        >
          <MaterialIcons name="delete" size={20} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0066CC',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phone: {
    fontSize: 14,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  actions: {
    gap: 4,
  },
  actionBtn: {
    padding: 6,
  },
});
