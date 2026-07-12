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

- **não é mais chave** de nenhuma tabela de domínio;
- **continua sendo gerado** no cliente (`lib/device-id.ts`) e enviado como
  **metadado** `lastDeviceId` na tabela de liveness — gancho para o futuro
  (ver "Decisões", multi-dispositivo/wearables), sem custo hoje;
- **ganha um segundo papel, fora do banco de domínio:** credencial de sessão da
  **conta anônima** (ver "Contas sem login", adiante) — não como chave de
  tabela, mas como o que o cliente guarda no SecureStore para reobter um
  `sessionToken` de um `openId` já existente, sem senha. Isso é consistente
  com "identidade única = `openId`", não uma exceção a ela: mesmo a conta
  anônima é uma conta com `openId` normal — o `deviceId` só prova, do lado do
  cliente, que ela pode pedir um token para aquele `openId`.

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

## Contas sem login (conta anônima)

**Status:** Proposto / em discussão. Direção definida, mas ainda **não decidido
implementar**. Redefine o segundo papel do `deviceId` (acima) — por isso vive
no corpo deste spec, não como anexo à parte.

### Motivação

O público-alvo (60+, baixa fluência tecnológica) tem fricção real com
login/senha — documentado em `docs/strategy/how-monitored-is-reached.md`
("*tanta senha, senha pra isso, senha pra aquilo... é preferível que nem
mexa*") e com **medo de "desconfigurar"** ao mexer no app. Hoje o
`OnboardingGate` **exige login** (não há caminho de convidado): sem conta, não
se chega ao app. A pergunta: dá para tornar o login **opcional** sem perder as
features que tornam o app único?

Nota importante: sempre que esta seção diz "login", entende-se **qualquer
método** — Google, e-mail+senha, telefone, Apple (quando a App Store liberar).
Nada aqui é específico do Google.

### Caminhos descartados

- **Nível 1 — anônimo de verdade, sem nenhuma conta no servidor.** Reintroduz
  identidade por device (o oposto deste refactor), sem cloud backup e **sem
  monitoramento pela família** — mata o diferencial. Descartado.
- **Nível 2 — login adiado com "nag" ("use agora, proteja depois").** Para este
  público, adiar → na prática **nunca loga** (medo de desconfigurar). Um app que
  fica pedindo login depois gera ansiedade e é ignorado. Descartado como padrão.
- **Config remota pelo cuidador** como bala de prata: descartada. O "cuidador"
  pode ser o cônjuge 60+ — "configurar o aparelho de outra pessoa à distância" é
  *mais* assustador, não menos. É **um** canal, não a solução.

### Modelo escolhido: "conta anônima", não "sem conta"

Em vez de uma tabela separada de "usuários sem conta" chaveada por `deviceId`
(que forçaria caminhos duplicados `deviceId` OU `openId` em todo lugar —
justamente o que este refactor remove), trata-se o usuário sem login como uma
**conta real que ainda não vinculou um login externo**:

1. Primeiro boot → gera `deviceId` → onboarding → usuário escolhe o tipo.
2. Ao "seguir sem login", o servidor **cria uma conta real** (`users` row) com um
   `openId` normal, `loginMethod: "anonymous"`, sem e-mail/telefone/OAuth. A
   coluna `loginMethod` já é texto livre nulável (`"google"`, `"apple"`, ...) —
   não exige mudança de schema. O `deviceId` (no SecureStore) é a **credencial**
   que reautentica nessa conta — o "login invisível" dela.
3. **Tudo continua chaveado por `openId`** — alarmes, eventos, dead man's switch
   — idêntico para conta anônima e real. **A identidade única deste refactor
   sobrevive intacta; zero caminho duplicado.**
4. "Fazer login" um dia = **vincular uma identidade** (qualquer provider) à conta
   anônima que já existe → o `openId` **não muda** → **não há migração de
   dados** (os dados nunca trocam de dono; só se anexa uma identidade).

A "identidade única = `openId`" deste spec passa a valer **para todos, inclusive
convidados**. E o `deviceId`, rebaixado a metadado na seção anterior, ganha aqui
o segundo papel legítimo de **credencial da conta anônima**.

### Restrições (inerentes, aceitas)

- **(a) Sem vínculo cuidador↔monitorado enquanto anônimo.** O vínculo precisa de
  um `openId` que **sobreviva a reinstalar**; a conta anônima só é recuperável
  pelo `deviceId` do SecureStore, que morre no reinstall. Logo, vincular cuidador
  **exige** ter linkado um login. Enquanto anônimo, o dead man's switch avisa só
  os contatos de emergência salvos (como hoje).
- **(b) Sem backup ao reinstalar/trocar de aparelho.** Dados ficam no banco por
  `openId_anônimo`, mas a única chave para reautenticar (o `deviceId`) se perde →
  dados ficam órfãos (candidatos a expurgo, LGPD). Ao linkar um login, o reinstall
  recupera via provider → mesmo `openId` → dados de volta.

O bug original deste spec (duas contas no mesmo aparelho) continua resolvido:
anônima e logada = dois `openId` = zero colisão.

### Custos honestos

1. **Falso alarme ao "sumir" (ver Anexo B, adiante).** Uma conta anônima
   abandonada (factory reset) continua com heartbeat velho → o switch escala
   pros contatos. **Não é perda silenciosa — é falso alarme, e já existe hoje
   para contas reais também** (ver Anexo B). Mitigação específica aqui: expurgar
   contas anônimas órfãs na retenção.
2. **Superfície de abuso.** Qualquer um cria infinitas contas anônimas e dispara
   WhatsApp/push. Precisa rate-limit por device/IP (o alerta de emergência já tem
   rate-limit — estender ao cadastro anônimo).
3. **Onboarding ainda precisa explicar o upgrade** — mas **sem pressão**, porque
   o app funciona 100% sem ele. Enquadrar como **proteção da família**
   ("*ligue sua conta para não perder seus avisos se trocar de celular*"), não
   como "faça login para continuar".
4. **Caso raro de merge:** linkar um login cujo provider **já tinha conta** (usado
   em outro aparelho) exige mesclar os dados locais anônimos na conta existente.
   É a **única** migração real, e é borda.

### Viabilidade no código atual (esboço)

- Novo endpoint `/api/auth/anonymous` recebe o `deviceId` e emite `sessionToken`
  para um `openId` anônimo (reusa `sdk.createSessionToken`).
- `authenticateRequest` já resolve tudo por `openId` → só precisa existir a
  `users` row anônima.
- `resolveAccount` (`server/db-auth.ts`) ganha um ramo: "se há sessão anônima
  ativa, vincule o provider a **este** `openId` em vez de criar outro".
- Cliente: `OnboardingGate` deixa de ser parede; após o tipo, chama o endpoint
  anônimo e entra. O `deviceId` no SecureStore é a chave. (Ver "Impacto nos
  consumidores > Cliente", abaixo — condicionado a esta decisão.)

### Nota de copy em aberto: renomear "monitorado"

"Monitorado" soa clínico/vigilante. Trocar o rótulo abstrato por **intenção em
primeira pessoa** é mais acolhedor *e* mais fácil para o idoso entender:
- **"É para mim"** vs **"É para alguém que eu cuido"**, ou
- **"Quero me cuidar"** vs **"Quero cuidar de alguém"**.
Para um substantivo, "**acompanhado(a)**" é mais quente que "monitorado".
Decisão de copy independente desta seção — pode ser feita mesmo sem contas
anônimas — testar com gente do público.

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
- **`OnboardingGate` (condicional à decisão de "Contas sem login", acima):** se
  as contas anônimas forem implementadas, deixa de ser uma parede — após o
  onboarding e a escolha do tipo, o app chama o endpoint anônimo e entra, sem
  exigir login. Sem essa decisão, o gate continua exigindo login como hoje.

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

---

# Anexo B — Achado: falso alarme do dead man's switch por inatividade

**Status:** Bug pré-existente, independente da decisão de login. Corrigir de
qualquer forma.

## O problema

O `monitoring-job.ts` tem **dois** caminhos de escalação:

- **Baseado em evento** (Passos 1/3/4): dispara quando um alarme/check-in
  **realmente venceu sem confirmação**. Sinal *correto* de perigo.
- **Baseado em inatividade** (Passo 2): dispara por **pura ausência de
  heartbeat**. `getInactiveDevices` retorna todo device com `lastSeenAt` acima de
  **30 min**, **sem** filtrar por alarme perdido. Havendo contato/cuidador →
  escala (nível 1 aos 30 min, 2 às 2h, 3 às 6h).

O heartbeat só roda com o app **em primeiro plano**. Logo, hoje, **qualquer**
destes faz o servidor ver a conta "offline" e avisar a família:

- desinstalar sem excluir a conta;
- **fazer logout** (o `stopHeartbeat` é só no cliente — nada no servidor desarma;
  a linha de `device_heartbeat` fica com o timestamp velho);
- celular desligado / sem bateria;
- **só deixar o app em segundo plano** tempo suficiente.

A retenção não protege: `purgeStaleData` apaga eventos/avisos antigos e limpa
localização, mas **não remove `device_heartbeat` nem `app_users`** — a projeção
fica "armada" quase para sempre. **Não há hoje nenhum sistema que previna isso.**

Consequência: o Passo 2 **confunde "app sumiu" com "pessoa em perigo"**.

## Como resolver (3 alavancas, da mais limpa à mais defensiva)

1. **Escalar por evento perdido, não por inatividade pura.** Um alarme/check-in
   vencido sem confirmação É o sinal de perigo; "app fora do foreground há 30
   min" não é. Remover o Passo 2 ou **gateá-lo** para só disparar havendo
   evento esperado e não confirmado (Passos 3/4 já fazem isso). Elimina o falso
   alarme de desinstalar/logout/segundo-plano quando não havia nada a confirmar.
   **Recomendada como base.**
2. **Desarmar explicitamente no logout.** O logout chama um endpoint que pausa o
   monitoramento (ou remove a projeção) → sair da conta não dispara a família.
   Desinstalar não consegue avisar o servidor → para esse caso, alavanca 1 +
   threshold bem maior que 30 min.
3. **Expurgar contas anônimas/projeções órfãs.** Incluir `device_heartbeat`
   (`account_liveness`, no modelo novo) e a conta anônima no purge de retenção,
   para uma conta abandonada parar de "existir" no switch após N dias.

Meta: o dead man's switch dispara por **risco real**, não por **app ausente** —
igual para conta normal e anônima.

---

## Ordem de implementação sugerida

Critério: **urgência sobe a colocação, dificuldade/tempo de implementação
desce a colocação** — com uma ressalva: **dependências reais entre itens
têm prioridade sobre a pontuação.** Um item que precisa de outro pronto para
ser construído com qualidade não pode vir antes dele, mesmo que a pontuação
isolada sugerisse o contrário.

| # | Item | Urgência | Dificuldade | Por que nesta posição |
|---|---|---|---|---|
| **1** | **Corrigir o falso alarme por inatividade** (Anexo B) | **Máxima** — está gerando alarme falso à família **hoje, em produção**, num app de segurança de vida | **Baixa** — a alavanca recomendada (gatear o Passo 2 por evento perdido) é uma mudança contida em `monitoring-job.ts`, sem migração de schema | Bug ativo que corrói confiança no produto, com o menor custo de implementação do documento. Corrige antes de qualquer refatoração maior. |
| **2** | **Refatoração de posse por `openId`** (corpo deste spec, slices 1–7) | **Alta** — é a raiz do bug que originou esta investigação (loop ao trocar de conta) e da dívida técnica de duas identidades convivendo | **Alta** — migração de schema em 5 tabelas, toca servidor e cliente; dead man's switch é crítico (exige backup do MySQL, validação de contagens, cuidado extra) | Mais urgente que o item 4 e é **pré-requisito técnico** dele: construir contas anônimas sobre o modelo device-keyed atual duplicaria exatamente a complexidade que este refactor remove. |
| **3** | **Renomear "monitorado"/"cuidador"** (copy) | Baixa — não é bug, é acolhimento | **Baixa** — só copy/rótulos de UI, sem mudança de schema ou lógica | Independente de tudo o mais — não bloqueia nem é bloqueado por nenhum outro item. Entra aqui por custo quase zero, mas pode ser feito em paralelo a qualquer momento, inclusive antes do item 1. |
| **4** | **Login opcional via conta anônima** | Média/estratégica — não é incidente ativo, mas endereça a fricção documentada do público-alvo; **ainda em decisão**, não aprovado | **Alta** — novo fluxo de auth, ramo de linking em `resolveAccount`, reescrita do `OnboardingGate`, rate-limit de abuso, expurgo de órfãos, copy de onboarding | Depende do item 2 (identidade única por `openId` já pronta) **e** de uma decisão de produto ainda em aberto — por isso fica por último mesmo sendo estrategicamente relevante. |

**Leitura prática:** 1 → 2 → 4 é a sequência que não pode ser invertida (a
correção do falso alarme é urgente e barata; a identidade única precisa
existir antes de contas anônimas fazerem sentido). O item 3 é um encaixe
oportunista — baixo custo, zero dependência — que pode entrar em qualquer
ponto da fila sem atrapalhar os demais.
