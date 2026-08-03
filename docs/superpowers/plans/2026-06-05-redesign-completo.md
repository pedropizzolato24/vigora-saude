# Redesign "Direção B (Repensada)" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar a hierarquia visual e a interação do fluxo do idoso monitorado (`app/(tabs)/`) para o público real — idosos 60+ e pessoas com doenças crônicas — trocando o drawer por uma tab "Tudo", convertendo formulários em wizards de 1-pergunta-por-tela e adotando linguagem cotidiana, sem introduzir nova lógica de negócio.

**Architecture:** O trabalho é majoritariamente de **layout e linguagem**, não de lógica nova. Tema de cores, fontes, hooks de acessibilidade (`useColors`/`useFontSize`/`useAccessibility`), countdown do SOS, haptics, TTS (`expo-speech`), pickers e animações **já existem e funcionam** — este plano os reutiliza. Quatro componentes base novos (`sos-strip`, `big-tile`, `mic-fab`, `wizard-step`) são a dependência de tudo; em seguida modificam-se tab bar, layout, home e telas de listagem, e por fim os wizards e a camada de acessibilidade.

**Tech Stack:** React Native 0.81 + Expo Router 6, NativeWind 4, `@expo/vector-icons` (MaterialIcons), `expo-speech` (TTS), `expo-haptics`, `react-native-reanimated` 4, pickers existentes (`@react-native-community/datetimepicker`, `wheel-picker.tsx`), `expo-contacts`.

> **Premissa de fidelidade (decisão explícita — CLAUDE.md §1):** Esta é uma **reescrita de formato** de um plano de design de alto nível para o padrão `docs/superpowers/plans/`. As tarefas preservam verbatim o material concreto do design original (props, tamanhos, cores, alvos de arquivo, critérios de verificação). Por ser um redesign que toca ~15 arquivos de UI, as tarefas modify-heavy descrevem **arquivo exato + mudança exata + critério de verificação** em vez de blocos de código completos inventados — o mesmo tratamento que os planos de referência dão a tarefas de modificação ampla. Não há código fabricado: onde o design não fornece implementação, o passo descreve a edição precisa a fazer.

---

## Decisões de produto (tomadas para este plano)

1. **Linha ANVISA (não-clínico).** A tela Saúde e o wizard "Nova Medição" **NÃO** terão julgamento clínico ("Está normal / Está alto", thresholds 60–100bpm etc.). Apenas **registram o valor + confirmação neutra** ("Anotado ✓"). Isso mantém o app fora da classificação SaMD (CLAUDE.md §11).
2. **Card "rede de apoio" sai deste plano.** O vínculo monitorado↔cuidador real e o card populado da home viram um **plano separado** → ver [`docs/2026-06-05-vinculo-cuidador-monitorado.md`](./2026-06-05-vinculo-cuidador-monitorado.md). Neste redesign, a home **não** ganha o card de rede de apoio (evita dependência de dado inexistente).

---

## Design Guidelines (referência para todas as tarefas)

Toda tela nova ou modificada **deve** seguir o conjunto abaixo.

### Princípios (não negociáveis)

| # | Princípio | Regra prática |
|---|---|---|
| 01 | Texto mínimo **15dp** no corpo | Valores/números: 22dp+. Títulos de tela: 26dp+. |
| 02 | Status = **cor + palavra + ícone** | Nunca só cor. "Tudo bem ✓", "Atenção !". |
| 03 | Toque mínimo **48dp** (a11y 64dp) | Ações primárias 56dp+. Destrutivo fora da tela principal. |
| 04 | **Linguagem cotidiana** | "Anamnese" → "Histórico médico". Sem jargão SaaS/médico. |
| 05 | **Wizards 1-pergunta-por-tela** | Anamnese, novo contato, novo alarme. |
| 06 | **Voz sempre acessível** | MicFAB flutuante em todas as telas (TTS). |
| 07 | **SOS "segure 3s" + voz** | Já existe; só refinar texto + TTS no confirm. |
| 08 | Rede de apoio visível | **Adiado** → plano separado. |

