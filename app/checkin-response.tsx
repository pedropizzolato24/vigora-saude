/**
 * CheckinResponseScreen
 *
 * Tela de confirmação do check-in diário.
 * Aberta após o usuário responder ao check-in (via notificação ou popup in-app).
 *
 * IMPORTANTE: markCheckinResponded() já foi chamado antes de navegar até aqui.
 * Esta tela não executa nenhuma lógica de check-in — é apenas uma confirmação visual.
 *
 * A paleta era verde fixa em hex, sem nenhum acesso ao tema: no modo escuro
 * isto acendia uma tela CHEIA de verde claro, de madrugada, para um idoso.
 * Agora o verde vem de `success`/`successLight`, que já viram do lado certo em
 * cada esquema, e o texto usa foreground/muted — 14,6:1 e 4,8:1 sobre o fundo
 * tingido, contra os 3 tons de verde de antes.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';

export default function CheckinResponseScreen() {
  const router = useRouter();
  const colors = useColors();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();

  // O layout é simples (emoji, título, frase, botão), então o modo acessível
  // ajusta cor e corpo no lugar — não precisa de uma árvore separada como a
  // tela do alarme.
  const corFundo = isAccessibilityMode ? ac.background : colors.successLight;
  const corBorda = isAccessibilityMode ? ac.border : colors.success + '40';
  const corTitulo = isAccessibilityMode ? ac.foreground : colors.foreground;
  const corFrase = isAccessibilityMode ? ac.muted : colors.muted;
  const corBotao = isAccessibilityMode ? ac.success : colors.success;
  // A paleta acessível não define onSuccess; o branco do onPrimary dá 6,61:1
  // sobre o verde escuro dela.
  const corBotaoTexto = isAccessibilityMode ? ac.onPrimary : colors.onSuccess;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: corFundo,
          borderColor: corBorda,
          borderWidth: isAccessibilityMode ? 3 : 1.5,
        },
      ]}
    >
      <View style={styles.body}>

        {/* Espaço superior */}
        <View style={styles.top}>
          <Text style={[styles.emoji, { fontSize: isAccessibilityMode ? 80 : 64 }]}>🌿</Text>
        </View>

        {/* Mensagem central */}
        <View style={styles.middle}>
          <Text
            style={[
              styles.title,
              {
                color: corTitulo,
                fontSize: isAccessibilityMode ? af.xl : 22,
                lineHeight: isAccessibilityMode ? af.xl * 1.4 : 30,
              },
            ]}
          >
            Ótimo! Que bom que{'\n'}você está bem.
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: corFrase,
                fontSize: isAccessibilityMode ? af.base : 15,
                lineHeight: isAccessibilityMode ? af.base * 1.4 : 22,
              },
            ]}
          >
            Recebemos seu check-in 💚
          </Text>
        </View>

        {/* Botão na base */}
        <View style={styles.bottom}>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: corBotao,
                paddingVertical: isAccessibilityMode ? 24 : 18,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityLabel="Até amanhã, fechar tela de confirmação"
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.buttonText,
                { color: corBotaoTexto, fontSize: isAccessibilityMode ? af.lg : 22 },
              ]}
            >
              Até amanhã
            </Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
  emoji: {},
  middle: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  bottom: {
    flex: 1,
    justifyContent: 'center',
  },
  button: {
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '800',
  },
});
