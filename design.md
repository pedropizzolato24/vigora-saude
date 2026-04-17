# Vigora Saúde — Interface Design Plan

## Brand Identity

**App Name:** Vigora Saúde  
**Tagline:** Sua saúde, sempre protegida  
**Target Audience:** Idosos, pessoas com doenças crônicas, viajantes  
**Tone:** Confiável, acessível, tranquilizador

## Color Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `primary` | `#0066CC` | `#3399FF` | Ações principais, navegação ativa |
| `error` | `#FF0000` | `#FF4444` | Emergência, SOS, alertas críticos |
| `success` | `#22C55E` | `#4ADE80` | Confirmações, status normal |
| `warning` | `#F59E0B` | `#FBBF24` | Avisos, valores elevados |
| `background` | `#FFFFFF` | `#151718` | Fundo das telas |
| `surface` | `#F5F5F5` | `#1E2022` | Cards, painéis |
| `foreground` | `#11181C` | `#ECEDEE` | Texto principal |
| `muted` | `#687076` | `#9BA1A6` | Texto secundário |

## Typography

- **Títulos de tela:** 28px bold
- **Subtítulos / Labels de card:** 20px semibold
- **Corpo / Descrições:** 16px regular
- **Labels pequenos:** 14px regular
- **Botão SOS:** 36px bold (destaque máximo)
- **Hora de alarme:** 32px bold

## Screen List

1. **Dashboard (Home)** — Visão geral de saúde + botão SOS
2. **Alarmes** — Gerenciamento de alarmes de medicação
3. **Saúde** — Registro de métricas de saúde
4. **Configurações** — Preferências do app
5. **Contatos de Emergência** — Gerenciar contatos SOS
6. **Ficha de Anamnese** — Histórico médico pessoal
7. **Chamada de Ambulância** — Acesso rápido ao SAMU e planos
8. **Compartilhar Localização** — GPS para contatos de emergência

## Screen Details

### 1. Dashboard (Home)
**Layout:** ScrollView vertical  
**Conteúdo:**
- Header com saudação e nome do usuário
- **Botão SOS gigante** (vermelho, 200x200px, centralizado) com ícone de sirene
- Grid 2x2 de cards de status:
  - Próximo Alarme (azul)
  - Alarmes Configurados (azul)
  - Contatos de Emergência (vermelho)
  - Registros de Saúde (verde)
- Seção "Ações Rápidas" com 2 botões
- Banner amarelo de aviso sobre SAMU (192)

### 2. Alarmes
**Layout:** FlatList com modal de formulário  
**Conteúdo:**
- Header com título e botão "+"
- Lista de cards de alarme (hora grande, descrição, toggle ativo)
- Modal/Sheet de adicionar/editar alarme
- Formulário: hora, descrição, repetição, som, vibração

### 3. Saúde
**Layout:** FlatList com modal de formulário  
**Conteúdo:**
- Header com título e botão "+"
- Cards de métricas com status colorido (verde/amarelo/vermelho)
- Modal de adicionar métrica: tipo (FC/PA/Glicose), valor
- Histórico das últimas 10 métricas

### 4. Configurações
**Layout:** ScrollView com seções  
**Conteúdo:**
- Toggle de notificações
- Controle de volume de alarme (slider + botões)
- Seleção de idioma (PT/EN)
- Seção "Sobre" com versão
- Botão "Limpar Todos os Dados" (vermelho)

### 5. Contatos de Emergência
**Layout:** FlatList com modal de formulário  
**Conteúdo:**
- Header com título e botão "+"
- Cards de contato (nome, telefone, relação, ícone WhatsApp)
- Modal de adicionar/editar contato

### 6. Ficha de Anamnese
**Layout:** ScrollView com formulário  
**Conteúdo:**
- Nome, data de nascimento, gênero
- Alergias, medicamentos, doenças crônicas
- Número SUS, plano de saúde, provedor

### 7. Chamada de Ambulância
**Layout:** ScrollView  
**Conteúdo:**
- Seleção de tipo: SUS (192), Plano, Particular
- Dados pré-preenchidos da anamnese
- Botão grande "Chamar Ambulância" (vermelho)
- Instruções de segurança

### 8. Compartilhar Localização
**Layout:** ScrollView  
**Conteúdo:**
- Exibição de coordenadas atuais
- Botão "Obter Localização"
- Botão "Compartilhar via WhatsApp/SMS"
- Histórico de compartilhamentos

## Navigation Architecture

```
Root Layout (_layout.tsx)
└── Tab Navigator (5 tabs)
    ├── Dashboard (index.tsx)       — Tab: Casa
    ├── Alarmes (alarms.tsx)        — Tab: Alarme
    ├── Saúde (health.tsx)          — Tab: Coração
    ├── Configurações (settings.tsx) — Tab: Engrenagem
    └── [Menu lateral] → Contatos, Anamnese, Ambulância, Localização
```

## Key User Flows

### Flow 1: Ativar SOS
Dashboard → Pressionar botão SOS → Alert de confirmação → Enviar notificações → Mensagem de sucesso

### Flow 2: Adicionar Alarme
Aba Alarmes → Botão "+" → Preencher formulário → Salvar → Card aparece na lista

### Flow 3: Registrar Métrica
Aba Saúde → Botão "+" → Selecionar tipo → Inserir valor → Salvar → Aparece no histórico

### Flow 4: Chamar Ambulância
Menu lateral → Ambulância → Selecionar tipo → Confirmar → Abre discador

### Flow 5: Compartilhar Localização
Menu lateral → Localização → Obter GPS → Compartilhar → Link enviado

## Component Architecture

- `ScreenContainer` — SafeArea wrapper para todas as telas
- `CustomTabBar` — Barra inferior com 5 botões (Menu, Home, Alarmes, Saúde, Config)
- `SidebarMenu` — Menu lateral deslizante com overlay
- `AlarmCard` — Card reutilizável para alarmes
- `ContactCard` — Card reutilizável para contatos
- `HealthMetricCard` — Card para métricas de saúde
- `SOSButton` — Botão de emergência com haptic feedback

## Accessibility Guidelines

- Todos os botões: mínimo 48x48px
- Texto mínimo: 16px
- Contraste: WCAG AA (4.5:1 para texto normal)
- Labels descritivos em todos os elementos interativos
- Feedback tátil (haptics) em ações importantes
