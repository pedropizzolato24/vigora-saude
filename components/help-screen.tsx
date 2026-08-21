import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Collapsible, COLLAPSE_DURATION, FadeInView } from '@/components/animated-components';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';

interface FAQItem {
  question: string;
  answer: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}

interface FAQSection {
  title: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  /** Cor decorativa da categoria. Ausente quando a seção usa `token`. */
  color?: string;
  /** Seções semânticas (emergência, alarme) seguem o tema, não um hex fixo. */
  token?: 'emergency' | 'primary';
  items: FAQItem[];
}

/** Cor da seção: token do tema quando é semântica, hex quando é decorativa. */
function corDaSecao(secao: FAQSection, colors: ReturnType<typeof useColors>): string {
  return secao.token ? colors[secao.token] : (secao.color ?? colors.muted);
}

const FAQ_DATA: FAQSection[] = [
  {
    title: 'Botão SOS',
    icon: 'warning',
    token: 'emergency',
    items: [
      {
        question: 'Como funciona o botão SOS?',
        answer: 'O botão SOS está na tela inicial do app. Ao tocar nele, uma confirmação será exibida. Após confirmar, uma notificação de emergência será enviada para todos os seus contatos cadastrados. Se você tiver a localização ativada, sua posição será incluída na mensagem.',
        icon: 'touch-app',
      },
      {
        question: 'Quem recebe a notificação de SOS?',
        answer: 'Todos os contatos de emergência cadastrados na seção "Contatos de Emergência" receberão a notificação. Contatos com WhatsApp habilitado receberão uma mensagem via WhatsApp com sua localização.',
        icon: 'people',
      },
      {
        question: 'Posso cancelar um SOS enviado?',
        answer: 'Antes de confirmar, você pode cancelar a qualquer momento. Após a confirmação, as mensagens já terão sido enviadas. Recomendamos avisar seus contatos caso tenha sido um acionamento acidental.',
        icon: 'cancel',
      },
    ],
  },
  {
    title: 'Alarmes',
    icon: 'alarm',
    token: 'primary',
    items: [
      {
        question: 'Como criar um novo alarme?',
        answer: 'Vá até a aba "Alarmes" e toque no botão "+" no canto superior direito. Defina o horário, descrição, modo de repetição (diário, dias úteis, fins de semana ou único) e escolha se deseja som e/ou vibração.',
        icon: 'add-alarm',
      },
      {
        question: 'O que acontece se eu não responder a um alarme?',
        answer: 'Se você não responder ao alarme dentro de 2 minutos, o app enviará automaticamente uma mensagem via WhatsApp para seus contatos de emergência informando que você não respondeu. Você pode configurar a quantidade de alarmes não respondidos necessários para acionar essa escalação nas Configurações.',
        icon: 'notification-important',
      },
      {
        question: 'Como configurar a escalação de alarmes?',
        answer: 'Vá em Configurações > Segurança > "Alarmes não respondidos para escalação". Use os botões + e - para definir quantos alarmes consecutivos não respondidos são necessários antes de enviar mensagens automáticas aos contatos.',
        icon: 'settings',
      },
      {
        question: 'Posso ter mais de um alarme?',
        answer: 'Sim! Você pode cadastrar até 24 alarmes diferentes, cada um com seu próprio horário, descrição e configuração de repetição.',
        icon: 'alarm-add',
      },
    ],
  },
  {
    title: 'Contatos de Emergência',
    icon: 'people',
    color: '#7C3AED',
    items: [
      {
        question: 'Como adicionar um contato de emergência?',
        answer: 'Na tela de Contatos, toque no botão "+" para adicionar manualmente, ou toque no ícone de agenda (ao lado do +) para importar diretamente da sua lista de contatos do celular.',
        icon: 'person-add',
      },
      {
        question: 'O que significa "WhatsApp habilitado"?',
        answer: 'Quando você habilita o WhatsApp para um contato, em situações de emergência (SOS ou alarmes não respondidos), o app tentará enviar uma mensagem via WhatsApp para esse contato com detalhes da emergência e sua localização.',
        icon: 'chat',
      },
      {
        question: 'Quantos contatos posso cadastrar?',
        answer: 'Não há limite de contatos de emergência. Recomendamos cadastrar pelo menos 3 contatos de confiança (familiares próximos, cuidadores, vizinhos) para garantir que alguém sempre receba suas notificações.',
        icon: 'group-add',
      },
    ],
  },
  {
    title: 'Ficha de Anamnese',
    icon: 'description',
    color: '#059669',
    items: [
      {
        question: 'O que é a Ficha de Anamnese?',
        answer: 'É sua ficha médica pessoal onde você registra informações importantes como alergias, medicamentos em uso, doenças crônicas e dados do plano de saúde. Essas informações podem ser compartilhadas com médicos e equipes de emergência.',
        icon: 'medical-information',
      },
      {
        question: 'Como compartilhar minha ficha médica?',
        answer: 'Na tela de Anamnese, após preencher seus dados, toque no botão "Compartilhar". Um PDF será gerado com todas as suas informações médicas, que pode ser enviado via WhatsApp, e-mail ou qualquer outro app de compartilhamento.',
        icon: 'share',
      },
      {
        question: 'Meus dados médicos são seguros?',
        answer: 'Sim! Todos os dados são armazenados localmente no seu celular. Nenhuma informação é enviada para servidores externos. Apenas quando você escolhe compartilhar a ficha é que os dados saem do seu dispositivo.',
        icon: 'security',
      },
    ],
  },
  {
    title: 'Ambulância',
    icon: 'local-hospital',
    token: 'emergency',
    items: [
      {
        question: 'Como chamar uma ambulância?',
        answer: 'Na tela inicial, toque em "Chamar Ambulância" abaixo do botão SOS, ou acesse pelo menu lateral. Você terá 3 opções: SAMU (192), seu Plano de Saúde (número configurado na Anamnese) e Bombeiros (193).',
        icon: 'phone',
      },
      {
        question: 'Como configurar o número do plano de saúde?',
        answer: 'Vá até a Ficha de Anamnese e preencha o campo "Plano de Saúde" com o nome e o campo "Telefone do Plano" com o número de emergência do seu plano. Esse número aparecerá automaticamente na tela de Ambulância.',
        icon: 'edit',
      },
    ],
  },
  {
    title: 'Localização',
    icon: 'location-on',
    color: '#EA580C',
    items: [
      {
        question: 'Como compartilhar minha localização?',
        answer: 'Acesse "Compartilhar Localização" pelo menu lateral. O app detectará sua posição GPS e gerará um link do Google Maps. Toque em "Compartilhar Localização" para enviar o link via WhatsApp, SMS ou qualquer outro app.',
        icon: 'my-location',
      },
      {
        question: 'A localização é enviada automaticamente?',
        answer: 'Sim, quando você aciona o SOS ou quando alarmes não respondidos disparam a escalação automática, sua localização é incluída nas mensagens enviadas aos contatos de emergência (se a permissão de localização estiver concedida).',
        icon: 'gps-fixed',
      },
    ],
  },
  {
    title: 'Configurações',
    icon: 'settings',
    color: '#6B7280',
    items: [
      {
        question: 'Como ativar o modo escuro?',
        answer: 'Vá em Configurações > Aparência e ative o "Modo Escuro". A mudança é aplicada imediatamente em todas as telas do app e a preferência é salva automaticamente.',
        icon: 'dark-mode',
      },
      {
        question: 'Como aumentar o tamanho da fonte?',
        answer: 'Vá em Configurações > Aparência > "Tamanho da Fonte" e escolha entre Pequeno, Médio ou Grande. Isso ajusta o tamanho do texto em todo o aplicativo para melhorar a leitura.',
        icon: 'format-size',
      },
      {
        question: 'Como apagar todos os meus dados?',
        answer: 'Vá em Configurações > Dados > "Limpar Todos os Dados". Uma confirmação será solicitada. Atenção: esta ação é irreversível e apagará todos os alarmes, contatos, métricas de saúde e configurações.',
        icon: 'delete-forever',
      },
    ],
  },
  {
    title: 'Perfil',
    icon: 'person',
    color: '#0891B2',
    items: [
      {
        question: 'Como editar meu perfil?',
        answer: 'Abra o menu lateral (ícone de menu no canto inferior esquerdo) e toque na sua foto ou nome no topo do menu. Você será levado à tela de Perfil onde pode alterar foto, nome, data de nascimento, telefone e tipo sanguíneo.',
        icon: 'edit',
      },
      {
        question: 'Como adicionar uma foto de perfil?',
        answer: 'Na tela de Perfil, toque no ícone da câmera sobre a foto. Você pode escolher entre tirar uma foto com a câmera ou selecionar uma imagem da galeria do celular.',
        icon: 'camera-alt',
      },
    ],
  },
];

