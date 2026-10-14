# Fase 4 — O cuidador gerencia os alarmes do idoso — Design

**Data:** 2026-10-06
**Base:** `fix/launch-prep` @ 3e112dc (Fases 1 a 3 mergeadas, PR #73)
**Spec anterior:** `docs/superpowers/specs/2026-10-02-feedback-beta-fases-1-3-design.md` (a seção 6 dela adiou para cá: edição à distância, modo gerenciado e o servidor calcular os disparos)

## 1. Objetivo

Hoje o cuidador só **vê** os alarmes da pessoa que acompanha. O teste beta mostrou o caso que isso não cobre: o idoso que não sabe (ou não quer) cuidar dos próprios lembretes, e que pode apagar o lembrete do remédio que não quer tomar. A Fase 1 fez o cuidador **ficar sabendo** quando isso acontece; a Fase 4 deixa o cuidador **cuidar** dos alarmes, com o consentimento do idoso.

Sucesso é:

1. O cuidador cria, edita, desliga e apaga os remédios e check-ins do idoso pelo app dele.
2. A mudança chega ao celular do idoso sem ninguém precisar mexer lá, e o cuidador sabe se chegou.
3. Enquanto o acordo vale, o idoso não apaga nem desliga os alarmes; ele vê e responde.
4. O dead man's switch continua funcionando quando o idoso passa dias sem abrir o app — e para de incomodar a família quando o aparelho sumiu de verdade.

## 2. Decisões

| # | Decisão | Por quê |
|---|---|---|
| D1 | A fase entrega **as duas coisas**: edição à distância e trava. | A trava só faz sentido se alguém puder editar; e editar sem trava não resolve o caso da avó. |
| D2 | **O cuidador pede, o idoso aceita** no próprio celular. O idoso pode parar o modo depois, em Configurações; o cuidador é avisado. | O idoso é o titular dos dados e o dono do aparelho (LGPD, autonomia). A saída com aviso mantém a transparência da Fase 1. |
| D3 | O cuidador **só edita com o modo gerenciado ativo**. Sem acordo, continua só vendo. | Um "Sim" do idoso libera as duas coisas — um conceito só para quem tem 60+. O vínculo atual não foi aceito com a promessa de edição. |
| D4 | Com vários cuidadores vinculados, **só quem pediu** edita. Os outros veem e recebem avisos. | O idoso sabe exatamente quem cuida; não há dois cuidadores mudando o mesmo alarme. |
| D5 | No modo gerenciado o idoso **vê e responde**; criar, editar, desligar e apagar ficam com o cuidador. | Simples de explicar e de testar; sem duas regras na mesma lista. |
| D6 | **Abordagem A:** a lista gerenciada vive no servidor com versão; o celular aplica e confirma; o dead man's switch só cobra o que foi confirmado. | O backup de bloco único (último que grava vence) sobrescreveria edições; a confirmação deixa o cuidador saber se chegou. |
| D7 | Entrega por **push silencioso** (aplica com o app fechado) e, se em 10 min não houver confirmação, **notificação visível** de reserva. | O silencioso evita incomodar quando funciona; a visível cobre os aparelhos em que ele não roda. |
| D8 | O servidor calcula os próximos disparos de **todas as contas** (gerenciadas pela lista confirmada; as demais pelo backup). | Fecha o furo do "idoso não abre o app há dias" para todo mundo. |
| D9 | O servidor **pausa** os disparos de uma conta em três casos: logout (na hora), app removido (token de push morto) e **2 dias** sem nenhum sinal do aparelho. Avisa o cuidador e retoma sozinho no próximo sinal. | Não existe aviso de desinstalação no Android nem no iOS; sem pausa, a família seria avisada todo dia, para sempre. |
| D10 | A Política de Privacidade passa a citar a **Twilio** e a ficha de anamnese deixa de dizer que nada sai do aparelho. | As duas afirmações estão erradas hoje (SMS via Twilio desde `afef6e0`; backup em nuvem existe). |

## 3. O acordo do modo gerenciado

### 3.1 Estados

Tabela nova `alarm_management`, uma linha por pedido:

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | int auto | |
| `monitoredOpenId` | varchar(64) | |
| `caregiverOpenId` | varchar(64) | quem pediu (e, se aceito, quem gerencia) |
| `status` | enum `pending` \| `active` \| `ended` | |
| `endedReason` | enum nulo: `declined` \| `expired` \| `cancelled` \| `stopped_by_monitored` \| `stopped_by_caregiver` \| `unlinked` \| `account_deleted` | |
| `requestedAt`, `respondedAt`, `endedAt` | timestamp | `respondedAt` = aceite ou recusa |

Regras:

- Só pode existir **um** pedido `pending` ou acordo `active` por idoso (checado em transação na criação do pedido e no aceite).
- Só cuidador **vinculado ativo** ao idoso pode pedir.
- Pedido `pending` vence em **7 dias** (`expired`, encerrado pelo job).
- O histórico nunca é apagado enquanto a conta existir (auditoria do consentimento); é apagado com a exclusão de conta.

### 3.2 Pedido

1. O cuidador toca em **"Pedir para cuidar dos alarmes"** na área "Alarmes de [nome]".
2. O servidor grava o pedido e manda ao celular do idoso uma notificação visível: título "Pedido de [nome do cuidador]", corpo "Toque para ver".
3. Ao abrir o app (ou tocar na notificação), o idoso vê um `AppDialog`:
   - Título: **"[Nome] quer cuidar dos seus alarmes"**
   - Mensagem: **"[Nome] vai poder criar, mudar e apagar os seus remédios e check-ins. Você vai continuar vendo e respondendo, mas não vai conseguir apagar nem desligar. Você pode parar quando quiser em Configurações."**
   - Botões: **"Deixar [nome] cuidar"** e **"Agora não"**.
4. "Agora não" encerra o pedido (`declined`) e avisa o cuidador por push ("[Nome] preferiu continuar cuidando dos próprios alarmes").

### 3.3 Aceite

- O aceite é a chamada `managedAlarms.respond({ requestId, accept: true, alarms })`, feita pelo celular do idoso com a **lista atual dele** (validada com o mesmo Zod de 4.2; ids existentes mantidos). `status` vira `active` e nasce a linha de `managed_alarm_lists` com essa lista como versão 1, já confirmada (`appliedVersion = 1`, `appliedAlarms` = a mesma lista). Nada some, nada é recriado.
- Push ao cuidador: "[Nome] aceitou. Agora você cuida dos alarmes de [nome]".
- Push aos **outros** cuidadores vinculados: "[Cuidador] passou a cuidar dos alarmes de [nome]".

### 3.4 Saída

| Quem | Onde | Efeito |
|---|---|---|
| Idoso | Configurações → cartão "[Nome] cuida dos seus alarmes" → **"Parar"** (com `AppDialog` de confirmação: "[Nome] será avisado") | `stopped_by_monitored`; push ao cuidador |
| Cuidador | "Alarmes de [nome]" → **"Parar de cuidar dos alarmes"** (com confirmação) | `stopped_by_caregiver`; notificação ao idoso |
| Cuidador | pedido ainda pendente → **"Cancelar pedido"** | `cancelled` |
| Qualquer lado | desfazer o vínculo | `unlinked` |

Ao encerrar um acordo ativo: a linha de `managed_alarm_lists` é apagada; **a lista no celular não muda** — os alarmes continuam tocando e voltam a ser do idoso (editáveis por ele).

## 4. A lista gerenciada

### 4.1 Tabela `managed_alarm_lists`

Uma linha por idoso com acordo ativo:

| Coluna | Tipo | Notas |
|---|---|---|
| `monitoredOpenId` | varchar(64) único | |
| `version` | int | sobe a cada gravação do cuidador |
| `alarms` | json | lista completa, no formato `Alarm` do app (remédios e check-ins), sem `notificationId`/`nativeAlarmUids` |
| `appliedVersion` | int | última versão que o celular confirmou ter agendado |
| `appliedAlarms` | json | a lista **daquela** versão confirmada (é dela que o servidor calcula os disparos) |
| `failedAlarmIds` | json | ids que o celular não conseguiu agendar na versão confirmada |
| `appliedAt` | timestamp | |
| `updatedByOpenId`, `updatedAt` | | quem gravou por último |
| `visibleNoticeSentForVersion` | int | controla a notificação visível de reserva (D7) |

### 4.2 Gravação pelo cuidador

Rotas tRPC (router `managedAlarms`), todas `protectedProcedure` com Zod e o rate limit existente:

- `createAlarm({ baseVersion, alarm })`, `updateAlarm({ baseVersion, alarmId, alarm })`, `deleteAlarm({ baseVersion, alarmId })`.
- Autorização: o chamador é o `caregiverOpenId` do acordo `active` do idoso a que ele está vinculado. O idoso **não** é escolhido pelo cliente: vem do vínculo do cuidador (mesmo padrão de `requireCaregiverLink`). Qualquer outro caso → `FORBIDDEN`.
- Validação (as mesmas regras do formulário do app): `time` `HH:MM`; `repeat` ∈ daily/weekdays/weekends/custom; `customDays` 0..6 e não vazio quando `custom`; **check-in sempre `daily`** (o servidor força, como `formForSave`); `escalateAfterMinutes` ∈ 5/10/15/30 só para check-in; `description` até 80 caracteres; `sound`/`vibration`/`enabled` booleanos; no máximo **24** alarmes (`MAX_ALARMS`).
- Id de alarme novo: **UUID gerado pelo servidor** (o AlarmKit do iOS exige UUID).
- `baseVersion` diferente da versão atual → `CONFLICT`; o app do cuidador recarrega e mostra "A lista mudou, confira de novo".
- Cada gravação entra em `alarm_changes` (Fase 1) com o cuidador como autor, e os **outros** cuidadores recebem o push `alarm_changed` como hoje. O texto passa a dizer quem mudou ("[Cuidador] apagou o lembrete …").
- **Regra de não-duplicação:** com o acordo ativo, o `userData.put` **não roda** o `diffAlarms` para a conta do idoso (nem grava `alarm_changes`, nem manda push). No modo gerenciado só o cuidador muda a lista, e cada mudança já foi registrada na gravação dele; sem a regra, o celular da Maria, ao aplicar o que Ana apagou, geraria "Maria apagou…".

### 4.3 Entrega ao celular do idoso

- O celular do idoso passa a **registrar token de push** (mesma rota `push.register`, hoje usada só pelo app do cuidador).
- A cada gravação, o servidor manda **push silencioso** (só dados, `_contentAvailable`, prioridade alta), `data: { type: 'managed_alarms_updated', version }`.
- Uma tarefa em segundo plano no celular (`expo-task-manager` + handler de notificação em segundo plano do `expo-notifications` — **dependência nativa nova**) busca a lista, aplica e confirma (4.4).
- **Reserva:** se 10 min depois da gravação `appliedVersion < version` e `visibleNoticeSentForVersion < version`, o job (que já roda a cada 5 min) manda a notificação visível **"[Cuidador] atualizou seus alarmes. Abra o Vigora para as mudanças valerem."** e marca `visibleNoticeSentForVersion = version`. Sem nome de remédio.
- O app também busca ao **abrir**, ao **voltar ao primeiro plano** (no máximo 1×/min, como a Tarefa 2 das Fases 1–3), ao **tocar na notificação** e logo **depois de aceitar** o acordo.

### 4.4 Aplicação e confirmação no celular

Com `serverVersion > versão local aplicada`:

1. Calcula as diferenças (módulo puro `lib/managed-alarms-apply.ts`): alarmes removidos, novos e alterados.
2. Cancela no sistema os removidos e os alterados (`cancelFullAlarm`), agenda os novos e alterados (`scheduleFullAlarm`). Um alarme que o sistema recusar entra em `failedAlarmIds`; os outros seguem.
3. Troca a lista local pela do servidor (ação de estado única; o backup normal grava a cópia).
4. Só então chama `managedAlarms.ack({ version, failedAlarmIds })`. O servidor grava `appliedVersion`, `appliedAlarms` (a lista daquela versão) e `failedAlarmIds`. `ack` de versão menor que a já aplicada é ignorado.

### 4.5 O que o cuidador vê

Por alarme e no topo da lista:

- **Confirmado:** "Tudo certo no celular de [nome]".
- **Pendente:** "Ainda não chegou ao celular de [nome] (desde HH:MM)"; depois de 12 h acrescenta "Peça para [nome] abrir o Vigora".
- **Falha:** "O celular de [nome] não conseguiu agendar: [lembrete] [horário]".

## 5. O servidor calcula os disparos

### 5.1 Fuso por conta

`user_data` ganha a coluna `timezone` (IANA, até 64), enviada pelo app em todo `userData.put` (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Sem fuso conhecido: `America/Sao_Paulo` (o mesmo fallback já usado para exibir horários).

### 5.2 Uma regra só de dias e horários

A lógica de `lib/alarm-fire-times.ts` vira um módulo puro **compartilhado** (`shared/alarm-schedule.ts`), que recebe o fuso: `nextFireMs(alarm, timezone, now)` e `lastFireMs(alarm, timezone, now)`. O app (com o fuso do aparelho) e o servidor (com o fuso da conta) usam o mesmo módulo, e a convenção de dias (0 = domingo) continua numa fonte só — foi a duplicação dessa convenção que fez todo alarme semanal disparar um dia depois.

### 5.3 De onde vem a lista

- **Conta gerenciada:** `appliedAlarms` menos `failedAlarmIds`, só os `enabled`. Um alarme que ainda não chegou ao celular **nunca é cobrado**.
- **Conta comum:** os alarmes `enabled` do backup (`user_data.alarms`).

### 5.4 Pré-registro

A cada rodada do job (5 min), para cada conta **de idoso** (contas de cuidador não têm alarmes) **não pausada** (5.5):

- Calcula os disparos das **próximas 24 h** de cada alarme e cria o evento pendente com `kind` e `graceMinutes` (`escalateAfterMinutes` do check-in; remédio sem grace), pelo mesmo `createAlarmEvent` idempotente que o celular já usa.
- **Mesmo disparo, um evento só:** a criação feita pelo servidor não cria um evento novo se já existir evento (pendente ou resolvido) do mesmo `alarmId` a menos de **2 h** do horário calculado. Isso cobre a diferença de fuso entre aparelho e conta (viagem, fuso desatualizado) sem gerar um segundo evento que expiraria e acusaria a pessoa à toa.
- Nada mais muda no dead man's switch: prazo por evento, folga de 2 min do check-in, escada de avisos e mensagens.

### 5.5 Pausas (D9)

`user_data` ganha `deviceLastSeenAt`, `dmsPausedReason` (enum nulo: `logged_out` \| `app_removed` \| `no_signal`), `dmsPausedAt` e `pauseNoticeSentAt`.

- **Sinal do aparelho** = qualquer chamada autenticada do app do idoso que prove que ele está vivo: heartbeat, `userData.put`, `monitoring.createEvent`/`confirmEvent`, `managedAlarms.ack`, `push.register`. Cada uma atualiza `deviceLastSeenAt` e, se a conta estava pausada, **retoma** (limpa os campos de pausa).
- **Logout:** antes de limpar a sessão, o app chama `monitoring.deviceSignedOut`. A conta pausa na hora (`logged_out`).
- **App removido:** uma vez por dia o servidor manda ao celular do idoso um push silencioso de verificação (`data: { type: 'ping' }`) e, na rodada seguinte, consulta os **recibos** do Expo (`getPushNotificationReceiptsAsync`). `DeviceNotRegistered` no ticket ou no recibo apaga o token (já acontece para o ticket); se a conta ficar **sem nenhum token**, pausa (`app_removed`).
- **Sem sinal:** `deviceLastSeenAt` há mais de **2 dias** → pausa (`no_signal`).
- **Ao pausar:** os eventos pendentes **futuros** da conta são apagados (o servidor não cobra o que não vai acontecer); os que já venceram seguem a escada normal. Cada cuidador vinculado recebe **uma** notificação (`pauseNoticeSentAt`):
  - `logged_out`: "[Nome] saiu da conta do Vigora no celular. Os avisos automáticos estão pausados até [nome] entrar de novo."
  - `app_removed`: "O Vigora parece ter sido removido do celular de [nome]. Os avisos automáticos estão pausados."
  - `no_signal`: "O celular de [nome] não dá sinal há 2 dias. Os avisos automáticos estão pausados até ele voltar a se comunicar."
- O idoso não recebe nada sobre a pausa (o app dele não está rodando por definição, exceto no logout, em que a tela de login basta).

### 5.6 Fora desta seção

O servidor nunca faz o alarme tocar nem manda mensagem ao idoso quando um alarme deveria tocar: quem toca é sempre o celular; o servidor só passa a saber o que esperar.

## 6. Telas

Toda tela tocada funciona nos modos normal e acessível, claro e escuro; cores por token; alvo de toque ≥44px (≥60px no acessível); `AppDialog`/`AppToast`; PT-BR.

### 6.1 App do cuidador — "Alarmes de [nome]"

Nova área a partir da tela da pessoa (`app/(caregiver-tabs)/person.tsx`):

- **Sem acordo:** remédios e check-ins só para leitura (como hoje) e o botão **"Pedir para cuidar dos alarmes"**, com uma frase do que significa.
- **Pedido pendente:** "Aguardando [nome] aceitar (vence em N dias)" e **"Cancelar pedido"**.
- **Acordo ativo (este cuidador):** botões de criar, editar e apagar usando o **mesmo `AlarmFormModal`** do app do idoso (ele já só edita e devolve os valores; quem salva é a rota do servidor). Estado de cada alarme (4.5). **"Parar de cuidar dos alarmes"** no fim.
- **Acordo ativo (outro cuidador):** "[Cuidador] cuida dos alarmes de [nome]"; só leitura.

### 6.2 App do idoso

- **Pedido:** o `AppDialog` de 3.2, mostrado ao abrir o app enquanto houver pedido pendente.
- **Modo ativo — listas de Remédios e Check-in só leitura:** aviso no topo **"Quem cuida dos seus alarmes é [nome]"**; somem "Adicionar", o interruptor de ligar/desligar e "Excluir"; tocar num alarme abre os detalhes sem edição. O hub "Alarmes" e os atalhos continuam levando às listas.
- **Configurações:** cartão **"[Nome] cuida dos seus alarmes"** com **"Parar"** (3.4).
- **A tela do alarme tocando não muda.**

## 7. LGPD, ANVISA e textos legais

- **Consentimento** (Art. 8): do idoso, explícito, com data e hora em `alarm_management`, revogável por ele a qualquer momento.
- **Exportação** (Art. 18 V): inclui o histórico de `alarm_management` da conta e a lista gerenciada.
- **Exclusão de conta** (Art. 18 VI): apaga `alarm_management` (como idoso e como cuidador) e `managed_alarm_lists`. Desfazer o vínculo encerra o acordo (`unlinked`).
- **Notificações ao idoso** não levam nome de remédio.
- **Política de Privacidade** (texto em `app/(tabs)/settings.tsx`) ganha:
  - **Twilio** (SMS aos contatos de emergência que você designou), ao lado de WhatsApp/Meta;
  - o cuidador pode criar e mudar seus alarmes **com o seu consentimento**, e você pode parar quando quiser;
  - a verificação diária silenciosa por push (para saber se o app ainda está no aparelho);
  - o fuso horário do aparelho é guardado para calcular os horários dos alarmes.
- **Ficha de anamnese:** os dois textos que dizem que nada sai do aparelho passam a dizer a verdade — os dados ficam no aparelho **e numa cópia de segurança no servidor do Vigora** (protegida por autenticação), e só saem para outras pessoas quando você compartilha a ficha:
  - `app/(tabs)/anamnesis.tsx:512` ("…nunca são enviados para servidores externos");
  - a pergunta frequente em `components/help-screen.tsx:131` ("…Nenhuma informação é enviada para servidores externos…").
- **ANVISA:** continuam sendo lembretes criados por uma pessoa; nenhuma regra clínica, classificação ou interpretação.

## 8. Testes

- **Servidor — autorização:** só o cuidador do acordo `active` grava; outro cuidador vinculado, o idoso pela rota do cuidador, cuidador sem vínculo e id de alarme de outra conta são recusados (IDOR).
- **Servidor — acordo:** um pendente/ativo por idoso; vencimento em 7 dias; recusa, cancelamento, saída pelos dois lados e desvínculo encerram com o motivo certo e avisam o outro lado.
- **Servidor — lista:** `baseVersion` em conflito; Zod (cada regra de 4.2, incluindo check-in forçado a diário e o limite de 24); UUID nos novos; `ack` de versão antiga ignorado; `appliedAlarms` gravado com a versão confirmada; `alarm_changes` com o cuidador como autor e sem duplicar no `userData.put`.
- **Servidor — disparos:** pré-registro só da lista confirmada (gerenciadas) e do backup (comuns); um evento por disparo dentro da janela de 2 h; `kind`/`graceMinutes` corretos.
- **Servidor — pausas:** logout, token morto (ticket e recibo) e 2 dias sem sinal pausam, apagam os pendentes futuros e avisam uma vez; qualquer sinal retoma.
- **Módulo de horários:** fusos diferentes, horário de verão (fusos que ainda o têm), virada de dia, dias personalizados, e app e servidor dando o mesmo resultado para o mesmo fuso.
- **Migrações:** só adicionam tabelas e colunas (rodam sozinhas no deploy).
- **App:** o aplicador puro (diferenças, falhas parciais, ack), as listas só de leitura, o diálogo do pedido, o cartão de Configurações, a área do cuidador nos dois modos.

## 9. Validação em aparelho

1. **Antes de tudo — teste do push silencioso** no Samsung A15 e no iPhone 12: o push chega com o app fechado? A tarefa em segundo plano roda? O módulo nativo do alarme agenda a partir dela? Se não agendar em segundo plano, o silencioso fica só baixando a lista e a confirmação depende de o app abrir (a reserva visível de D7 cobre). O resultado ajusta a Seção 4.3 antes do resto.
2. Pedir, recusar, aceitar; editar, criar, apagar; mudança chegando com o app fechado e aberto; falha de agendamento aparecendo ao cuidador; parar pelos dois lados.
3. Logout, desinstalar (e medir quanto tempo o token leva para morrer no Android e no iOS), reinstalar e voltar.
4. Idoso sem abrir o app por um dia: o servidor registra os disparos e o aviso sai se um alarme não for respondido.

## 10. Fora de escopo

- O idoso criar os próprios alarmes no modo gerenciado (D5).
- Mais de um cuidador gerenciando (D4).
- Edição pelo cuidador sem internet.
- O servidor mandar mensagem ou fazer tocar no aparelho do idoso.
- App do cuidador na web.

## 11. Ordem de entrega

1. Teste do push silencioso em aparelho (9.1).
2. Módulo de horários compartilhado (5.2).
3. Acordo e lista gerenciada no servidor (3, 4.1, 4.2), com migrações.
4. Pré-registro pelo servidor e pausas (5.1, 5.3–5.5).
5. App do idoso: registro de token, aplicação e confirmação, pedido, listas só leitura, cartão de Configurações, push silencioso (4.3–4.4, 6.2).
6. App do cuidador (4.5, 6.1).
7. Política de Privacidade, textos da anamnese e documentação (7).