### Cores — usar SOMENTE tokens via `useColors()`

Os tokens **já existem** em `theme.config.js` (com dark mode) e são a fonte da verdade. **Não criar nada.**

| Token | Light | Uso |
|---|---|---|
| `background` | `#F4EFE5` (creme) | Fundo de telas |
| `surface` | `#FFFFFF` | Cards, tiles, inputs |
| `foreground` | `#0E1417` | Texto principal |
| `muted` | `#5B636A` | Texto secundário |
| `border` | `#D8D1C2` | Bordas (2dp nos cards grandes) |
| `primary` | `#1E4D8C` (azul profundo) | Botões, foco, ícones ativos |
| `accent` | `#C96442` (terracota) | Destaques quentes |
| `emergency` | `#D6161C` | SOS, contatos de emergência |
| `success` | `#0F8A4A` | Confirmações |
| `warning` | `#F0C24A` (**âmbar**) | Avisos (NÃO é laranja) |
| `warningDark` | `#7A5200` | Texto sobre fundo âmbar |
| `emergencyDark` | `#9E0F14` | Sombra 3D do SOS (borda inferior) |
| `onWarning` | `#5C3A0A` | Texto sobre `warning` |

Tints suaves já existem: `primaryLight`, `emergencyLight`, `successLight`, `warningLight`, `accentLight`. On-color: `onPrimary`, `onEmergency`, `onSuccess`, `onWarning`.

### Tipografia — fontes reais já carregadas

Carregadas em `app/_layout.tsx`: **`PlusJakartaSans`**, **`Fraunces-Italic`**, **`SpaceMono-Regular`**, `SpaceMono-Bold`. **Não usar Inter nem Geist Mono.**

- `PlusJakartaSans` → corpo, labels, botões
- `Fraunces-Italic` → display (nome do usuário na home)
- `SpaceMono-Regular` → valores numéricos (hora, BPM, pressão)

**Mapeamento real do `useFontSize()`** (`lib/font-size-context.tsx`). A API real é `fs.xs/sm/base/md/lg/xl/2xl/3xl/4xl` + `fs.scaled(n)`. **`fs.md` = 16**; o corpo de 15dp é **`fs.base`** (não `fs.md`):

| Papel | dp | Token real | Fonte |
|---|---|---|---|
| Display (nome) | 26–28 | `fs.scaled(28)` | Fraunces-Italic |
| Valor (hora/BPM) | 32–36 | `fs['4xl']` / `fs.scaled(36)` | SpaceMono |
| Título de tela | 26 | `fs['3xl']` | PlusJakartaSans 900 |
| Título de card | 18 | `fs.lg` | PlusJakartaSans 700 |
| Label de tile | 16 | `fs.md` | PlusJakartaSans 800 |
| **Corpo** | **15** | **`fs.base`** | PlusJakartaSans 400/600 |
| Label de campo | 13 | `fs.sm` | PlusJakartaSans 600 |
| Tab label | 13 | (fixo no tab bar) | nunca < 700 weight |

Regra: **nada que o usuário lê abaixo de 15dp (`fs.base`)**. Controlar tudo via `useFontSize()`.

### Ícones — `MaterialIcons` de `@expo/vector-icons` (já em uso)

**Não usar Lucide.** Mapa: `home`, `favorite`, `medication`, `apps`, `mic`, `warning`, `people`, `local-hospital`, `location-on`, `description`, `person`, `settings`, `help-outline`, `person-add`, `add`, `edit`, `delete`, `save`, `monitor-heart`, `water-drop`, `chevron-right`, `calendar-today`, `volume-up`, `vibration`, `share`, `check`.

### Espaçamento, radii e sombras