/**
 * Tela de Ajuda/FAQ compartilhada. Renderizada como aba dentro do grupo do
 * monitorado (app/(tabs)/help.tsx, sem onBack) e como rota raiz acessível ao
 * cuidador (app/help.tsx, com onBack) — assim o cuidador abre a ajuda sem cair
 * no grupo de abas do monitorado e volta com o botão de voltar.
 */
export function HelpScreen({ onBack }: { onBack?: () => void } = {}) {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac } = useAccessibility();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // A abertura usa Collapsible (altura animada) em vez de LayoutAnimation: na
  // nova arquitetura ela é no-op/instável, e era por isso que a cascata abria
  // seca. As perguntas entram escalonadas depois que o painel termina de abrir.
  const toggleSection = (title: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const toggleItem = (key: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    // In accessibility mode, show a flat list of all FAQ items without nested collapsibles
    // Group by section but keep everything expanded for easier reading
    return (
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ac.bar }}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={12}
              style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 16, marginLeft: -12 }}
            >
              <MaterialIcons name="arrow-back" size={34} color={ac.foreground} />
            </TouchableOpacity>
          ) : null}
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground, flex: 1 }}>Ajuda e FAQ</Text>
          <MaterialIcons name="help-outline" size={32} color={ac.primary} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Welcome banner */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <MaterialIcons name="support-agent" size={48} color={ac.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: af.lg, fontWeight: '900', color: ac.foreground }}>Como podemos ajudar?</Text>
              <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 6, lineHeight: af.scaled(22) }}>Respostas para as dúvidas mais comuns.</Text>
            </View>
          </View>

          {/* All sections expanded */}
          {FAQ_DATA.map((section) => (
            <View key={section.title} style={{ gap: 12 }}>
              {/* Section title */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: corDaSecao(section, colors) + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name={section.icon} size={30} color={corDaSecao(section, colors)} />
                </View>
                <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground, flex: 1 }}>{section.title}</Text>
              </View>
              {/* Items */}
              {section.items.map((item, idx) => (
                <View key={idx} style={{ backgroundColor: ac.surface, borderRadius: 16, borderWidth: 2, borderColor: ac.border, padding: 18, gap: 10 }}>
                  <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.foreground, lineHeight: af.scaled(26) }}>{item.question}</Text>
                  <View style={{ height: 2, backgroundColor: ac.border }} />
                  <Text style={{ fontSize: af.base, color: ac.foreground, lineHeight: af.scaled(28) }}>{item.answer}</Text>
                </View>
              ))}
            </View>
          ))}

          {/* Support */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: 20, alignItems: 'center', gap: 12 }}>
            <MaterialIcons name="email" size={40} color={ac.primary} />
            <Text style={{ fontSize: af.lg, fontWeight: '900', color: ac.foreground }}>Ainda precisa de ajuda?</Text>
            <Text style={{ fontSize: af.base, color: ac.foreground, textAlign: 'center', lineHeight: af.scaled(26) }}>Entre em contato pelo e-mail suporte@vigorasaude.com.br</Text>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // --- NORMAL MODE --------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={12}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginLeft: -10 }}
          >
            <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs['2xl'], flex: 1 }]}>Ajuda e FAQ</Text>
        <MaterialIcons name="help-outline" size={26} color={colors.primary} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Welcome Banner */}
        <View style={[styles.welcomeBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
          <MaterialIcons name="support-agent" size={40} color={colors.primary} />
          <View style={styles.welcomeTextContainer}>
            <Text style={[styles.welcomeTitle, { color: colors.foreground, fontSize: fs.lg }]}>
              Como podemos ajudar?
            </Text>
            <Text style={[styles.welcomeSubtitle, { color: colors.foreground, fontSize: fs.sm }]}>
              Encontre respostas para as dúvidas mais comuns sobre o Vigora.
            </Text>
          </View>
        </View>

        {/* FAQ Sections */}
        {FAQ_DATA.map((section) => {
          const isSectionOpen = expandedSections[section.title] ?? false;

          return (
            <View
              key={section.title}
              style={[styles.sectionContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {/* Section Header */}
              <TouchableOpacity
                onPress={() => toggleSection(section.title)}
                style={styles.sectionHeader}
                activeOpacity={0.7}
              >
                <View style={[styles.sectionIconBadge, { backgroundColor: corDaSecao(section, colors) + '15' }]}>
                  <MaterialIcons name={section.icon} size={24} color={corDaSecao(section, colors)} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.md }]}>
                  {section.title}
                </Text>
                <View style={[styles.countBadge, { backgroundColor: colors.primary + '15' }]}>
                  <Text style={[styles.countText, { color: colors.primary }]}>
                    {section.items.length}
                  </Text>
                </View>
                <MaterialIcons
                  name={isSectionOpen ? 'expand-less' : 'expand-more'}
                  size={24}
                  color={colors.muted}
                />
              </TouchableOpacity>

              {/* Section Items — o painel desliza e só então as perguntas entram */}
              <Collapsible open={isSectionOpen}>
                <View style={[styles.sectionContent, { borderTopColor: colors.border }]}>
                  {section.items.map((item, idx) => {
                    const itemKey = `${section.title}-${idx}`;
                    const isItemOpen = expandedItems[itemKey] ?? false;

                    return (
                      <FadeInView key={itemKey} delay={COLLAPSE_DURATION + idx * 45} duration={280}>
                        <TouchableOpacity
                          onPress={() => toggleItem(itemKey)}
                          style={[
                            styles.faqItem,
                            idx < section.items.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                          ]}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.faqIconCircle, { backgroundColor: corDaSecao(section, colors) + '10' }]}>
                            <MaterialIcons name={item.icon} size={18} color={corDaSecao(section, colors)} />
                          </View>
                          <Text style={[styles.faqQuestion, { color: colors.foreground, fontSize: fs.base }]} numberOfLines={isItemOpen ? undefined : 2}>
                            {item.question}
                          </Text>
                          <MaterialIcons
                            name={isItemOpen ? 'remove' : 'add'}
                            size={22}
                            color={colors.primary}
                          />
                        </TouchableOpacity>

                        {isItemOpen && (
                          <FadeInView duration={200} style={[styles.faqAnswer, { backgroundColor: colors.surface }]}>
                            <Text style={[styles.faqAnswerText, { color: colors.foreground, fontSize: fs.base, lineHeight: fs.scaled(24) }]}>
                              {item.answer}
                            </Text>
                          </FadeInView>
                        )}
                      </FadeInView>
                    );
                  })}
                </View>
              </Collapsible>
            </View>
          );
        })}

        {/* Contact Support */}
        <View style={[styles.supportSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="email" size={28} color={colors.primary} />
          <Text style={[styles.supportTitle, { color: colors.foreground }]}>
            Ainda precisa de ajuda?
          </Text>
          <Text style={[styles.supportText, { color: colors.foreground }]}>
            Se sua dúvida não foi respondida, entre em contato conosco pelo e-mail suporte@vigorasaude.com.br
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
  },
  welcomeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    gap: 16,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 16,
    lineHeight: 20,
  },
  sectionContainer: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  sectionIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  faqItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  faqIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
  faqAnswer: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
  },
  faqAnswerText: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
  },
  supportSection: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
    gap: 8,
  },
  supportTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  supportText: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
});
