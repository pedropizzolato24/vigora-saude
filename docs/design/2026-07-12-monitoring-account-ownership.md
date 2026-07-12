# Spec: Posse do monitoramento por conta (openId), não por dispositivo (deviceId)

**Data:** 2026-07-12
**Branch:** claude/login-loop-bug-9oevus (doc apenas; implementação será local)
**Status:** Aprovado — decisões em aberto resolvidas (ver seção final)

---

## Contexto

O bug do loop de login (PR #56) expôs um problema estrutural mais profundo. Ao
**trocar de conta no mesmo aparelho** (ex.: de uma conta "monitorado" para uma
"cuidador"), o app entrava em loop de login. A correção do PR #56 fez o sintoma
(logout) parar, mas **não** resolveu a raiz: dois sistemas de identidade
convivem no monitoramento, e o errado é o primário.

### Por que o `deviceId` existe (arqueologia)

Não há documento que justifique a decisão; a intenção foi reconstruída de
evidências primárias no código:

1. **O monitoramento nasceu anônimo, sem conta.** O cabeçalho de
   `lib/device-id.ts` cita "the **previous public monitoring router** (Fix #1)":
   o roteador de monitoramento era `publicProcedure` — funcionava sem login,
   identificando tudo pelo `deviceId`.
2. **O `openId` foi acoplado depois.** O comentário do schema
   (`drizzle/schema.ts`, `appUsers.openId`): *"Required for new registrations.
   Legacy rows may be null until the user re-registers."* Uma coluna que admite
   `null` "para linhas legadas" é assinatura de campo adicionado depois.
3. **Havia motivo de produto real.** `docs/strategy/how-monitored-is-reached.md`
   documenta a fricção do idoso com senha/conta e conclui que "o onboarding
   precisa funcionar sem forçar o idoso a criar uma senha". Um safety-net
   chaveado por device, funcionando offline e antes de qualquer login, encaixava
   nessa estratégia.

**Veredito:** o `deviceId` como chave de posse foi justificado no contexto
original (monitoramento anônimo, offline-first, sem conta). Mas a fundação mudou
por baixo dele — hoje a conta é obrigatória (OAuth/JWT) e há cloud backup por
`openId` (`user_data`). O modelo device-keyed virou um resíduo que sobreviveu à
própria justificativa.

---

## Problema

`deviceId` é gerado **uma vez por instalação** (`lib/device-id.ts`, chave única
`vigora_device_id`) e **compartilhado por qualquer conta** que logar naquele
aparelho. Como as tabelas de monitoramento são chaveadas por `deviceId`, duas
contas no mesmo aparelho disputam a mesma linha:

- `app_users.deviceId` é **único** (uma linha por aparelho físico, não por
  conta). O campo `openId` diz o dono atual.
- `synced_alarms`, `alarm_events`, `device_heartbeat`, `warning_log` são
  chaveadas **só por `deviceId`** (as queries não filtram por `openId`).

Consequência: a conta B, ao logar no aparelho da conta A, ou é bloqueada com 403
(`DEVICE_OWNED_BY_ANOTHER_USER`) ou herdaria os dados de A. Nenhum dos dois é o
comportamento correto para "duas contas distintas no mesmo celular".

---

## Princípio da solução: separar *liveness* de *ownership*

A refatoração aplica uma distinção conceitual que hoje está borrada:

| Conceito | Pergunta que responde | Chave correta |
|---|---|---|
| **Ownership** (posse de dados) | "De quem são estes alarmes / contatos / eventos?" | **`openId`** (conta) |
| **Liveness** (vitalidade) | "A pessoa monitorada está respondendo?" | por conta — "última vez que a conta deu sinal", de qualquer aparelho |

A observação decisiva que valida o modelo: **os dados de conta já têm um lar
autoritativo por `openId`**. O dashboard do cuidador (`getMonitoredData`,
`routers-links.ts`) já lê alarmes, contatos e métricas de
`getUserData(monitoredOpenId)` — a tabela `user_data`, chaveada por conta. Só
usa o device para *liveness* (`getLastHeartbeat`) e localização. As tabelas
device-keyed existem como **projeção server-side** que o dead man's switch lê
**em repouso** (o job não tem acesso ao estado local do cliente). É essa projeção
que re-chaveamos por `openId` — e, onde ela apenas duplica `user_data`, que
eliminamos.

### O que acontece com o `deviceId`

Ele **deixa de ser chave de posse**. Um monitorado é uma pessoa com, na prática,
um aparelho; e o que o switch pergunta é "esta *pessoa* está respondendo?", não
"este *aparelho* está ligado?". Colapsando a liveness para "última atividade da
conta (de qualquer aparelho)", o `deviceId`:

- **não é mais chave** de nenhuma tabela;
- **continua sendo gerado** no cliente (`lib/device-id.ts`) e enviado como
  **metadado** `lastDeviceId` na tabela de liveness — gancho para o futuro
  (ver "Decisões", multi-dispositivo/wearables), sem custo hoje.

Efeito no bug do usuário: duas contas = dois `openId` = zero colisão. E o caso
"mesma conta, aparelho novo" também melhora: qualquer aparelho da conta que
pingar mantém a conta "viva" — comportamento **correto** de um dead man's switch
(se a pessoa está ativa em qualquer device dela, está viva).

---

## Modelo consolidado (decisão #3: limpar de uma vez)

Além de re-chavear, esta refatoração **elimina duas tabelas redundantes**,
confirmado por auditoria de leitores:

- **`synced_alarms`** é lido **apenas** por `monitoring.getStatus` (contadores do
  painel de status). O dead man's switch (`monitoring-job.ts`) **não** o lê. Os
  contadores derivam de `user_data.alarms` → **tabela eliminada**.
- **`app_users`** só tem de exclusivo `lastLocation`/`lastLocationAt` (contatos e
  nome já vivem em `user_data`). Movendo a localização para a tabela de liveness,
  `app_users` **é eliminada inteira**; o job passa a ler contatos/nome de
  `user_data`.

### Antes → depois (por tabela)

| Tabela (hoje) | Chave hoje | Destino |
|---|---|---|
| `app_users` | `deviceId` (unique) | **Eliminada.** `emergencyContacts`/`userName` já em `user_data`; `lastLocation`/`lastLocationAt` migram para a tabela de liveness. |
| `synced_alarms` | `deviceId` | **Eliminada.** Contadores do painel derivam de `user_data.alarms`. |
| `device_heartbeat` | `deviceId` (unique) | **Re-chaveada por `openId`** e enriquecida → tabela de **liveness da conta**. |
| `alarm_events` | `deviceId` | **Re-chaveada por `openId`.** Idempotência passa a `(openId, alarmId, scheduledAt)`. |
| `warning_log` | `deviceId` | **Re-chaveada por `openId`.** |
| `user_data` | `openId` | **Inalterada** (backup autoritativo dos dados de conta). |
| `caregiver_links` | `openId` × `openId` | **Inalterada.** |

### Nova tabela de liveness (renomear `device_heartbeat`)

```
account_liveness  (nome sugerido; era device_heartbeat)
  openId          varchar UNIQUE   -- chave: a conta
  lastSeenAt      timestamp        -- último heartbeat, de qualquer aparelho
  lastLocation    varchar          -- "lat,lng" no último ping (migrado de app_users)
  lastLocationAt  timestamp
  lastDeviceId    varchar NULL     -- metadado: qual aparelho pingou por último
  appVersion      varchar
```

### `assertDeviceOwnership` → some

A verificação de posse por device deixa de existir. Toda rota protegida já tem
`ctx.user.openId`; a posse passa a ser **implícita** (a rota só toca os dados do
próprio `openId` autenticado). Isso elimina de vez a origem dos 403 de
`DEVICE_OWNED_BY_ANOTHER_USER` — não haverá mais device disputado.

### Modelo final (só 4 tabelas de domínio)

- `user_data` (openId): **todos** os dados de conta — anamnese,
  emergencyContacts, alarms, settings, healthMetrics, profile. Autoritativo.
- `account_liveness` (openId): lastSeenAt, lastLocation, lastLocationAt,
  lastDeviceId, appVersion.
- `alarm_events` (openId): log de ocorrências de alarme/check-in.
- `warning_log` (openId): avisos já enviados aos contatos.
- (`caregiver_links` por conta, inalterada.)

---

## Impacto nos consumidores

### Dead man's switch (`server/monitoring-job.ts`)
- `getExpiredPendingEvents` / `getInactiveDevices` / `getLastHeartbeat` /
  `getWarningHistory` passam a operar por `openId`.
- `getAppUser(deviceId)` → **substituído** por leitura de `user_data` (contatos +
  nome) e `account_liveness` (localização), ambos por `openId`.
- A ponte device→conta (`getLinkedCaregiverOpenIds(appUser.openId)`) **simplifica**:
  o `openId` já é a chave.
- `missed` (online) vs `not_sent` (offline) continua: "a conta pingou
  recentemente?" via liveness por `openId`.

### Dashboard do cuidador (`server/routers-links.ts`)
- `getDevicesForOwner(monitoredOpenId)` + `devices[0]` como "primary" **some**:
  há uma linha de liveness por conta. Vira leitura direta por `monitoredOpenId`.
- `getMonitoredData`: alarmes/contatos/métricas já vêm de `user_data`; localização
  e `lastHeartbeatAt` vêm de `account_liveness`.

### Painel de status (`monitoring.getStatus`)
- `syncedAlarmCount`/`enabledAlarmCount` derivam de `user_data.alarms` (não mais
  de `synced_alarms`). `lastCheckIn` vem de `account_liveness`.

### Cliente
- `lib/device-id.ts`: **mantido** — continua gerando o `deviceId` local, agora
  enviado só como `lastDeviceId` (metadado), nunca como chave.
- `lib/monitoring-service.ts`: `register`/`heartbeat`/`syncAlarms`/`createEvent`/
  `confirmEvent`/`getHistory` param de mandar `deviceId` como chave; o servidor
  usa `ctx.user.openId`. `syncAlarms` provavelmente **deixa de existir** (a agenda
  já sobe via cloud backup `userData.put`); confirmar na implementação se o job
  precisa de algum gatilho além do `user_data`.
- Gate do `MonitoringInitializer` em `userType === 'monitored'`: vira limpeza
  opcional — com posse por `openId`, cuidador não colide mais mesmo que rode.
- **Estado local (`vigora_app_state`, AsyncStorage):** problema separado e já
  existente — blob único, não isolado por conta, e o `logout()` não o limpa. Sob
  o novo modelo ainda vazaria dado local entre contas no mesmo aparelho. Tratado
  na Slice 6: estado local **por `openId`** (`vigora_app_state:<openId>`), com
  migração do blob legado para a conta atual e recarga na troca de conta.

---

## Migração de dados

**Prioridade acordada:** preservar dados das contas ativas; linhas realmente
órfãs (`openId = null` sem conta resolvível) **podem ser descartadas**.

Passos (migração Drizzle; **backup do MySQL antes** — dado de saúde/segurança):

1. **`account_liveness`** (a partir de `device_heartbeat` + `app_users`):
   - Para cada `deviceId` com `app_users.openId` presente: criar/atualizar a
     linha da conta com `lastSeenAt` (do heartbeat), `lastLocation`/`lastLocationAt`
     e `lastDeviceId = deviceId`.
   - **Colisão** (mesma conta em vários `deviceId`): manter o `lastSeenAt` mais
     recente.
2. **`alarm_events` / `warning_log`**: backfill de `openId` via join
   `deviceId → app_users.openId`. São append-only → **re-atribuir todos** (sem
   consolidação destrutiva; histórico preservado). Idempotência de `alarm_events`
   passa a `(openId, alarmId, scheduledAt)` — de-duplicar colisões remanescentes
   mantendo o de menor `id`.
3. **`user_data` (backfill de contatos, defensivo):** onde
   `user_data.emergencyContacts` estiver vazio mas `app_users.emergencyContacts`
   tiver dados, copiar (cobre contas que registraram contatos antes de um cloud
   sync). Idem `userName → profile`, se aplicável.
4. **Órfãos:** linhas com `openId = null` (device nunca associado a conta) e seus
   dependentes → **descartados** (não pertencem a ninguém resolvível).
5. **Drop:** remover `app_users` e `synced_alarms`; trocar chaves/uniques de
   `alarm_events`/`warning_log`/`account_liveness` para `openId`; remover a coluna
   `deviceId` das tabelas de negócio (fica só `lastDeviceId` em `account_liveness`).

**Reversibilidade:** destrutiva para órfãos e para `app_users`/`synced_alarms`.
Snapshot do Railway MySQL antes de aplicar; validar contagens antes/depois.

---

## Plano de implementação (slices pequenas e revisáveis)

1. **Schema + migração** — modelo consolidado (4 tabelas), migração com
   backfill/consolidação/descarte conforme acima. Backup antes.
2. **Camada de queries (`db-monitoring.ts`)** — assinaturas `deviceId → openId`;
   remove `assertDeviceOwnership`/`getAppUserForOwner`/`getSyncedAlarms`/
   `getDevicesForOwner`; `getAppUser` vira leitura de `user_data` + liveness.
3. **Roteadores (`routers-monitoring.ts`, `routers.ts`, `routers-links.ts`)** —
   usam `ctx.user.openId`; `deviceId` some do input (só `lastDeviceId` opcional);
   `getStatus` deriva contadores de `user_data`.
4. **Dead man's switch (`monitoring-job.ts`)** — opera por `openId`.
5. **Cliente (`monitoring-service.ts`, `device-id.ts`, `monitoring-initializer`)**
   — `deviceId` vira metadado; reavaliar `syncAlarms`; gate opcional de `userType`.
6. **Estado local por conta** — `vigora_app_state:<openId>` + migração do blob
   legado + recarga na troca de conta (resolve o vazamento local).
7. **Testes** — atualizar `monitoring.auth.test.ts` (some device ownership);
   adicionar isolamento entre duas contas no mesmo aparelho; teste da migração
   (backfill + consolidação + órfãos).

Slices 1–4 são servidor, 5–6 são cliente; cada uma é um commit/revisão
independente.

---

## Decisões (resolvidas)

1. **`deviceId` no cliente:** **manter** gerando localmente, enviado só como
   `lastDeviceId` (metadado de liveness), nunca como chave. ✅
2. **Multi-dispositivo (mesma conta, vários aparelhos):** **não** é requisito de
   lançamento. O modelo colapsa para "conta viva se qualquer aparelho pinga". Um
   cenário futuro plausível é integração com **wearables** (relógio/pulseira
   medindo BPM continuamente) — não planejado nem especificado para o v1; o
   `lastDeviceId` fica como gancho para quando isso for desenhado. ✅
3. **Consolidação `app_users` × `user_data`:** **entra no escopo** — elimina
   `app_users` e `synced_alarms`, deixando o modelo em 4 tabelas de domínio. ✅
4. **Onde vive este doc:** commit na branch `claude/login-loop-bug-9oevus` (a
   implementação será feita localmente pelo autor, com Claude Code local). ✅

---

## Riscos

- **Dead man's switch é crítico (segurança de vida).** A migração não pode deixar
  eventos pendentes órfãos nem "perder" a liveness de uma conta ativa. Mitigação:
  aplicar com o job pausado, validar contagens antes/depois, backup do MySQL.
- **Órfãos descartados = histórico perdido para contas não identificáveis.**
  Aceito conforme decisão de migração.
- **Contas que registraram em múltiplos aparelhos** entram na consolidação do
  Passo 1/2 da migração — precisa de teste dedicado.
- **Eliminar `synced_alarms`** assume que o único leitor é `getStatus`
  (auditado nesta data); reconfirmar na implementação que nada novo passou a
  lê-la antes de dropar.