- **Espaçamento:** 4 (chips) · 8 (gap ícone↔texto) · 12 (pad card) · 16 (pad lateral/gap) · 20 (seções) · 24 (card grande).
- **Radii:** 8 (chips) · 12 (botões/inputs) · 16 (cards/tiles) · 18 (destaque) · 22 (SOSStrip) · 999 (badges, FAB).
- **Sombras:** card padrão `{shadowColor:'#0E1417', offset:(0,1), opacity:0.06, radius:4, elevation:1}`; SOS 3D `{borderBottomWidth:6, borderBottomColor:colors.emergencyDark, shadowColor:colors.emergency, offset:(0,6), opacity:0.35, radius:16, elevation:12}`; FAB `{shadowColor:colors.primary, offset:(0,4), opacity:0.3, radius:8, elevation:8}`.

### Linguagem (PT-BR cotidiano)

| Antes | Depois |
|---|---|
| Anamnese | Histórico médico |
| Métrica / Medição técnica | Anotar saúde / Medição |
| Frequência Cardíaca (bpm) | Batimentos do coração |
| Alarmes | Remédios |
| Menu (drawer) | Tudo |
| Trial / Provedor do plano | (texto simples; banner sai da home → settings) |

Glicose **mantém o label** "Glicose" (já familiar a quem faz exames) + auxiliar "Nível de açúcar no sangue". Todo botão/título de tela em PT-BR correto, sem inglês.

### Acessibilidade

`useAccessibility()` já existe (`isAccessibilityMode`, `a11yColors`, `a11yFontSize`, `a11ySpacing`). Toda tela reformulada **replica o branch `if (isAccessibilityMode)`** que a home já usa. Todo elemento interativo novo recebe `accessibilityLabel` em PT-BR + `accessibilityRole`.

| Token | Padrão | Acessível |
|---|---|---|
| corpo | 15dp | 20dp |
| título | 26dp | 34dp |
| toque | 48dp | 64dp |
| border | `#D8D1C2`/2dp | `#000`/2–3dp |

### Regra ANVISA — proibido julgamento clínico (decisão acima)

Na tela Saúde e no wizard de medição:
- ✅ Registrar o valor digitado, mostrar no histórico, confirmar com **"Anotado ✓"** (neutro).
- ❌ **NÃO** exibir "Está normal / Está alto / consulte seu médico".
- ❌ **NÃO** comparar com faixas (60–100bpm, ≤120, 70–99) nem colorir por status clínico.

Manter o disclaimer obrigatório do CLAUDE.md §11 onde aplicável.

---

## Reconciliação — handoff vs. código real

> Fonte: `design_handoff_vigora_b/handoff.html` (+ `analysis.jsx`, mockups). Onde o handoff diverge da realidade, o **código é a fonte da verdade**.

