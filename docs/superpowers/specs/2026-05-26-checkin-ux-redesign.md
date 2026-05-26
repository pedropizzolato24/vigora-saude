# Check-in Diário — Redesign de UX

**Data:** 2026-05-26  
**Status:** Aprovado pelo usuário  
**Contexto:** Redesign do check-in "Você está bem?" para ser mais discreto e gentil, mantendo o dead man's switch intacto.

---

## Visão Geral

O check-in diário é redesenhado para ser **menos disruptivo** que os alarmes de medicamento, mas **ainda funcional como ferramenta de monitoramento**. O dead man's switch (escalação após 30 min sem resposta) é preservado. A identidade visual unificada usa verde pastel para que o idoso associe rapidamente o check-in a bem-estar.

### O que NÃO muda
- Um único horário configurável por dia (`checkinTime: string`)
- Janela de escalação de 30 minutos (`checkinWindowMinutes: 30`)
- Mecanismo de timeout + escalação para contatos de emergência
- Canal de notificação `vigora-checkin`

---

## Fluxo Redesenhado

### Caso 1 — App fechado (notificação push)

```
Horário configurado chega
  → Sistema envia push notification
  → Título: "💚 Como você está?"
  → Body: "Toque para confirmar que está tudo bem 🌿"
  → Usuário toca na notificação
  → markCheckinResponded() chamado IMEDIATAMENTE
  → Navega para /checkin-response (tela de confirmação)
  → Usuário lê mensagem amigável
  → Toca "Entendido"
  → Volta para /(tabs)
```

### Caso 2 — App aberto (in-app popup)

```
Horário configurado chega (app em foreground)
  → Sistema suprime o banner nativo (shouldShowBanner: false)
  → CheckinInitializer detecta via addNotificationReceivedListener
  → Modal popup aparece sobre a tela atual (overlay escurecido)
  → Estado "perguntando": card verde pastel, 🌿, "Você está bem?"
  → Usuário toca em QUALQUER LUGAR da tela (card ou fora)
  → markCheckinResponded() chamado imediatamente
  → Card anima para estado "confirmado": fundo #E8F5E9, ✅, "Ótimo!"
  → Popup some automaticamente após 2 segundos
  → Usuário permanece na tela onde estava
```

---

## Design Visual — Paleta Unificada (Opção C)

Aplicada em: popup in-app, tela de confirmação, e notificação push.

| Token | Valor | Uso |
|---|---|---|
| Fundo perguntando | `#F1F8E9` | Card popup (estado inicial) |
| Fundo confirmado | `#E8F5E9` | Card popup (após tap) + tela de confirmação |
| Borda | `#C8E6C9` | Bordas de card e tela |
| Verde primário | `#2E7D32` | Botão "Entendido", círculo do ✅ |
| Texto principal | `#1B5E20` | Títulos |
| Texto secundário | `#388E3C` | Subtítulos, body text |
| Texto hint | `#81C784` | "Responda em até 30 minutos", "Fechando..." |
| Emojis | 🌿 💚 ✅ | Identidade visual do check-in |

---

## Componentes a Modificar

### 1. `lib/notifications-utils.ts`

No `setNotificationHandler`, detectar `checkin_prompt` e suprimir o banner nativo no foreground:

```typescript
const isCheckinPrompt = notification.request.content.data?.type === 'checkin_prompt';
return {
  shouldShowAlert: !isCheckinPrompt,   // popup in-app no lugar
  shouldShowBanner: !isCheckinPrompt,
  shouldPlaySound: isAlarm && !isCountdownUpdate && !isCheckinPrompt,
  shouldSetBadge: !isCountdownUpdate && !isCheckinPrompt,
  shouldShowList: true,
};
```

### 2. `lib/checkin-service.ts`

Atualizar conteúdo da notificação-prompt para texto mais gentil:

```typescript
content: {
  title: '💚 Como você está?',
  body: 'Toque para confirmar que está tudo bem 🌿',
  // cor de acento Android
  color: '#2E7D32',
  data: { type: 'checkin_prompt', checkinTime, windowMinutes },
}
```

### 3. `app/checkin-response.tsx` — Redesign completo

Tela de confirmação simples (sem countdown, sem botão "Estou Bem", sem escalação):

```
Background: #F1F8E9
Border: 1.5px solid #C8E6C9 (toda a tela via SafeAreaView)
─────────────────────────────
        [espaço superior]

        🌿  (emoji grande, ~64px)

  "Ótimo! Que bom que você está bem."
  (22px bold, #1B5E20, centrado)

  "Recebemos seu check-in 💚"
  (15px, #388E3C, centrado)

        [espaço flex]

  ┌──────────────────────────────┐
  │         Entendido            │  ← #2E7D32, 22px bold, border-radius 20
  └──────────────────────────────┘
─────────────────────────────
```

Ao tocar "Entendido": `router.replace('/(tabs)')`. A tela não executa nenhuma lógica de check-in — a marcação como respondido já foi feita antes de navegar até aqui.

### 4. `components/checkin-initializer.tsx` — In-app popup + roteamento

