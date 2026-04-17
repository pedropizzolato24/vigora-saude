import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContactCard } from '@/components/contact-card';
import { useColors } from '@/hooks/use-colors';
import { generateId, useAppContext, type EmergencyContact } from '@/lib/app-context';

const EMPTY_FORM: Omit<EmergencyContact, 'id'> = {
  name: '',
  phone: '',
  relation: '',
  whatsapp: false,
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return digits;
}

export default function ContactsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [form, setForm] = useState<Omit<EmergencyContact, 'id'>>(EMPTY_FORM);

  const openAddModal = () => {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      phone: contact.phone,
      relation: contact.relation,
      whatsapp: contact.whatsapp,
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert('Campo obrigatório', 'Por favor, informe o nome do contato.');
      return;
    }
    if (!form.phone.trim()) {
      Alert.alert('Campo obrigatório', 'Por favor, informe o telefone do contato.');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    if (editingContact) {
      dispatch({ type: 'UPDATE_CONTACT', payload: { ...form, id: editingContact.id } });
    } else {
      dispatch({ type: 'ADD_CONTACT', payload: { ...form, id: generateId() } });
    }
    setModalVisible(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Excluir Contato', 'Tem certeza que deseja excluir este contato?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          dispatch({ type: 'DELETE_CONTACT', payload: id });
        },
      },
    ]);
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Contatos SOS</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {state.emergencyContacts.length} contato(s) de emergência
          </Text>
        </View>
        <Pressable
          onPress={openAddModal}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.emergency, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityLabel="Adicionar contato"
        >
          <MaterialIcons name="add" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Info Banner */}
      <View style={[styles.infoBanner, { backgroundColor: colors.emergencyLight, borderColor: colors.emergencyLight }]}>
        <MaterialIcons name="info" size={16} color={colors.emergency} />
        <Text style={[styles.infoText, { color: colors.foreground }]}>
          Estes contatos serão notificados quando você acionar o botão SOS.
        </Text>
      </View>

      {/* List */}
      {state.emergencyContacts.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="people" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Nenhum contato cadastrado
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Adicione contatos de emergência para que sejam notificados em caso de SOS.
          </Text>
          <Pressable
            onPress={openAddModal}
            style={({ pressed }) => [
              styles.emptyButton,
              { backgroundColor: colors.emergency, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Adicionar Contato</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={state.emergencyContacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ContactCard
              contact={item}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.modalCloseText, { color: colors.muted }]}>Cancelar</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingContact ? 'Editar Contato' : 'Novo Contato'}
            </Text>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.modalSave, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.modalSaveText, { color: colors.primary }]}>Salvar</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Nome completo *</Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="Ex: Maria Silva"
                placeholderTextColor={colors.muted}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border },
                ]}
                returnKeyType="next"
                maxLength={60}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Telefone *</Text>
              <TextInput
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: formatPhone(v) }))}
                placeholder="(11) 99999-9999"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border },
                ]}
                returnKeyType="next"
                maxLength={15}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Relação</Text>
              <TextInput
                value={form.relation}
                onChangeText={(v) => setForm((f) => ({ ...f, relation: v }))}
                placeholder="Ex: Mãe, Médico, Vizinho"
                placeholderTextColor={colors.muted}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border },
                ]}
                returnKeyType="done"
                maxLength={40}
              />
            </View>

            <View
              style={[
                styles.toggleRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.toggleLeft}>
                <MaterialIcons name="chat" size={20} color="#22C55E" />
                <View>
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>WhatsApp</Text>
                  <Text style={[styles.toggleSubLabel, { color: colors.muted }]}>
                    Notificar via WhatsApp
                  </Text>
                </View>
              </View>
              <Switch
                value={form.whatsapp}
                onValueChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))}
                trackColor={{ false: colors.border, true: colors.success }}
                thumbColor="#FFFFFF"
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 2 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  listContent: { padding: 16, paddingBottom: 32 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySubtext: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalClose: { padding: 4, minWidth: 70 },
  modalCloseText: { fontSize: 16 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalSave: { padding: 4, minWidth: 70, alignItems: 'flex-end' },
  modalSaveText: { fontSize: 16, fontWeight: '600' },
  modalContent: { padding: 20, gap: 20 },
  formGroup: { gap: 8 },
  formLabel: { fontSize: 15, fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 16, fontWeight: '500' },
  toggleSubLabel: { fontSize: 13, marginTop: 1 },
});