| Item | Afirmação do handoff | Realidade verificada | Ação |
|---|---|---|---|
| Tokens de cor | "já existem" | ✅ Confere 100% (`theme.config.js`) | Usar como está |
| Fontes | PlusJakarta/Fraunces/SpaceMono carregadas | ✅ Confere (`app/_layout.tsx`) | Usar como está |
| `useColors/useFontSize/useAccessibility` | existem | ✅ Existem | Não recriar |
| Componentes SOS, cards, animações, pickers | existem | ✅ Existem | Reusar |
| `useFontSize` — corpo 15 = `fs.md` | — | ❌ `fs.md`=16; corpo 15 = **`fs.base`** | Usar mapeamento da seção de tipografia |
| Tab bar | 5 tabs, altura 60/80, label 11/13 | ✅ Confere (`custom-tab-bar.tsx`) | Modificar p/ 4 tabs |
| `_layout.tsx` | montar MicFAB / remover SidebarMenu | `<SidebarMenu/>` na linha 41, irmão de `<Tabs>` | Trocar por `<MicFAB/>` |
| `tudo.tsx` | criar | ✅ Não existe | Criar + registrar `<Tabs.Screen name="tudo"/>` |
| Saúde "Está normal/alto" | feedback clínico | ❌ Cruza linha ANVISA | **Remover** |
| Card rede de apoio | "X te acompanhando" | ❌ Sem dado no cliente (`app-context` não conhece cuidadores) | **Fora deste plano** |

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `components/sos-strip.tsx` | Criar | Variante horizontal do SOS |
| `components/big-tile.tsx` | Criar | Tile grande da home |
| `components/mic-fab.tsx` | Criar | Microfone flutuante (TTS) |
| `components/wizard-step.tsx` | Criar | Container 1-pergunta-por-tela |
| `components/custom-tab-bar.tsx` | Modificar | 5→4 tabs, altura 86, label 13/700+, ícone 30 |
| `components/sos-countdown-dialog.tsx` | Modificar | + TTS no confirm |
| `components/alarm-card.tsx` | Modificar | Hora 36/SpaceMono, esconder "Excluir" da lista |
| `components/sidebar-menu.tsx` | Manter | Arquivo fica; só desmontar do layout |
| `app/(tabs)/_layout.tsx` | Modificar | Remover `<SidebarMenu/>`, montar `<MicFAB/>`, registrar `tudo` |
| `app/(tabs)/index.tsx` | Modificar | SOSStrip + 4 BigTiles + próximo alarme (SEM rede de apoio) |
| `app/(tabs)/health.tsx` | Modificar | "Como você está?", BigMetricRows, linguagem, SEM clínico |
| `app/(tabs)/alarms.tsx` | Modificar | "Remédios", cards maiores, Excluir fora da lista |
| `app/(tabs)/tudo.tsx` | Criar | Grid 2 col, 8 tiles (substitui o drawer) |
| `app/(tabs)/contacts.tsx` | Modificar | Título-pergunta, aviso maior, botão fullwidth |
| `app/(tabs)/anamnesis.tsx` | Modificar | "Histórico médico", wizard 3 etapas |
| `app/(tabs)/profile.tsx` | Modificar | Labels sentence-case, botão Salvar verde 56dp |
| `app/(tabs)/{ambulance,settings,help,location}.tsx` | Manter | Ajuste mínimo |
| `theme.config.js`, `hooks/use-colors`, `lib/*-context` | Não tocar | Já prontos |

> Após mudanças significativas, rodar `graphify update .` (CLAUDE.md).

---

### Task 1: Componentes base novos

São a dependência de tudo. Quatro componentes isolados, renderizáveis sozinhos.

**Files:**
- Create: `components/sos-strip.tsx`
- Create: `components/big-tile.tsx`
- Create: `components/mic-fab.tsx`
- Create: `components/wizard-step.tsx`

- [ ] **Step 1: Criar `components/sos-strip.tsx`**

Props `onPress`. Estilo: bg `colors.emergency`, radius 22, pad 18, sombra 3D (`borderBottomColor: colors.emergencyDark` + sombra SOS da seção de Design Guidelines), ícone `warning` 36 `#fff` + "SOS" PlusJakarta 32/900 + subtítulo "Segure 3 segundos para chamar ajuda" 13/700. Adicionar `accessibilityLabel="Botão de emergência. Segure três segundos para chamar ajuda."` e `accessibilityRole="button"`. Usar `useColors()` — nenhum hex hardcoded fora dos `#fff` de texto sobre emergency (ou usar `colors.onEmergency`).

- [ ] **Step 2: Criar `components/big-tile.tsx`**

Props `{ icon, iconColor, iconBg, title, subtitle, badge?, onPress }`. Container `colors.surface`, border 2dp `colors.border`, radius 18, iconWrap 58×58 (radius 16, bg `iconBg`), title 16/800 (`fs.md`), subtitle 13/600 `colors.muted`, badge opcional com bg `colors.emergency`. `accessibilityLabel` = `title`.

