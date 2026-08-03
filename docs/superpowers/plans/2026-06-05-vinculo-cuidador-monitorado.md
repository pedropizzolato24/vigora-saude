# Vínculo Monitorado↔Cuidador + Card "Rede de Apoio" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o idoso monitorado veja, na home, quantos e quais cuidadores estão vinculados à sua conta — com um card "X pessoas te acompanhando hoje" + avatares quando há vínculo, e um empty-state com CTA convidando a vincular um familiar quando não há.

**Architecture:** Hoje o cliente não tem fonte de dado para esse card: `lib/app-context.tsx` (estado do idoso) não conhece nenhum cuidador, e `lib/caregiver-state.ts` só rastreia a direção inversa (quem o cuidador monitora). Este plano cria um endpoint no `monitoring`/`link` router que lista os cuidadores **ativos** de um monitorado (escopado por JWT), expõe esse dado no estado do idoso (offline-first, last-write-wins), e renderiza o card na home. Por fim, substitui os valores placeholder do vínculo (bloqueador de lançamento do CLAUDE.md §18) ligando o fluxo real fim-a-fim.

**Tech Stack:** tRPC 11 + Drizzle ORM + MySQL (Railway), Zod (validação in/out), JWT (escopo de conta), `trpcQuery` no cliente, Context API + `useReducer` (`lib/app-context.tsx`), Vitest (teste da procedure).

**Spec:** [`docs/superpowers/specs/2026-06-01-caregiver-invite-link-design.md`](./superpowers/specs/2026-06-01-caregiver-invite-link-design.md) — fluxo de convite/vínculo relacionado.

> **Premissa de fidelidade (decisão explícita — CLAUDE.md §1):** Esta é uma **reescrita de formato** de um plano de produto de alto nível para o padrão `docs/superpowers/plans/`. As tarefas preservam verbatim o material concreto do plano original (forma de retorno, regras de escopo/LGPD, critérios de verificação). A Task 0 (investigação) deve ser feita **antes** de codar e determina os nomes reais de tabela/coluna/router — por isso a Task 1 mostra a **forma** da procedure (assinatura e shape de retorno, que são definidos pelo plano) e marca como `<<...>>` os nomes que a investigação confirma, em vez de fabricar um schema que pode não existir.

---

## ✅ Investigação (Task 0) — CONCLUÍDA em 2026-06-06 — LEIA PRIMEIRO

> **Resultado: o backend já existe. O plano encolheu para ~1 tarefa de UI.**
> **Não rode as Tasks 0 e 1 — pule direto para a Task 3.** Tasks 0/1/4 abaixo ficam
> mantidas só como histórico; as caixas refletem o estado real apurado.

**O que a investigação (read-only, sem código) encontrou:**

| Item | Situação real | Onde |
|---|---|---|
| Router de vínculo | Registrado como **`link`** (não `monitoring`) | `server/routers.ts:217` |
| Procedure "listar cuidadores do monitorado" | **JÁ EXISTE: `link.getMyCaregivers`** — monitored-only, escopado por `ctx.user.openId` (JWT), só vínculos `active` | `server/routers-links.ts:223-237` |
| Query DB | `getActiveCaregiversForMonitored(monitoredOpenId)` — filtra `status='active'` | `server/db-links.ts:128-140` |
| Tabela/schema | `caregiverLinks` (cols: `caregiverOpenId`, `monitoredOpenId`, `status` 'active'/'revoked', `method`, `displayName`, `relationship`, `createdAt`, `revokedAt`) | `drizzle/schema.ts` |
| Hook no cliente | **JÁ FUNCIONA: `trpc.link.getMyCaregivers.useQuery()`** (já usado na tela do monitorado) | `app/(tabs)/invite-caregiver.tsx:47` |
| Consentimento/LGPD | Vínculo só vira `active` por ação deliberada (redeem/accept); revogável (Art. 18). Já implementado. | `server/routers-links.ts` |
| §18 "placeholder" | **Desatualizado** — o vínculo está implementado fim-a-fim (invite/redeem/accept/revoke, rate-limit, LGPD/ANVISA) | — |

