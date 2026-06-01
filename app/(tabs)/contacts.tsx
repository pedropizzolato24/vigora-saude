import * as Haptics from 'expo-haptics';
import * as Contacts from 'expo-contacts';
import React, { useState } from 'react';
import { useAccessibility } from '@/lib/accessibility-context';
import {
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
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContactCard } from '@/components/contact-card';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { generateId, useAppContext, type EmergencyContact } from '@/lib/app-context';
import { useProFeature, FREE_LIMITS, ProLimitBadge } from '@/components/pro-gate';
import { useProUpsell } from '@/components/pro-upsell-modal';

const EMPTY_FORM: Omit<EmergencyContact, 'id'> = {
  name: '',
  phone: '',
  relation: '',
  whatsapp: false,
  email: '',
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
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [form, setForm] = useState<Omit<EmergencyContact, 'id'>>(EMPTY_FORM);
  const [deviceContacts, setDeviceContacts] = useState<Contacts.Contact[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const { checkLimit } = useProFeature();
  const { showUpsell, UpsellModal } = useProUpsell();

  const openAddModal = () => {
    if (state.emergencyContacts.length >= FREE_LIMITS.CONTACTS) {
      showUpsell({
        icon: 'people',
        title: 'Contatos Ilimitados',
        description: `Você atingiu o limite de ${FREE_LIMITS.CONTACTS} contatos no plano gratuito.`,
        benefit: 'Com o Vigora Pro, adicione quantos contatos de emergência precisar - sem restrições.',
        features: [
          'Contatos de emergência ilimitados',
          'Importação ilimitada da agenda',
          'Alarmes ilimitados',
          'Exportação PDF da Anamnese',
        ],
      });
      return;
    }
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const handleImportFromDevice = async () => {
    if (Platform.OS === 'web') {
      showDialog({ title: 'Indisponível', message: 'Importação de contatos não está disponível na web.', variant: 'info', buttons: [{ text: 'OK' }] });
      return;
    }
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        showDialog({ title: 'Permissão negada', message: 'Permita o acesso aos contatos nas configurações do dispositivo.', variant: 'warning', buttons: [{ text: 'OK' }] });
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      const withPhone = data.filter(
        (c) => c.phoneNumbers && c.phoneNumbers.length > 0 && c.name
      );
      setDeviceContacts(withPhone);
      setSearchQuery('');
      setImportModalVisible(true);
    } catch (err) {
      showDialog({ title: 'Erro', message: 'Não foi possível acessar os contatos do dispositivo.', variant: 'error', buttons: [{ text: 'OK' }] });
    }
  };

  const handleSelectDeviceContact = (contact: Contacts.Contact) => {
    const phone = contact.phoneNumbers?.[0]?.number ?? '';
    const cleanPhone = phone.replace(/\D/g, '').slice(-11);
    const formatted = formatPhone(cleanPhone);

    // Check if already exists
    const exists = state.emergencyContacts.some(
      (c) => c.phone.replace(/\D/g, '') === cleanPhone
    );
    if (exists) {
      showDialog({ title: 'Contato já existe', message: `${contact.name} já está na sua lista de contatos de emergência.`, variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    dispatch({
      type: 'ADD_CONTACT',
      payload: {
        id: generateId(),
        name: contact.name ?? 'Sem nome',
        phone: formatted,
        relation: '',
        whatsapp: true,
      },
    });
    setImportModalVisible(false);
    showToast({ message: `${contact.name} adicionado como contato de emergência.`, variant: 'success' });
  };

  const filteredDeviceContacts = deviceContacts.filter((c) =>
    (c.name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openEditModal = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      phone: contact.phone,
      relation: contact.relation,
      whatsapp: contact.whatsapp,
      email: contact.email ?? '',
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      showDialog({ title: 'Campo obrigatório', message: 'Por favor, informe o nome do contato.', variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }
    if (!form.phone.trim()) {
      showDialog({ title: 'Campo obrigatório', message: 'Por favor, informe o telefone do contato.', variant: 'warning', buttons: [{ text: 'OK' }] });
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
    showDialog({
      title: 'Excluir Contato',
      message: 'Tem certeza que deseja excluir este contato?',
      variant: 'confirm',
      buttons: [
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
      ],
    });
  };

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <ScreenContainer edges={['left', 'right']} containerClassName="bg-white">
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: ac.background }}>
          <View>
            <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Contatos SOS</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>{state.emergencyContacts.length} contato(s)</Text>
          </View>
          <Pressable
            onPress={openAddModal}
            style={({ pressed }) => [{ backgroundColor: ac.emergency, width: as_.touchTarget, height: as_.touchTarget, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: ac.emergency, opacity: pressed ? 0.8 : 1 }]}
            accessibilityLabel="Adicionar contato"
          >
            <MaterialIcons name="add" size={36} color={ac.onEmergency} />
          </Pressable>
        </View>

        <View style={{ margin: 12, padding: 16, backgroundColor: ac.warning + '20', borderRadius: 16, borderWidth: 2, borderColor: ac.warning, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <MaterialIcons name="info" size={28} color={ac.warning} />
          <Text style={{ flex: 1, fontSize: af.sm, color: ac.warning, fontWeight: '600', lineHeight: af.sm * 1.5 }}>
            Estes contatos serão avisados quando você apertar o botão SOS.
          </Text>
        </View>

        {state.emergencyContacts.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
            <MaterialIcons name="people" size={80} color={ac.muted} />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.foreground, textAlign: 'center' }}>Nenhum contato</Text>
            <Text style={{ fontSize: af.md, color: ac.muted, textAlign: 'center', lineHeight: af.md * 1.5 }}>Adicione contatos para serem avisados em uma emergência.</Text>
            <Pressable
              onPress={openAddModal}
              style={({ pressed }) => [{ backgroundColor: ac.emergency, borderRadius: 20, paddingVertical: as_.buttonPadding, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 3, borderColor: ac.emergency, opacity: pressed ? 0.85 : 1 }]}
            >
              <MaterialIcons name="add" size={32} color={ac.onEmergency} />
              <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.onEmergency }}>Adicionar Contato</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={state.emergencyContacts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={{ margin: 12, marginBottom: 0, backgroundColor: ac.surface, borderRadius: as_.cardRadius, borderWidth: 2, borderColor: ac.border, padding: 20, gap: 8 }}>
                <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>{item.name}</Text>
                <Text style={{ fontSize: af.md, color: ac.primary, fontWeight: '700' }}>{item.phone}</Text>
                {item.relation ? <Text style={{ fontSize: af.sm, color: ac.muted }}>{item.relation}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <Pressable
                    onPress={() => openEditModal(item)}
                    style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: ac.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: pressed ? ac.primary + '20' : ac.background }]}
                  >
                    <MaterialIcons name="edit" size={24} color={ac.primary} />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.primary }}>Editar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(item.id)}
                    style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: ac.emergency, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: pressed ? ac.error + '20' : ac.background }]}
                  >
                    <MaterialIcons name="delete" size={24} color={ac.emergency} />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.emergency }}>Excluir</Text>
                  </Pressable>
                </View>
              </View>
            )}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Simplified add/edit modal */}
        <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: ac.background }}>
            <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Pressable onPress={() => setModalVisible(false)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                <Text style={{ fontSize: af.md, color: ac.muted, fontWeight: '600' }}>Cancelar</Text>
              </Pressable>
              <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>{editingContact ? 'Editar Contato' : 'Novo Contato'}</Text>
              <Pressable onPress={handleSave} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ fontSize: af.md, color: ac.primary, fontWeight: '800' }}>Salvar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
              {[{ label: 'Nome', key: 'name' as const, placeholder: 'Ex: Maria Silva', keyboard: 'default' as const }, { label: 'Telefone', key: 'phone' as const, placeholder: 'Ex: (11) 99999-9999', keyboard: 'phone-pad' as const }].map((field) => (
                <View key={field.key} style={{ gap: 10 }}>
                  <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>{field.label}</Text>
                  <TextInput
                    value={form[field.key]}
                    onChangeText={(v) => {
                      if (field.key === 'phone') {
                        setForm((f) => ({ ...f, phone: formatPhone(v) }));
                      } else {
                        setForm((f) => ({ ...f, [field.key]: v }));
                      }
                    }}
                    placeholder={field.placeholder}
                    placeholderTextColor={ac.muted}
                    keyboardType={field.keyboard}
                    style={{ backgroundColor: ac.surface, color: ac.foreground, borderColor: ac.border, borderWidth: 2, borderRadius: 16, padding: 18, fontSize: af.md, fontWeight: '500' }}
                    returnKeyType="done"
                  />
                </View>
              ))}
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>E-mail <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '400' }}>(opcional)</Text></Text>
                <TextInput
                  value={form.email ?? ''}
                  onChangeText={(v) => setForm((f) => ({ ...f, email: v.trim() }))}
                  placeholder="Ex: maria@email.com"
                  placeholderTextColor={ac.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ backgroundColor: ac.surface, color: ac.foreground, borderColor: ac.border, borderWidth: 2, borderRadius: 16, padding: 18, fontSize: af.md, fontWeight: '500' }}
                  returnKeyType="done"
                  maxLength={320}
                />
                <Text style={{ fontSize: af.sm, color: ac.muted }}>Usado se o WhatsApp não funcionar.</Text>
              </View>
            </ScrollView>
          </View>
        </Modal>
        <AppDialog {...dialogProps} />
        <AppToast {...toastProps} />
      </ScreenContainer>
    );
  }

  // --- NORMAL MODE --------------------------------------------------
  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>Contatos SOS</Text>
          <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
            {state.emergencyContacts.length} contato(s) de emergência
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={handleImportFromDevice}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityLabel="Importar contato do celular"
          >
            <MaterialIcons name="contacts" size={22} color={colors.onPrimary} />
          </Pressable>
          <Pressable
            onPress={openAddModal}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: colors.emergency, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityLabel="Adicionar contato"
          >
            <MaterialIcons name="add" size={24} color={colors.onEmergency} />
          </Pressable>
        </View>
      </View>

      {/* Pro Limit Badge */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <ProLimitBadge
          current={state.emergencyContacts.length}
          limit={FREE_LIMITS.CONTACTS}
          label="contatos"
        />
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
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: fs.lg }]}>
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
            <MaterialIcons name="add" size={20} color={colors.onEmergency} />
            <Text style={[styles.emptyButtonText, { color: colors.onEmergency }]}>Adicionar Contato</Text>
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
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
            <Pressable
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.modalCloseText, { color: colors.muted }]}>Cancelar</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: fs.xl }]}>
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

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>E-mail <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 13 }}>(opcional)</Text></Text>
              <TextInput
                value={form.email ?? ''}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v.trim() }))
                }
                placeholder="Ex: maria@email.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border },
                ]}
                returnKeyType="next"
                maxLength={320}
              />
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                Usado como alternativa ao WhatsApp para envio de avisos de emergência.
              </Text>
            </View>

            <View
              style={[
                styles.toggleRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.toggleLeft}>
                <MaterialIcons name="chat" size={20} color={colors.success} />
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

      {/* Import from Device Modal */}
      <Modal
        visible={importModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setImportModalVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
            <Pressable
              onPress={() => setImportModalVisible(false)}
              style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.modalCloseText, { color: colors.muted }]}>Fechar</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: fs.xl }]}>
              Importar Contato
            </Text>
            <View style={{ minWidth: 70 }} />
          </View>

          {/* Search Bar */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="search" size={20} color={colors.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar contato..."
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.foreground }]}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <MaterialIcons name="close" size={18} color={colors.muted} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Device Contacts List */}
          <FlatList
            data={filteredDeviceContacts}
            keyExtractor={(item, index) => (item as any).id ?? `${item.name}-${index}`}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelectDeviceContact(item)}
                style={({ pressed }) => [
                  styles.deviceContactRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.deviceContactAvatar, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.deviceContactInitial, { color: colors.primary }]}>
                    {(item.name ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.deviceContactName, { color: colors.foreground }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.deviceContactPhone, { color: colors.muted }]}>
                    {item.phoneNumbers?.[0]?.number ?? 'Sem número'}
                  </Text>
                </View>
                <MaterialIcons name="add-circle-outline" size={24} color={colors.primary} />
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: 32 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialIcons name="search-off" size={48} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: fs.md }]}>
                  Nenhum contato encontrado
                </Text>
              </View>
            }
          />
        </View>
      </Modal>
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
      <UpsellModal />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
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
  emptyButtonText: { fontSize: 16, fontWeight: '600' },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  deviceContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deviceContactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceContactInitial: {
    fontSize: 18,
    fontWeight: '700',
  },
  deviceContactName: {
    fontSize: 16,
    fontWeight: '500',
  },
  deviceContactPhone: {
    fontSize: 14,
    marginTop: 2,
  },
});