- [ ] **Step 3: Criar `components/mic-fab.tsx`**

Posição absoluta, `bottom = bottomOffset + insets.bottom + 12` (prop `bottomOffset`), 60×60 radius 30, bg `colors.primary`, border 3 `#fff`, sombra FAB. Ícone `mic` `colors.onPrimary`. `onPress`: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` + `Speech.speak('Diga o que você precisa', { language: 'pt-BR' })` (import `expo-speech`).

- [ ] **Step 4: Criar `components/wizard-step.tsx`**

Props `{ total, current, categoryTag, tagColor, question, children, onNext, onBack?, nextLabel?, nextDisabled? }`. Render: stepper de chips (total chips, o `current` preenchido com `tagColor`) + tag de categoria + pergunta 22/900 (`fs.scaled(22)`) + `children` + botões 56dp ("Voltar" ghost se `onBack`, "Continuar"/`nextLabel` primary). Respeitar `nextDisabled`.

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`; nenhum erro novo.

- [ ] **Step 6: Verificar render isolado em claro/escuro**

Importar cada componente numa tela de teste (ou Storybook se existir) e confirmar que renderizam sem erro nos dois temas. Critério: 4 componentes visíveis, sem warning de cor hardcoded.

- [ ] **Step 7: Commit**

```bash
git add components/sos-strip.tsx components/big-tile.tsx components/mic-fab.tsx components/wizard-step.tsx
git commit -m "feat(redesign): add base components sos-strip, big-tile, mic-fab, wizard-step"
```

---

### Task 2: Tab bar (4 itens) + `_layout.tsx`

Troca o drawer por uma tab "Tudo" e monta o MicFAB. Depende da Task 1.

**Files:**
- Modify: `components/custom-tab-bar.tsx`
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: Reduzir a tab bar para 4 itens em `components/custom-tab-bar.tsx`**

`TABS` = `Início(home, /(tabs)/)`, `Saúde(favorite, /health)`, `Remédios(medication, /alarms)`, `Tudo(apps, /tudo)`. Remover o item `Menu`/`isMenu` e qualquer chamada a `toggleMenu()`. Ajustar: `tabBarHeight` 60→**86** (a11y 80→100), `labelSize` 11→**13** (a11y 15), `iconSize` 24→**30** (a11y 34), weight do label nunca `< 700`. Manter badge de alarmes, haptics e cores existentes.

- [ ] **Step 2: Atualizar `app/(tabs)/_layout.tsx`**

Remover `<SidebarMenu />` (linha ~41). Montar `<MicFAB bottomOffset={86} />` após `<Tabs>`, dentro do `<View flex:1>`. Registrar `<Tabs.Screen name="tudo" />`. Ajustar o `tabBarHeight` local (56) para refletir 86, mantendo o padding de conteúdo coerente. Remover o import de `SidebarMenu` se ele ficar órfão (manter o arquivo do componente).

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`.

- [ ] **Step 4: Verificar navegação**

Critério: 4 tabs visíveis e navegáveis; MicFAB fala ao tocar; o menu hambúrguer desaparece sem deixar rota órfã (tocar onde ficava o menu não navega para lugar nenhum).

- [ ] **Step 5: Commit**

```bash
git add components/custom-tab-bar.tsx app/(tabs)/_layout.tsx
git commit -m "feat(redesign): 4-tab bar with Tudo, mount MicFAB, drop sidebar from layout"
```

---

### Task 3: Tela "Tudo" (antes de remover o drawer)

Substitui o conteúdo do antigo drawer. Criada antes da limpeza do drawer para não perder rotas.

**Files:**
- Create: `app/(tabs)/tudo.tsx`

- [ ] **Step 1: Criar `app/(tabs)/tudo.tsx`**

Estrutura: card de identidade (avatar 60dp, nome 16/800, telefone, badge do plano) + label "Tudo do app" + grid de 2 colunas com 8 tiles (`BigTile` ou equivalente, minHeight 110, border 2dp, container de ícone 46):
- `contacts` [`emergency`]
- `ambulance` [`emergency`]
- `location` [`success`]
- `anamnesis` [`primary`]
- `profile` [`primary`]
- `settings` [`muted`]
- `help` [`muted`]
- `invite-caregiver` [`warning`]

Cada tile navega para a rota correspondente (as mesmas rotas do antigo `MENU_ITEMS` + `profile`). Aplicar `useSafeAreaInsets()` (`paddingTop: insets.top + 12`).

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`.