Adicionar estado de popup com dois sub-estados (`'asking' | 'confirmed'`) e um `Modal` do React Native:

**Foreground listener** (`addNotificationReceivedListener`):
```
data.type === 'checkin_prompt'
  → setPopupCheckinTime(data.checkinTime)
  → setPopupState('asking')
  → setPopupVisible(true)
```

**Background/tap listener** (`addNotificationResponseReceivedListener`):
```
data.type === 'checkin_prompt'
  → markCheckinResponded(data.checkinTime, data.windowMinutes)
  → router.push('/checkin-response')

data.type === 'checkin_timeout'
  → router.push('/checkin-response')  [comportamento já existente]
```

**Popup behavior:**
```
Tap em qualquer lugar (overlay ou card)
  → markCheckinResponded(checkinTime, windowMinutes)
  → setPopupState('confirmed')
  → setTimeout 2000ms → setPopupVisible(false)
```

**Estrutura do Modal:**
```
<Modal transparent animationType="fade" visible={popupVisible}>
  <Pressable style={overlay} onPress={handleConfirm}>    ← tap fora confirma
    <View style={card}>                                   ← tap dentro também confirma (bubbles up)
      {popupState === 'asking' ? <AskingContent /> : <ConfirmedContent />}
    </View>
  </Pressable>
</Modal>
```

**Estado "asking"** (card #F1F8E9):
- Emoji 🌿 (48px)
- "Você está bem?" (21px bold, #1B5E20)
- "Olá! Só passando para saber se está tudo bem com você 💚" (14px, #388E3C)
- Dashed box: "Toque em qualquer lugar para confirmar" (#2E7D32)
- Hint: "Responda em até 30 minutos" (11px, #81C784)

**Estado "confirmed"** (card #E8F5E9, borda #66BB6A):
- Círculo verde (#2E7D32) com ✅ (36px) dentro
- "Ótimo! Que bom que você está bem." (22px bold, #1B5E20)
- "Recebemos seu check-in 🌿" (14px, #388E3C)
- "Fechando automaticamente..." (11px, #81C784)

### 5. `app/_layout.tsx` — Cold-start handler

No bloco `getLastNotificationResponseAsync`, atualizar o handler de `checkin_prompt` para marcar como respondido:

```typescript
if (notifType === 'checkin_prompt') {
  const { markCheckinResponded } = require('@/lib/checkin-service');
  const checkinTime = data?.checkinTime as string | undefined;
  const windowMinutes = data?.windowMinutes as number | undefined;
  if (checkinTime && windowMinutes) {
    markCheckinResponded(checkinTime, windowMinutes).catch(() => {});
  }
  navRouter.push('/checkin-response');
  Notifications.clearLastNotificationResponseAsync();
  return;
}
```

### 6. `app/(tabs)/settings.tsx` — Seleção de horário

Substituir o `TextInput` atual de horário por:

1. **Dois botões de atalho** (grandes, acessíveis):
   - "☀️ Manhã — 09:00"
   - "🌆 Tarde — 17:00"
   - Botão selecionado: fundo `#2E7D32`, texto branco
   - Botão não selecionado: fundo `colors.surface`, borda `colors.border`

2. **Botão "Personalizar"** com ícone de relógio:
   - Abre `DateTimePicker` nativo do `@react-native-community/datetimepicker`
   - `mode="time"`, `is24Hour={true}`, `display="spinner"` (Android) / `"wheels"` (iOS)
   - Ao confirmar: `updateSetting('checkinTime', formatHHMM(date))` + `scheduleCheckin(...)`
   - Se horário personalizado ativo: mostrar o valor com destaque visual (ex: "🕐 10:30 — Personalizado")

---

## Nova Dependência

```bash
npx expo install @react-native-community/datetimepicker
```

Compatível com Expo SDK 54. Não requer configuração nativa adicional (expo-managed workflow).

---

## Arquivos Modificados

| Arquivo | Tipo de mudança |
|---|---|
| `lib/notifications-utils.ts` | Pequena — suprimir banner foreground para `checkin_prompt` |
| `lib/checkin-service.ts` | Pequena — atualizar texto da notificação |
| `app/checkin-response.tsx` | Grande — redesign completo da tela |
| `components/checkin-initializer.tsx` | Grande — adicionar popup Modal + lógica de estados |
| `app/_layout.tsx` | Pequena — cold-start handler marca como respondido |
| `app/(tabs)/settings.tsx` | Média — preset buttons + DateTimePicker |

---

## Testes

Funções puras (`computeTimeoutDate`, `formatCountdown`) não mudam — testes existentes continuam válidos. Nenhum novo teste de unidade necessário (lógica nova é de UI/side-effects).

Verificação manual:
- [ ] App fechado: notificação aparece com emojis → tap → abre tela de confirmação
- [ ] App aberto: popup aparece sobre tela atual → tap em qualquer lugar → confirmado → some
- [ ] Sem resposta em 30 min: escalação acontece normalmente (timeout notification)
- [ ] Settings: preset 09:00 / 17:00 funcionam → DateTimePicker abre e salva
- [ ] Modo acessível: popup legível com fontes maiores