**Shape REAL retornado por `link.getMyCaregivers`** (use ESTE — ignore o `{ name, avatarUrl }` da Task 1):
```ts
Array<{
  caregiverOpenId: string;
  caregiverName: string | null;   // NÃO há avatarUrl — derivar a inicial do nome
  relationship: string | null;
  linkedAt: number;               // epoch ms
}>
```

**Caminho re-escopado (o que falta DE VERDADE):**

- ~~**Task 0** (investigação)~~ → **FEITA** (esta seção).
- ~~**Task 1** (criar procedure backend)~~ → **JÁ EXISTE** (`link.getMyCaregivers`). Opcional: um teste Vitest cobrindo "só `active` + escopo por JWT" se ainda não houver — **não bloqueia a UI**.
- **Task 2** (expor no cliente) → **quase resolvida**: a home é um componente React e pode chamar `trpc.link.getMyCaregivers.useQuery()` direto (como `invite-caregiver.tsx` faz). `useQuery` já cacheia — **não** é preciso plumbing em `app-context`/offline-first a menos que se queira cache offline persistente. Reduz a Task 2 a "usar o hook na home".
- **Task 3** (card na home) → **É O TRABALHO PRINCIPAL E ÚNICO.** Adicionar o card "rede de apoio" em `app/(tabs)/index.tsx` (modo normal + branch `isAccessibilityMode`), **após** o card "próximo remédio" (PR #37 já entregou a home reformulada), consumindo `trpc.link.getMyCaregivers.useQuery()`:
  - **Com vínculo:** card `colors.surface` + avatares (inicial do `caregiverName`) sobrepostos + "N pessoa(s) te acompanhando" + chevron → `/(tabs)/invite-caregiver`.
  - **Sem vínculo (empty-state):** ícone `people` + "Convide um familiar para te acompanhar" + botão → `/(tabs)/invite-caregiver`.
  - Só tokens do tema + fontes da marca; `accessibilityLabel`/`role` em tudo. Tratar loading/erro do `useQuery` discretamente (não quebrar a home se offline).
- **Task 4** (placeholders §18) → reduz a **verificação**: confirmar que não há placeholder no cliente e **atualizar a `CLAUDE.md §18`** (remover "usando valores placeholder") se confirmado. A verificação ponta-a-ponta (2 contas reais) continua válida como teste manual.

**▶ PRÓXIMA AÇÃO AO RETOMAR:** começar pela **Task 3** em `app/(tabs)/index.tsx`, reutilizando `trpc.link.getMyCaregivers.useQuery()`. É uma única unidade de implementação — pode ser feita **inline** (não precisa de subagentes). `pnpm check` + `pnpm test` ao final; verificação visual num device fica para você.

---

## Problema

O card "rede de apoio" da home do idoso monitorado (`app/(tabs)/index.tsx`) quer mostrar "X pessoas te acompanhando hoje" + avatares dos cuidadores vinculados. Hoje **não há fonte de dado no cliente**:

- `lib/app-context.tsx` (estado do idoso) **não conhece** nenhum cuidador.
- `lib/caregiver-state.ts` rastreia só a direção inversa: `linkedMonitored` = quem **o cuidador** monitora. O idoso não tem o espelho "quem me monitora".
- CLAUDE.md §18: o vínculo monitorado↔cuidador usa valores **placeholder** e é bloqueador de lançamento.

Resultado: o card é uma **feature com dependência de dado**, não um ajuste de layout.

**Critério de sucesso verificável:**
1. Conta vinculada a 2 cuidadores → card mostra "2 pessoas te acompanhando" + 2 avatares.
2. Conta sem vínculo → card empty-state "Convide um familiar para te acompanhar" → abre `/(tabs)/invite-caregiver`.
3. Dado vem do servidor (não placeholder) e respeita JWT/escopo da conta.

---

## Dependências e ordem

- **Depende do redesign** ([`docs/2026-06-05-redesign-completo.md`](./2026-06-05-redesign-completo.md)) apenas para os tokens/estilo do card (Task 3). As Tasks 1–2 (backend + dado) podem começar **em paralelo** ao redesign.
- Toca **backend** (router + schema) → exige revisão de segurança/LGPD (CLAUDE.md §10/§11): exibir nome/avatar do cuidador ao idoso só é permitido para vínculo com `status: 'active'` (cuidador consentiu).

---

### Task 0: Investigação prévia (fazer antes de codar)

Sem código. Confirma os nomes reais de tabela/coluna/router e o estado real vs. placeholder. Os resultados alimentam a Task 1.

**Files:**
- Nenhum — apenas leitura do código do servidor.

- [ ] **Step 1: Mapear o vínculo no backend**

Mapear o **monitoring router** (tRPC) e o schema Drizzle do vínculo: existe tabela de `link` monitorado↔cuidador? Qual é o estado real vs. placeholder? Anotar o nome exato da tabela e das colunas (`caregiverOpenId`/`monitoredOpenId`/`status`/`linkedAt` ou equivalentes).

- [ ] **Step 2: Conferir o fluxo de convite**

Conferir o fluxo `link` (convite código/QR/link) do CLAUDE.md §2: onde o vínculo é gravado e com qual status (`pending`/`active`).

- [ ] **Step 3: Verificar endpoint existente**

Verificar se já existe endpoint para **listar cuidadores de um monitorado** (ou só o inverso). Provável que falte → será criado na Task 1.

- [ ] **Step 4: Confirmar requisito LGPD**

Confirmar: exibir nome/avatar do cuidador ao idoso exige que o cuidador tenha consentido o vínculo (`status: 'active'`). Registrar essa regra para aplicar na Task 1.

- [ ] **Step 5: Registrar achados**

Anotar no topo da Task 1 (ou num comentário) os nomes reais encontrados, substituindo os marcadores `<<...>>`. Critério: você consegue nomear a tabela, as colunas e o router de destino sem adivinhar.

---

### Task 1: Backend — listar cuidadores do monitorado

Cria a procedure que a home vai consumir. Usar os nomes reais confirmados na Task 0 no lugar dos `<<...>>`.

**Files:**
- Modify: `server/` — router `monitoring` (ou `link`, conforme Task 0)
- Test: `tests/` — teste Vitest da procedure

- [ ] **Step 1: Escrever o teste da procedure (TDD)**

Cobrir: (a) retorna apenas vínculos `status: 'active'`; (b) escopo por conta autenticada (JWT) — não vaza cuidadores de outra conta; (c) shape de retorno correto. Forma do item esperado:

```ts
// shape de cada item retornado por listLinkedCaregivers
{
  caregiverOpenId: string;
  name: string;
  avatarUrl?: string;
  status: 'active';
  linkedAt: number;
}
```

- [ ] **Step 2: Rodar o teste para confirmar falha**

```bash
pnpm test -- tests/<<nome-do-teste>>.test.ts
```

Esperado: FAIL — procedure `listLinkedCaregivers` ainda não existe.

- [ ] **Step 3: Implementar a procedure**

Adicionar `listLinkedCaregivers` ao router confirmado na Task 0. Comportamento (definido pelo plano):
- Query na tabela de vínculo `<<link_table>>` filtrando por `<<monitoredOpenId>> = ctx.user.openId` (do JWT) **e** `status = 'active'`.
- Mapear para o shape do Step 1 (join com a tabela de usuários para `name`/`avatarUrl`).
- Validar a saída com `z.array(...)` (Zod) seguindo o shape do Step 1. Sem input sensível além do contexto autenticado.

- [ ] **Step 4: Rodar o teste para confirmar que passa**

```bash
pnpm test -- tests/<<nome-do-teste>>.test.ts
```

Esperado: PASS — auth + escopo + só ativos.

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`.

- [ ] **Step 6: Commit**

```bash
git add server/ tests/
git commit -m "feat(monitoring): add listLinkedCaregivers procedure (active-only, JWT-scoped)"
```

---

### Task 2: Cliente — expor cuidadores no estado do idoso

**Files:**
- Modify: `lib/app-context.tsx` (ou Create: `hooks/use-linked-caregivers.ts`)

- [ ] **Step 1: Buscar e armazenar os cuidadores vinculados**

Buscar via `trpcQuery('monitoring.listLinkedCaregivers')` e guardar no estado do idoso — em `app-context` ou num hook dedicado `useLinkedCaregivers`. Aplicar cache offline-first com last-write-wins por `dataUpdatedAt` (CLAUDE.md §15), igual ao restante do cloud sync.

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`.

- [ ] **Step 3: Verificar comportamento**

Critério: o estado reflete o servidor quando online; funciona offline exibindo o último valor conhecido.

- [ ] **Step 4: Commit**

```bash
git add lib/app-context.tsx hooks/use-linked-caregivers.ts
git commit -m "feat(monitoring): expose linked caregivers in monitored state (offline-first)"
```

---

### Task 3: UI — card "rede de apoio" na home

Depende da entrega do redesign (tokens/estilo) e da Task 2 (dado). Inserir o card **após** o card de próximo alarme da home reformulada.

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Estado COM vínculo**

Card `colors.surface`: avatares sobrepostos + "N pessoas te acompanhando hoje" + chevron → `contacts` (ou lista). Tipografia e tokens do redesign (Design Guidelines de [`docs/2026-06-05-redesign-completo.md`](./2026-06-05-redesign-completo.md)).

- [ ] **Step 2: Estado SEM vínculo (empty-state)**

Ícone + "Convide um familiar para te acompanhar" + botão → `/(tabs)/invite-caregiver`.

- [ ] **Step 3: Verificar render e navegação**

Critério: os dois estados renderizam em claro/escuro/modo acessível; o CTA do empty-state navega para `invite-caregiver`.

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: apenas o erro pré-existente em `storageProxy.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat(monitoring): add support-network card with linked/empty states to home"
```

---

### Task 4: Substituir placeholders do vínculo (CLAUDE.md §18)

Fecha o bloqueador de lançamento ligando o fluxo real fim-a-fim.

**Files:**
- Modify: arquivos do fluxo de vínculo identificados na Task 0 (cliente + servidor)

- [ ] **Step 1: Remover os valores placeholder**

Remover os valores placeholder do vínculo e ligar o fluxo real: convite → aceite do cuidador → `status: 'active'` → aparece na home do idoso (via Tasks 1–3).

- [ ] **Step 2: Verificação ponta a ponta**

Testar com 2 contas reais (1 monitorado, 1 cuidador): o cuidador aceita o convite, o status vira `active`, e o card da home do idoso passa a mostrar o cuidador. Critério: nenhum placeholder restante; o card reflete o vínculo real.

- [ ] **Step 3: Atualizar o grafo de conhecimento**

```bash
graphify update .
```

- [ ] **Step 4: Commit**

```bash
git add server/ lib/ app/
git commit -m "feat(monitoring): wire real caregiver link end-to-end, remove placeholders"
```

---

## Fora de escopo

- Push/alertas ao cuidador (já cobertos pelo `push`/`whatsapp` router e pelo dead man's switch).
- Permissões granulares de quais dados o cuidador vê (tratar em iteração futura).

---

## Self-Review

### Cobertura do plano original

| Requisito do plano original | Task |
|---|---|
| Investigação do schema/router de vínculo antes de codar | Task 0 |
| Backend: `listLinkedCaregivers` (active-only, JWT-scoped, Zod) | Task 1 |
| Teste da procedure (auth + escopo + só ativos) | Task 1 |
| Cliente: expor cuidadores no estado do idoso (offline-first) | Task 2 |
| UI: card com vínculo (avatares + "N pessoas...") | Task 3 |
| UI: empty-state com CTA → `invite-caregiver` | Task 3 |
| Substituir placeholders do §18 (fluxo real fim-a-fim) | Task 4 |
| Verificação ponta a ponta com 2 contas reais | Task 4 |
| Push/alertas e permissões granulares | Fora de escopo |

### Varredura de placeholders

- Os marcadores `<<...>>` na Task 1 são **intencionais**: representam nomes reais que a Task 0 confirma antes de codar. Não são placeholders de conteúdo de plano — a forma da procedure e do retorno está totalmente especificada.
- Nenhum "TODO/TBD/implementar depois" como conteúdo de passo.

### Consistência de tipos/nomes

- `listLinkedCaregivers` — nome idêntico em Task 1 (servidor), Task 2 (`trpcQuery('monitoring.listLinkedCaregivers')`) e Task 4.
- Shape de retorno `{ caregiverOpenId, name, avatarUrl?, status: 'active', linkedAt }` — definido em Task 1 Step 1 e consumido sem divergência em Tasks 2–3.
- Regra `status: 'active'` — consistente entre Task 0 (LGPD), Task 1 (query) e Task 4 (fluxo real).