- [ ] **Step 3: Verificar rotas**

Critério: as 8 rotas abrem a partir de "Tudo"; nenhuma rota do antigo `MENU_ITEMS` ficou inacessível.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/tudo.tsx
git commit -m "feat(redesign): add Tudo screen with 8 tiles replacing the drawer"
```

---

### Task 4: Home reformulada

Mantém **toda** a lógica existente (`handleSOS`, `activateSOS`, `SOSCountdownDialog`, `SOSActiveScreen`, dispatch); só troca o layout.

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Reescrever o layout do modo normal em `index.tsx`**

Preservar imports e handlers de SOS. Novo layout (de cima para baixo):
1. Header "Bom dia," + nome em Fraunces-Italic 28 (`fs.scaled(28)`) + `StatusBadge` "✓ Tudo bem".
2. `<SOSStrip onPress={handleSOS} />`.
3. Grid 2×2 de `BigTile`: Meus remédios (`warning` → `alarms`), Anotar saúde (`success` → `health`), Chamar ambulância (`primary` → `ambulance`), Avisar família (`emergency` → `contacts`).
4. Card próximo alarme (faixa âmbar 6dp à esquerda, hora em SpaceMono 22dp).
5. Aviso SAMU (manter o texto existente).

- [ ] **Step 2: Remover os elementos antigos da home**

Remover: `TrialBanner`/`ExpiredBanner` (movidos para settings — ver Task 8 follow-up), botão "Ambulância" separado, grid de 4 `statusCards`, seção "Ações Rápidas", `AdBanner`. **NÃO** adicionar card de rede de apoio. Remover imports que ficarem órfãos por essas remoções.

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`; sem imports órfãos.

- [ ] **Step 4: Verificar SOS e navegação**

Critério: tocar no `SOSStrip` abre o countdown de 3s e dispara `activateSOS`; os 4 tiles navegam; testado em claro, escuro e modo acessível.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat(redesign): rebuild home with SOSStrip + 2x2 tiles, SOS logic intact"
```

---

### Task 5: Telas de listagem (Saúde, Remédios)

**Files:**
- Modify: `app/(tabs)/health.tsx`
- Modify: `app/(tabs)/alarms.tsx`
- Modify: `components/alarm-card.tsx`

- [ ] **Step 1: Reformular `health.tsx`**

Título "Como você está?". Substituir as linhas de métrica por `BigMetricRow` (ícone 60dp + título cotidiano + ação "+ Anotar" inline). Linguagem cotidiana (ver tabela de Linguagem). Confirmação neutra **"Anotado ✓"**. **Remover qualquer julgamento clínico** ("Está normal/alto", comparação com faixas, cor por status) — regra ANVISA.

- [ ] **Step 2: Reformular `alarms.tsx` + `alarm-card.tsx`**

Título "Remédios" / "Seus remédios". Hora em 36/SpaceMono. **Tirar "Excluir" da listagem** — mover para a tela de editar, com confirmação via `AppDialog`. Card do próximo remédio com faixa âmbar "PRÓXIMO · em X horas". Botão "＋ Adicionar lembrete" fullWidth 56dp.

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`.

- [ ] **Step 4: Verificar regras**

