import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ScreenContainer } from '@/components/screen-container';
import { FormKeyboardView } from '@/components/form-keyboard-view';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAppContext } from '@/lib/app-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { trpc } from '@/lib/trpc';
import * as Auth from '@/lib/_core/auth';
import { useAuth } from '@/hooks/use-auth';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function formatPhoneForDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function ProfileScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(state.profile.photoUri);
  const { dialogProps, showDialog } = useAppDialog();
  const updateProfile = trpc.auth.updateProfile.useMutation();
  const router = useRouter();
  const { logout } = useAuth({ autoFetch: false });

  const handleLogout = () => {
    showDialog({
      title: 'Sair da conta',
      message: 'Você vai precisar entrar novamente com o Google para usar o app. Seus dados continuam salvos na sua conta.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            await logout();
            router.replace('/login');
          },
        },
      ],
    });
  };

  // Initial load: prefer server-synced values from registration; fall back to
  // the legacy local-only AppContext profile for older installs that pre-date
  // the registration flow.
  useEffect(() => {
    Auth.getUserInfo().then((u) => {
      setName(u?.name ?? state.profile.name ?? '');
      setPhone(formatPhoneForDisplay(u?.phone ?? state.profile.phone ?? ''));
      setBirthDate(u?.birthDate ?? state.profile.birthDate ?? '');
      setBloodType(u?.bloodType ?? state.profile.bloodType ?? '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPhotoUri(state.profile.photoUri);
  }, [state.profile.photoUri]);

  const handlePickPhoto = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showDialog({ title: 'Permissão necessária', message: 'Precisamos de acesso à galeria para selecionar sua foto.', variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showDialog({ title: 'Permissão necessária', message: 'Precisamos de acesso à câmera para tirar sua foto.', variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handlePhotoOptions = () => {
    showDialog({
      title: 'Foto de Perfil',
      message: 'Escolha uma opção',
      variant: 'select',
      options: [
        { label: 'Câmera', icon: '📷', onPress: handleTakePhoto },
        { label: 'Galeria', icon: '🖼', onPress: handlePickPhoto },
        ...(photoUri ? [{ label: 'Remover Foto', icon: '🗑', onPress: () => { setPhotoUri(null); }, destructive: true }] : []),
      ],
    });
  };

  const formatBirthDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4) + '/' + cleaned.slice(4, 8);
    setBirthDate(formatted);
  };

  const formatPhone = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = '(' + cleaned.slice(0, 2) + ') ' + cleaned.slice(2);
    if (cleaned.length > 7) formatted = '(' + cleaned.slice(0, 2) + ') ' + cleaned.slice(2, 7) + '-' + cleaned.slice(7, 11);
    setPhone(formatted);
  };

  const handleSave = async () => {
    const phoneDigits = phone.replace(/\D/g, '');
    try {
      const updated = await updateProfile.mutateAsync({
        name: name.trim() || undefined,
        phone: phoneDigits || undefined,
        birthDate: birthDate.trim() || undefined,
        bloodType: bloodType.trim() || undefined,
      });

      // Mirror to local user info so getUserInfo() stays in sync after
      // reopens of the app while offline.
      const existing = await Auth.getUserInfo();
      if (existing) {
        await Auth.setUserInfo({
          ...existing,
          name: updated.name,
          phone: updated.phone,
          birthDate: updated.birthDate,
          bloodType: updated.bloodType,
        });
      }

      // Keep the in-memory AppContext profile aligned. photoUri continues
      // to live only locally for now (no cloud sync yet).
      dispatch({
        type: 'UPDATE_PROFILE',
        payload: { name, birthDate, bloodType, phone, photoUri },
      });

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showDialog({ title: 'Perfil salvo', message: 'Suas informações foram atualizadas com sucesso.', variant: 'success', buttons: [{ text: 'OK' }] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar perfil.';
      showDialog({ title: 'Erro ao salvar', message, variant: 'warning', buttons: [{ text: 'OK' }] });
    }
  };

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    const a11yProfileFields: { label: string; value: string; onChange: (v: string) => void; placeholder: string; keyboard?: any; maxLength?: number }[] = [
      { label: 'Nome completo', value: name, onChange: (v) => { setName(v); }, placeholder: 'Seu nome completo' },
      { label: 'Data de nascimento', value: birthDate, onChange: formatBirthDate, placeholder: 'DD/MM/AAAA', keyboard: 'numeric', maxLength: 10 },
      { label: 'Telefone', value: phone, onChange: formatPhone, placeholder: '(11) 99999-9999', keyboard: 'phone-pad' },
    ];
    return (
      <>
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        {/* Título apenas — salvar fica no botão grande no fim da tela */}
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.bar }}>
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Meu Perfil</Text>
        </View>
        <FormKeyboardView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <View style={{ alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={handlePhotoOptions} style={{ position: 'relative' }}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: ac.primary }} />
              ) : (
                <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: ac.surface, borderWidth: 4, borderColor: ac.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="person" size={72} color={ac.primary} />
                </View>
              )}
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: ac.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: ac.primary }}>
                <MaterialIcons name="camera-alt" size={20} color={ac.onPrimary} />
              </View>
            </TouchableOpacity>
            <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600' }}>Toque para alterar a foto</Text>
          </View>
          {/* Fields */}
          {a11yProfileFields.map((field) => (
            <View key={field.label} style={{ gap: 10 }}>
              <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>{field.label}</Text>
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                placeholder={field.placeholder}
                placeholderTextColor={ac.muted}
                keyboardType={field.keyboard ?? 'default'}
                maxLength={field.maxLength}
                style={{ backgroundColor: ac.surface, color: ac.foreground, borderColor: ac.border, borderWidth: 2, borderRadius: 16, padding: 18, fontSize: af.md, fontWeight: '500' }}
                returnKeyType="done"
              />
            </View>
          ))}
          {/* Blood type */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Tipo sanguíneo</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {BLOOD_TYPES.map((bt) => (
                <TouchableOpacity
                  key={bt}
                  onPress={() => { setBloodType(bt); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Tipo sanguíneo ${bt}${bloodType === bt ? ', selecionado' : ''}`}
                  style={{ width: '22%', minHeight: 64, paddingHorizontal: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 3, backgroundColor: bloodType === bt ? ac.emergency : ac.surface, borderColor: bloodType === bt ? ac.emergency : ac.border, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: af.md, fontWeight: '900', color: bloodType === bt ? ac.onEmergency : ac.foreground }}>{bt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="Salvar perfil"
            style={{ backgroundColor: ac.success, borderRadius: 20, minHeight: 64, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}
          >
            <MaterialIcons name="save" size={32} color={ac.onPrimary} />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.onPrimary }}>Salvar Perfil</Text>
          </TouchableOpacity>
          {/* Logout — destrutivo, em vermelho (distinto dos botões comuns) */}
          <TouchableOpacity
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Sair da conta"
            style={{ backgroundColor: ac.background, borderRadius: 20, minHeight: 64, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, borderWidth: 3, borderColor: ac.emergency }}
          >
            <MaterialIcons name="logout" size={32} color={ac.emergency} />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.emergency }}>Sair da Conta</Text>
          </TouchableOpacity>
        </ScrollView>
        </FormKeyboardView>
      </ScreenContainer>
      <AppDialog {...dialogProps} />
      </>
    );
  }

  // --- NORMAL MODE --------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      {/* Título apenas — salvar fica no botão grande no fim da tela */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs['2xl'] }]}>Meu Perfil</Text>
      </View>

      <FormKeyboardView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePhotoOptions} style={styles.avatarContainer}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                <MaterialIcons name="person" size={60} color={colors.primary} />
              </View>
            )}
            <View style={[styles.cameraButton, { backgroundColor: colors.primary, borderColor: colors.onPrimary }]}>
              <MaterialIcons name="camera-alt" size={18} color={colors.onPrimary} />
            </View>
          </TouchableOpacity>
          <Text style={[styles.avatarHint, { color: colors.muted, fontSize: fs.sm }]}>
            Toque para alterar a foto
          </Text>
        </View>

        {/* Form Section */}
        <View style={[styles.formSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.lg }]}>Informações pessoais</Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.muted, fontSize: fs.sm }]}>Nome completo</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <MaterialIcons name="person" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontSize: fs.md, height: fs.touch(48) }]}
                value={name}
                onChangeText={(t) => { setName(t); }}
                placeholder="Seu nome completo"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.muted, fontSize: fs.sm }]}>Data de nascimento</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <MaterialIcons name="cake" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontSize: fs.md, height: fs.touch(48) }]}
                value={birthDate}
                onChangeText={formatBirthDate}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.muted, fontSize: fs.sm }]}>Telefone</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <MaterialIcons name="phone" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontSize: fs.md, height: fs.touch(48) }]}
                value={phone}
                onChangeText={formatPhone}
                placeholder="(00) 00000-0000"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                maxLength={15}
              />
            </View>
          </View>
        </View>

        {/* Blood Type Section */}
        <View style={[styles.formSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.lg }]}>Tipo sanguíneo</Text>
          <View style={styles.bloodTypeGrid}>
            {BLOOD_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                onPress={() => {
                  setBloodType(type);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Tipo sanguíneo ${type}${bloodType === type ? ', selecionado' : ''}`}
                style={[
                  styles.bloodTypeBtn,
                  {
                    backgroundColor: bloodType === type ? colors.emergency : colors.surface,
                    borderColor: bloodType === type ? colors.emergency : colors.border,
                    minHeight: fs.touch(48),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.bloodTypeBtnText,
                    { color: bloodType === type ? colors.onEmergency : colors.foreground, fontSize: fs.md },
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Salvar perfil"
          style={[styles.saveButton, { backgroundColor: colors.success, minHeight: fs.touch(56) }]}
        >
          <MaterialIcons name="save" size={22} color={colors.onSuccess} />
          <Text style={[styles.saveButtonText, { color: colors.onSuccess, fontSize: fs.scaled(17) }]}>Salvar Perfil</Text>
        </TouchableOpacity>

        {/* Logout — destrutivo, contorno vermelho */}
        <TouchableOpacity
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta"
          style={[styles.logoutButton, { borderColor: colors.error, backgroundColor: colors.surface, minHeight: fs.touch(56) }]}
        >
          <MaterialIcons name="logout" size={22} color={colors.error} />
          <Text style={[styles.saveButtonText, { color: colors.error, fontSize: fs.scaled(17) }]}>Sair da Conta</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
      </FormKeyboardView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  avatarHint: {
    marginTop: 8,
  },
  formSection: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontWeight: '600',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
  },
  bloodTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bloodTypeBtn: {
    width: '22%' as any,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloodTypeBtnText: {
    fontWeight: '700',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    gap: 8,
    marginTop: 12,
    borderWidth: 1.5,
  },
  saveButtonText: {
    fontWeight: '700',
  },
});
