/**
 * CheckinResponseScreen
 *
 * Tela de confirmação do check-in diário.
 * Aberta após o usuário responder ao check-in (via notificação ou popup in-app).
 *
 * IMPORTANTE: markCheckinResponded() já foi chamado antes de navegar até aqui.
 * Esta tela não executa nenhuma lógica de check-in — é apenas uma confirmação visual.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function CheckinResponseScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.body}>

        {/* Espaço superior */}
        <View style={styles.top}>
          <Text style={styles.emoji}>🌿</Text>
        </View>

        {/* Mensagem central */}
        <View style={styles.middle}>
          <Text style={styles.title}>Ótimo! Que bom que{'\n'}você está bem.</Text>
          <Text style={styles.subtitle}>Recebemos seu check-in 💚</Text>
        </View>

        {/* Botão na base */}
        <View style={styles.bottom}>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]}
            accessibilityLabel="Entendido, fechar tela de confirmação"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Entendido</Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F8E9',
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  emoji: {
    fontSize: 64,
  },
  middle: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1B5E20',
    textAlign: 'center',
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    color: '#388E3C',
    textAlign: 'center',
    lineHeight: 22,
  },
  bottom: {
    flex: 1,
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#2E7D32',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