Critério: não há mais "Excluir" na listagem de remédios; nenhum texto clínico na tela Saúde; cards atendem aos tamanhos especificados.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/health.tsx app/(tabs)/alarms.tsx components/alarm-card.tsx
git commit -m "feat(redesign): rework Saude (no clinical judgment) and Remedios listing"
```

---

### Task 6: Wizards (usar `wizard-step.tsx` + pickers existentes)

Converte formulários em fluxos de 1-pergunta-por-tela, reaproveitando pickers — nada do zero.

**Files:**
- Modify: `app/(tabs)/alarms.tsx` (fluxo Novo Alarme)
- Modify: `app/(tabs)/contacts.tsx` (fluxo Novo Contato)
- Modify: `app/(tabs)/health.tsx` (fluxo Nova Medição)
- Modify: `app/(tabs)/anamnesis.tsx` (Histórico médico)

- [ ] **Step 1: Novo Alarme (2 etapas)**

Etapa 1: hora via `@react-native-community/datetimepicker` (modo `time`) ou `wheel-picker.tsx` + chips de sugestão. Etapa 2: repetição + toggles de som/vibração. Usar `wizard-step.tsx` como container.

- [ ] **Step 2: Novo Contato (3 etapas)**

Etapa 1: grid 2×3 de relação com emoji. Etapa 2: nome + telefone (com importação via `expo-contacts`). Etapa 3: toggle WhatsApp + prévia da mensagem.

- [ ] **Step 3: Nova Medição**

Seletor de tipo (3 cards) + visor 52dp/SpaceMono + confirmação **"Anotado ✓"** (sem "normal/alto" — regra ANVISA).

- [ ] **Step 4: Histórico médico (anamnese, 3 etapas)**

Etapas: Você / Saúde / Plano. Título da tela "Histórico médico".

- [ ] **Step 5: Transições**

Slide horizontal 200ms (reanimated). Sem loops decorativos.

- [ ] **Step 6: Verificar TypeScript e UX**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`. Critério UX: cada etapa cabe na tela; pickers reaproveitados (nada do zero).

- [ ] **Step 7: Commit**

```bash
git add app/(tabs)/alarms.tsx app/(tabs)/contacts.tsx app/(tabs)/health.tsx app/(tabs)/anamnesis.tsx
git commit -m "feat(redesign): convert alarm/contact/measurement/anamnesis flows to wizards"
```

---

### Task 7: TTS de confirmação

**Files:**
- Modify: `components/sos-countdown-dialog.tsx`
- Modify: `app/(tabs)/alarms.tsx` (ao salvar)
- Modify: `app/(tabs)/contacts.tsx` (ao salvar)

- [ ] **Step 1: TTS no confirm do SOS**

Em `sos-countdown-dialog.tsx`, no ponto de confirmação: `Speech.speak('Avisando suas pessoas e ligando para o SAMU', { language: 'pt-BR' })`.

- [ ] **Step 2: TTS ao salvar alarme/contato**

Ao salvar alarme: `Speech.speak('Lembrete criado para as [hora]', { language: 'pt-BR' })`. Ao salvar contato: `Speech.speak('[Nome] adicionado como contato de emergência', { language: 'pt-BR' })`.

- [ ] **Step 3: Verificar TTS**

Critério: a fala dispara nos 3 pontos; **sem fala duplicada** (confirmar que não há outro ponto já falando a mesma frase — CLAUDE.md §8).

- [ ] **Step 4: Commit**

```bash
git add components/sos-countdown-dialog.tsx app/(tabs)/alarms.tsx app/(tabs)/contacts.tsx
git commit -m "feat(redesign): add TTS confirmation on SOS, alarm save, contact save"
```

---

### Task 8: Acessibilidade + limpeza

**Files:**
- Modify: telas novas/reformuladas (branch `isAccessibilityMode`)
- Modify: `app/(tabs)/_layout.tsx` (limpeza do drawer)
- Modify: `app/(tabs)/profile.tsx`

- [ ] **Step 1: Branch de acessibilidade nas telas novas**

