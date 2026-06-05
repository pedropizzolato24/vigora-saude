# Plano de Ação — Vínculo Monitorado↔Cuidador + Card "Rede de Apoio"

> **Separado de propósito** do redesign Direção B (`docs/REDESIGN_DIRECAO_B_PLANO.md`).
> Aqui mora o trabalho de **dado/backend** que o card "X pessoas te acompanhando hoje"
> exige. É também o bloqueador de lançamento do CLAUDE.md §18 (vínculo ainda placeholder).

---

## 0. Problema

O card "rede de apoio" da home do **idoso monitorado** (`/(tabs)/index.tsx`) quer mostrar
"X pessoas te acompanhando hoje" + avatares dos cuidadores vinculados. Hoje **não há fonte
de dado no cliente**:

- `lib/app-context.tsx` (estado do idoso) **não conhece** nenhum cuidador.
- `lib/caregiver-state.ts` rastreia só a direção inversa: `linkedMonitored` = quem **o
  cuidador** monitora. O idoso não tem o espelho "quem me monitora".
- CLAUDE.md §18: o vínculo monitorado↔cuidador usa valores **placeholder** e é
  bloqueador de lançamento.

Resultado: o card é uma **feature com dependência de dado**, não um ajuste de layout.

---

## 1. Objetivo e critério de sucesso

Idoso vê, na home, quantos e quais cuidadores estão vinculados à sua conta. Quando não há
vínculo, vê um **empty-state com CTA** convidando a vincular um familiar.

**Sucesso verificável:**
1. Conta vinculada a 2 cuidadores → card mostra "2 pessoas te acompanhando" + 2 avatares.
2. Conta sem vínculo → card empty-state "Convide um familiar para te acompanhar" → abre
   `/(tabs)/invite-caregiver`.
3. Dado vem do servidor (não placeholder) e respeita JWT/escopo da conta.

---

## 2. Investigação prévia (fazer antes de codar)

- [ ] Mapear o **monitoring router** (tRPC) e o schema Drizzle do vínculo: existe tabela de
      `link` monitorado↔cuidador? Qual o estado real vs. placeholder?
- [ ] Conferir o fluxo `link` (convite código/QR/link) do CLAUDE.md §2: onde o vínculo é
      gravado e com qual status (`pending`/`active`).
- [ ] Verificar se já existe endpoint para **listar cuidadores de um monitorado** (ou só o
      inverso). Provável que falte → criar.
- [ ] Confirmar LGPD: exibir nome/avatar do cuidador ao idoso exige que o cuidador tenha
      consentido o vínculo (status `active`).

---

## 3. Passo a passo

### Fase 1 — Backend: listar cuidadores do monitorado
- Adicionar procedure no `monitoring` (ou `link`) router: `listLinkedCaregivers` → retorna
  `[{ caregiverOpenId, name, avatarUrl?, status, linkedAt }]` **apenas com `status: 'active'`**,
  escopado pela conta autenticada (JWT). Validar input/saída com Zod.
- **Verificar:** teste Vitest da procedure (auth + escopo + só ativos).

### Fase 2 — Cliente: expor no estado do idoso
- Buscar via `trpcQuery('monitoring.listLinkedCaregivers')` e guardar em `app-context`
  (ou hook dedicado `useLinkedCaregivers`), com cache offline-first (last-write-wins, §15).
- **Verificar:** estado reflete o servidor; funciona offline com último valor.

### Fase 3 — UI: card na home
- **Com vínculo:** card surface, avatares sobrepostos + "N pessoas te acompanhando hoje" +
  chevron → `contacts`/lista. Tipografia e tokens do redesign (§1 do plano de redesign).
- **Sem vínculo (empty-state):** ícone + "Convide um familiar para te acompanhar" + botão
  → `/(tabs)/invite-caregiver`.
- Inserir o card na home **após** o redesign Direção B estar entregue (posição: após o card
  de próximo alarme).
- **Verificar:** os dois estados renderizam em claro/escuro/a11y; CTA navega.

### Fase 4 — Substituir placeholders do §18
- Remover valores placeholder do vínculo; ligar o fluxo real fim-a-fim (convite →
  aceite do cuidador → status `active` → aparece na home do idoso).
- **Verificar:** ponta a ponta com 2 contas reais (1 monitorado, 1 cuidador).

---

## 4. Dependências e ordem

- **Depende do redesign** apenas para os tokens/estilo do card (Fase 3). As Fases 1–2
  (backend + dado) podem começar em paralelo ao redesign.
- Toca **backend** (router + schema) → exige revisão de segurança/LGPD (CLAUDE.md §10/§11).

---

## 5. Fora de escopo

- Push/alertas ao cuidador (já cobertos pelo `push`/`whatsapp` router e dead man's switch).
- Permissões granulares de quais dados o cuidador vê (tratar em iteração futura).
