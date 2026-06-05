# Plano de Ação — Redesign "Direção B (Repensada)"

> Fonte: `design_handoff_vigora_b/handoff.html` (+ `analysis.jsx`, mockups).
> Este plano foi **conferido contra o código real** do repositório. Onde o handoff
> diverge da realidade, o **código é a fonte da verdade** e as correções estão na
> seção [2. Reconciliação](#2-reconciliação--handoff-vs-código-real).

---

## 0. Resumo executivo

A Direção B reestrutura hierarquia e interação para o público real — **idosos (60+) e
pessoas com doenças crônicas**. O trabalho é majoritariamente de **layout e linguagem**,
não de lógica nova: tema de cores, fontes, hooks de acessibilidade, countdown do SOS,
haptics, TTS, pickers e animações **já existem e funcionam**.

**Decisões de produto tomadas para este plano:**

1. **Linha ANVISA (não-clínico).** A tela Saúde e o wizard "Nova Medição" **NÃO** terão
   julgamento clínico ("Está normal / Está alto", thresholds 60–100bpm etc.). Apenas
   **registram o valor + confirmação neutra** ("Anotado ✓"). Isso mantém o app fora da
   classificação SaMD (CLAUDE.md §11).
2. **Card "rede de apoio" sai deste plano.** O vínculo monitorado↔cuidador real e o card
   populado da home viram um **plano separado** → ver `docs/VINCULO_CUIDADOR_PLANO.md`.
   Neste redesign, a home **não** ganha o card de rede de apoio (evita dependência de
   dado inexistente).

---

## 1. Diretrizes do novo design

Toda tela nova ou modificada **deve** seguir o conjunto abaixo.

### 1.1 Princípios (não negociáveis)

| # | Princípio | Regra prática |
|---|---|---|
| 01 | Texto mínimo **15dp** no corpo | Valores/números: 22dp+. Títulos de tela: 26dp+. |
| 02 | Status = **cor + palavra + ícone** | Nunca só cor. "Tudo bem ✓", "Atenção !". |
| 03 | Toque mínimo **48dp** (a11y 64dp) | Ações primárias 56dp+. Destrutivo fora da tela principal. |
| 04 | **Linguagem cotidiana** | "Anamnese" → "Histórico médico". Sem jargão SaaS/médico. |
| 05 | **Wizards 1-pergunta-por-tela** | Anamnese, novo contato, novo alarme. |
| 06 | **Voz sempre acessível** | MicFAB flutuante em todas as telas (TTS). |
| 07 | **SOS "segure 3s" + voz** | Já existe; só refinar texto + TTS no confirm. |
| 08 | Rede de apoio visível | **Adiado** → plano separado (ver §0/§5). |

### 1.2 Cores — usar SOMENTE tokens via `useColors()`

Os tokens **já existem** em `theme.config.js` (com dark mode) e são a fonte da verdade.
**Não criar nada.** Valores:

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

Tints suaves já existem: `primaryLight`, `emergencyLight`, `successLight`, `warningLight`,
`accentLight`. On-color: `onPrimary`, `onEmergency`, `onSuccess`, `onWarning`.

### 1.3 Tipografia — fontes reais já carregadas

Carregadas em `app/_layout.tsx`: **`PlusJakartaSans`**, **`Fraunces-Italic`**,
**`SpaceMono-Regular`**, `SpaceMono-Bold`. **Não usar Inter nem Geist Mono.**

- `PlusJakartaSans` → corpo, labels, botões
- `Fraunces-Italic` → display (nome do usuário na home)
- `SpaceMono-Regular` → valores numéricos (hora, BPM, pressão)

**⚠️ CORREÇÃO ao handoff — mapeamento real do `useFontSize()`** (`lib/font-size-context.tsx`).
A API real é `fs.xs/sm/base/md/lg/xl/2xl/3xl/4xl` + `fs.scaled(n)`. O handoff escreve
"corpo 15 = `fs.md`", mas **`fs.md` = 16**; o corpo de 15dp é **`fs.base`**:

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

### 1.4 Ícones — `MaterialIcons` de `@expo/vector-icons` (já em uso)

**Não usar Lucide.** Mapa: `home`, `favorite`, `medication`, `apps`, `mic`, `warning`,
`people`, `local-hospital`, `location-on`, `description`, `person`, `settings`,
`help-outline`, `person-add`, `add`, `edit`, `delete`, `save`, `monitor-heart`,
`water-drop`, `chevron-right`, `calendar-today`, `volume-up`, `vibration`, `share`, `check`.

### 1.5 Espaçamento, radii e sombras

- **Espaçamento:** 4 (chips) · 8 (gap ícone↔texto) · 12 (pad card) · 16 (pad lateral/gap) ·
  20 (seções) · 24 (card grande).
- **Radii:** 8 (chips) · 12 (botões/inputs) · 16 (cards/tiles) · 18 (destaque) · 22 (SOSStrip) ·
  999 (badges, FAB).
- **Sombras:** card padrão `{shadowColor:'#0E1417', offset:(0,1), opacity:0.06, radius:4, elevation:1}`;
  SOS 3D `{borderBottomWidth:6, borderBottomColor:colors.emergencyDark, shadowColor:colors.emergency, offset:(0,6), opacity:0.35, radius:16, elevation:12}`;
  FAB `{shadowColor:colors.primary, offset:(0,4), opacity:0.3, radius:8, elevation:8}`.

### 1.6 Linguagem (PT-BR cotidiano)

| Antes | Depois |
|---|---|
| Anamnese | Histórico médico |
| Métrica / Medição técnica | Anotar saúde / Medição |
| Frequência Cardíaca (bpm) | Batimentos do coração |
| Alarmes | Remédios |
| Menu (drawer) | Tudo |
| Trial / Provedor do plano | (texto simples; banner sai da home → settings) |

Glicose **mantém o label** "Glicose" (já familiar a quem faz exames) + auxiliar
"Nível de açúcar no sangue". Todo botão/título de tela em PT-BR correto, sem inglês.

### 1.7 Acessibilidade

`useAccessibility()` já existe (`isAccessibilityMode`, `a11yColors`, `a11yFontSize`,
`a11ySpacing`). Toda tela reformulada **replica o branch `if (isAccessibilityMode)`** que a
home já usa. Todo elemento interativo novo recebe `accessibilityLabel` em PT-BR + `accessibilityRole`.

| Token | Padrão | Acessível |
|---|---|---|
| corpo | 15dp | 20dp |
| título | 26dp | 34dp |
| toque | 48dp | 64dp |
| border | `#D8D1C2`/2dp | `#000`/2–3dp |

### 1.8 Regra ANVISA — **proibido julgamento clínico** (decisão §0.1)

Na tela Saúde e no wizard de medição:
- ✅ Registrar o valor digitado, mostrar no histórico, confirmar com **"Anotado ✓"** (neutro).
- ❌ **NÃO** exibir "Está normal / Está alto / consulte seu médico".
- ❌ **NÃO** comparar com faixas (60–100bpm, ≤120, 70–99) nem colorir por status clínico.

Manter o disclaimer obrigatório do CLAUDE.md §11 onde aplicável.

---

## 2. Reconciliação — handoff vs. código real

| Item | Afirmação do handoff | Realidade verificada | Ação |
|---|---|---|---|
| Tokens de cor | "já existem" | ✅ Confere 100% (`theme.config.js`) | Usar como está |
| Fontes | PlusJakarta/Fraunces/SpaceMono carregadas | ✅ Confere (`app/_layout.tsx`) | Usar como está |
| `useColors/useFontSize/useAccessibility` | existem | ✅ Existem | Não recriar |
| Componentes SOS, cards, animações, pickers | existem | ✅ Existem | Reusar |
| `useFontSize` — corpo 15 = `fs.md` | — | ❌ `fs.md`=16; corpo 15 = **`fs.base`** | Usar mapeamento §1.3 |
| Tab bar | 5 tabs, altura 60/80, label 11/13 | ✅ Confere (`custom-tab-bar.tsx`) | Modificar p/ 4 tabs |
| `_layout.tsx` | montar MicFAB / remover SidebarMenu | `<SidebarMenu/>` na linha 41, irmão de `<Tabs>` | Trocar por `<MicFAB/>` |
| `tudo.tsx` | criar | ✅ Não existe | Criar + registrar `<Tabs.Screen name="tudo"/>` |
| Saúde "Está normal/alto" | feedback clínico | ❌ Cruza linha ANVISA | **Remover** (§1.8) |
| Card rede de apoio | "X te acompanhando" | ❌ Sem dado no cliente (`app-context` não conhece cuidadores) | **Fora deste plano** (§5) |

---

## 3. Mapa de arquivos

```
components/
  custom-tab-bar.tsx     MODIFICAR  5→4 tabs, altura 86, label 13/700+, ícone 30
  sos-countdown-dialog.tsx MODIFICAR  + TTS no confirm
  alarm-card.tsx         MODIFICAR  hora 36/SpaceMono, esconder "Excluir" da lista
  sos-strip.tsx          CRIAR      variante horizontal do SOS
  big-tile.tsx           CRIAR      tile grande da home
  mic-fab.tsx            CRIAR      microfone flutuante (TTS)
  wizard-step.tsx        CRIAR      container 1-pergunta-por-tela
  sidebar-menu.tsx       MANTER     arquivo fica; só desmontar do layout

app/(tabs)/
  _layout.tsx            MODIFICAR  remover <SidebarMenu/>, montar <MicFAB/>, registrar tudo
  index.tsx              MODIFICAR  SOSStrip + 4 BigTiles + próximo alarme (SEM rede de apoio)
  health.tsx             MODIFICAR  "Como você está?", BigMetricRows, linguagem, SEM clínico
  alarms.tsx             MODIFICAR  "Remédios", cards maiores, Excluir fora da lista
  tudo.tsx               CRIAR      grid 2 col, 8 tiles (substitui o drawer)
  contacts.tsx           MODIFICAR  título-pergunta, aviso maior, botão fullwidth
  anamnesis.tsx          MODIFICAR  "Histórico médico", wizard 3 etapas
  profile.tsx            MODIFICAR  labels sentence-case, botão Salvar verde 56dp
  ambulance/settings/help/location  MANTER (ajuste mínimo)

theme.config.js · hooks/use-colors · lib/*-context  JÁ PRONTOS — não tocar
```

---

## 4. Passo a passo (ordem obrigatória)

> Cada fase tem **critério de verificação**. Não avançar sem ele.
> Rodar `graphify update .` após mudanças significativas (CLAUDE.md).

### Fase 1 — Componentes base novos
Criar `big-tile.tsx`, `sos-strip.tsx`, `mic-fab.tsx`, `wizard-step.tsx`. São dependência de tudo.
- `sos-strip.tsx`: props `onPress`; bg `colors.emergency`, radius 22, pad 18, sombra 3D (`colors.emergencyDark`),
  ícone `warning` 36 #fff + "SOS" PlusJakarta 32/900 + "Segure 3 segundos para chamar ajuda" 13/700;
  `accessibilityLabel`.
- `big-tile.tsx`: props `icon, iconColor, iconBg, title, subtitle, badge?, onPress`; container surface,
  border 2dp `colors.border`, radius 18, iconWrap 58×58, title 16/800, subtitle 13/600 muted, badge emergency.
- `mic-fab.tsx`: absolute, `bottom = bottomOffset + insets.bottom + 12`, 60×60 radius 30, bg primary,
  border 3 #fff, sombra FAB; `onPress`: `Haptics.impactAsync(Medium)` + `Speech.speak('Diga o que você precisa', {language:'pt-BR'})`.
- `wizard-step.tsx`: props `total, current, categoryTag, tagColor, question, children, onNext, onBack?, nextLabel?, nextDisabled?`; stepper de chips + pergunta 22/900 + botões 56dp.
- **Verificar:** componentes renderizam isolados em modo claro/escuro, sem erro de TS novo.

### Fase 2 — Tab bar (4 itens) + `_layout.tsx`
- `custom-tab-bar.tsx`: `TABS` = `Início(home,/(tabs)/)`, `Saúde(favorite,/health)`,
  `Remédios(medication,/alarms)`, `Tudo(apps,/tudo)`. Remover item `Menu`/`isMenu` e `toggleMenu()`.
  `tabBarHeight` 60→**86** (a11y 80→100), `labelSize` 11→**13** (a11y 15), `iconSize` 24→**30** (a11y 34),
  weight nunca < 700. Manter badge de alarmes, haptics e cores.
- `_layout.tsx`: remover `<SidebarMenu />` (linha 41), montar `<MicFAB bottomOffset={86} />` após `<Tabs>`
  dentro do `<View flex:1>`; registrar `<Tabs.Screen name="tudo" />`; ajustar `tabBarHeight` local (56) para
  refletir 86 (manter padding de conteúdo coerente).
- **Verificar:** 4 tabs visíveis e navegáveis; MicFAB fala ao tocar; menu hambúrguer some sem rota órfã.

### Fase 3 — Tela "Tudo" (antes de remover o drawer)
- `app/(tabs)/tudo.tsx`: card de identidade (avatar 60dp, nome 16/800, telefone, badge plano) +
  label "Tudo do app" + grid 2 col, 8 tiles (minHeight 110, border 2dp, ícone-container 46):
  `contacts[emergency]`, `ambulance[emergency]`, `location[success]`, `anamnesis[primary]`,
  `profile[primary]`, `settings[muted]`, `help[muted]`, `invite-caregiver[warning]`.
- **Verificar:** todas as 8 rotas abrem a partir de "Tudo" (mesmas rotas do antigo `MENU_ITEMS` + profile).

### Fase 4 — Home reformulada
- `index.tsx` (modo normal): manter **toda** a lógica (`handleSOS`, `activateSOS`,
  `SOSCountdownDialog`, `SOSActiveScreen`, dispatch). Novo layout:
  1. Header "Bom dia," + nome Fraunces-Italic 28 + StatusBadge "✓ Tudo bem".
  2. `<SOSStrip onPress={handleSOS} />`.
  3. Grid 2×2 BigTile: Meus remédios(warning→alarms), Anotar saúde(success→health),
     Chamar ambulância(primary→ambulance), Avisar família(emergency→contacts).
  4. Card próximo alarme (faixa âmbar 6dp, hora SpaceMono 22dp).
  5. Aviso SAMU (manter).
  - **REMOVER:** TrialBanner/ExpiredBanner (mover p/ settings), botão Ambulância separado,
    grid de 4 statusCards, "Ações Rápidas", AdBanner. **NÃO** adicionar card de rede de apoio.
- **Verificar:** SOSStrip abre o countdown 3s e dispara `activateSOS`; tudo navega; claro+escuro+a11y OK.

### Fase 5 — Telas de listagem (Saúde, Remédios)
- `health.tsx`: título "Como você está?"; `BigMetricRow` (ícone 60dp + título + "+ Anotar" inline);
  linguagem cotidiana; **confirmação neutra "Anotado ✓"**, **sem julgamento clínico** (§1.8).
- `alarms.tsx` + `alarm-card.tsx`: "Remédios"/"Seus remédios"; hora 36/SpaceMono; **"Excluir" sai da lista**
  (vai p/ tela de editar, com diálogo de confirmação via `AppDialog`); card do próximo com faixa âmbar
  "PRÓXIMO · em X horas"; botão "＋ Adicionar lembrete" fullWidth 56dp.
- **Verificar:** não há mais "Excluir" na listagem; nenhum texto clínico na Saúde; cards ≥ specs.

### Fase 6 — Wizards (usar `wizard-step.tsx` + pickers existentes)
- **Novo Alarme (2 etapas):** hora via `@react-native-community/datetimepicker` (modo `time`) ou
  `wheel-picker.tsx` + chips de sugestão; etapa 2 repetição + toggles som/vibração.
- **Novo Contato (3 etapas):** grid 2×3 relação com emoji → nome+telefone (importar via `expo-contacts`)
  → toggle WhatsApp + prévia da mensagem.
- **Nova Medição:** seletor de tipo (3 cards) + visor 52dp/SpaceMono + **"Anotado ✓"** (sem normal/alto).
- **Histórico médico (anamnese, 3 etapas):** Você / Saúde / Plano.
- Transição: slide horizontal 200ms (reanimated), sem loops decorativos.
- **Verificar:** cada etapa cabe na tela; pickers reaproveitados (nada do zero); abandono reduzido.

### Fase 7 — TTS de confirmação
- SOS confirm: `Speech.speak('Avisando suas pessoas e ligando para o SAMU', {language:'pt-BR'})`.
- Ao salvar: "Lembrete criado para as [hora]" / "[Nome] adicionado como contato de emergência".
- **Verificar:** fala dispara nos 3 pontos; sem fala duplicada.

### Fase 8 — Acessibilidade + limpeza
- Garantir branch `isAccessibilityMode` nas telas novas; `accessibilityLabel` em todo elemento novo.
- Remover o drawer do layout e referências órfãs **só depois** que tudo funcionar (manter o arquivo).
- `profile.tsx`: labels sentence-case, grid tipo sanguíneo 4 col (selecionado emergency), botão Salvar verde 56dp sempre ativo.
- **Verificar:** Modo Acessibilidade funciona sobre o novo design; sem import/var órfão; TS sem erro novo
  (exceto o pré-existente em `storageProxy.ts`).

---

## 5. Fora deste plano (plano separado)

**Card "rede de apoio" + vínculo monitorado↔cuidador real** → `docs/VINCULO_CUIDADOR_PLANO.md`.
Inclui: query no servidor (monitoring router) para cuidadores vinculados ao idoso, exposição do dado no
`app-context`, card populado na home e **empty-state com CTA** ("Convide um familiar para te acompanhar"
→ `invite-caregiver`) quando não houver vínculo. Não misturar com o redesign.

---

## 6. Checklist de entrega

**Componentes novos:** `sos-strip` · `big-tile` · `mic-fab` · `wizard-step`.
**Modificações:** tab bar 4 tabs/86/13+700 · `_layout` (drawer fora, MicFAB dentro, tudo registrado) ·
home reformulada com lógica SOS intacta · alarms "Remédios"/Excluir fora · health linguagem **sem clínico** ·
anamnese wizard 3 etapas · sos-countdown TTS.
**Telas novas:** `tudo.tsx` (8 tiles).
**Qualidade:** corpo ≥ 15dp (`fs.base`) · fontes PlusJakarta/Fraunces/SpaceMono · ícones MaterialIcons ·
warning âmbar + texto `warningDark` · testado iPhone SE (375pt) · SOS countdown abre no SOSStrip ·
TTS no confirm SOS · `accessibilityLabel` nos novos · Modo Acessibilidade OK · drawer sem órfãos ·
**nenhuma avaliação clínica de métrica (linha ANVISA)**.

---

## 7. Follow-ups (não bloqueiam o redesign)

- Mover TrialBanner/ExpiredBanner para `settings.tsx`.
- `graphify update .` ao final.