Garantir o branch `if (isAccessibilityMode)` em todas as telas reformuladas (replicando o padrão da home). Adicionar `accessibilityLabel` em PT-BR + `accessibilityRole` em todo elemento interativo novo.

- [ ] **Step 2: Remover o drawer e referências órfãs**

Só depois que tudo funcionar: remover do layout o que restou do drawer e referências órfãs (manter o arquivo `sidebar-menu.tsx`). Conferir que nenhum import/variável ficou órfão.

- [ ] **Step 3: Refinar `profile.tsx`**

Labels em sentence-case. Grid de tipo sanguíneo em 4 colunas (selecionado em `emergency`). Botão "Salvar" verde (`success`) 56dp, sempre ativo.

- [ ] **Step 4: Verificação final**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`. Critério: Modo Acessibilidade funciona sobre o novo design; sem import/var órfão.

- [ ] **Step 5: Atualizar o grafo de conhecimento**

```bash
graphify update .
```

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/_layout.tsx app/(tabs)/profile.tsx app/(tabs)/
git commit -m "feat(redesign): accessibility branches, profile polish, drawer cleanup"
```

---

## Fora deste plano (plano separado)

**Card "rede de apoio" + vínculo monitorado↔cuidador real** → [`docs/2026-06-05-vinculo-cuidador-monitorado.md`](./2026-06-05-vinculo-cuidador-monitorado.md). Inclui: query no servidor (monitoring router) para cuidadores vinculados ao idoso, exposição do dado no `app-context`, card populado na home e empty-state com CTA ("Convide um familiar para te acompanhar" → `invite-caregiver`) quando não houver vínculo. Não misturar com o redesign.

**Follow-ups (não bloqueiam o redesign):**
- Mover `TrialBanner`/`ExpiredBanner` para `settings.tsx`.

---

## Self-Review

### Cobertura do design

| Requisito do design original | Task |
|---|---|
| Componentes base SOSStrip/BigTile/MicFAB/WizardStep | Task 1 |
| Tab bar 4 itens (86dp, label 13/700+) | Task 2 |
| Drawer fora do layout, MicFAB montado | Tasks 2 + 8 |
| Tela "Tudo" com 8 tiles (substitui o drawer) | Task 3 |
| Home: SOSStrip + grid 2×2 + próximo alarme, lógica SOS intacta | Task 4 |
| Saúde sem julgamento clínico (linha ANVISA) | Tasks 5 + 6 |
| Remédios: "Excluir" fora da lista, hora SpaceMono | Task 5 |
| Wizards 1-pergunta-por-tela (alarme/contato/medição/anamnese) | Task 6 |
| TTS no confirm do SOS e ao salvar | Task 7 |
| Branch `isAccessibilityMode` + `accessibilityLabel` nas telas novas | Task 8 |
| Profile: tipo sanguíneo 4 col, Salvar verde 56dp | Task 8 |
| Card rede de apoio | Fora deste plano (doc separado) |

### Varredura de placeholders

- Nenhum "TODO/TBD/implementar depois" nas tarefas.
- Passos de modificação descrevem arquivo + mudança exata + verificação (sem código fabricado, por decisão de fidelidade declarada no topo).

### Consistência de tipos/nomes

- `SOSStrip` props `{ onPress }` — usado em Task 1 (criação) e Task 4 (home).
- `BigTile` props `{ icon, iconColor, iconBg, title, subtitle, badge?, onPress }` — Task 1 e Tasks 3/4.
- `MicFAB` prop `bottomOffset` — Task 1 e Task 2 (`bottomOffset={86}`, coerente com `tabBarHeight` 86).
- `WizardStep` props — Task 1 e Task 6.
- Confirmação neutra **"Anotado ✓"** — idêntica em Tasks 5 e 6 (regra ANVISA).
- Token `fs.base` (=15dp) para corpo — consistente em todas as tarefas.
