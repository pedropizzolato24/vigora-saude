# Feedback do beta (out/2026) — Fases 1 a 3

**Data:** 2026-10-02 · **Branch base:** `fix/launch-prep` (HEAD `afef6e0`) · **Status:** aguardando revisão do Pedro

Origem: o documento "APP MONITORADO.txt" do teste feito com contas de monitorado e
cuidador vinculadas em vários aparelhos, mais a triagem de 01/10/2026.

A Fase 4 (cuidador cria/edita alarmes à distância e o modo "gerenciado pelo cuidador")
fica em spec separada. Esta spec só prepara o terreno para ela.

---

## 1. Objetivo e critério de sucesso

O dead man's switch é o diferencial do Vigora. O teste mostrou que ele falha sem avisar
ninguém em quatro situações, e que a interface promete coisas que não acontecem.

| Fase | Objetivo | Pronto quando |
|---|---|---|
| 1 | O switch não falha sem aviso | Os 4 cenários da seção 3 têm teste automatizado e o swipe foi validado em aparelho |
| 2 | Ajustes pedidos no teste | Cada item da seção 4 está entregue nos modos normal, acessível, claro e escuro |
| 3 | Check-in toca e escala como um alarme | Check-in usa o mesmo caminho dos remédios, aceita vários horários e tem atraso de aviso configurável |

Vale para as três fases: `tsc --noEmit` sem erro novo, suíte Vitest verde, nada de
dado de saúde em log ou em corpo de push, nenhuma lógica que avalie métrica de saúde.

## 2. Decisões assumidas (confirmar na revisão)

Estas decisões foram recomendadas na triagem e ainda não foram confirmadas. A spec
inteira parte delas; trocar qualquer uma muda a seção indicada.

| # | Decisão assumida | Alternativa descartada | Afeta |
|---|---|---|---|
| D1 | Swipe na notificação do alarme faz a notificação voltar | Swipe contar como resposta | 3.3 |
| D2 | Histórico mantém eventos de alarme excluído, marcados "(excluído)" | Esconder | 4.7 |
| D3 | Opção "Idioma" é removida | Traduzir o app | 4.2 |
| D4 | Check-in vira um tipo de alarme | Manter o sistema paralelo | 5 |
| D5 | Convite por WhatsApp compartilha o código de 10 min, com o prazo no texto | Link de 24 h no sentido idoso→cuidador (exige rota nova no servidor) | 4.4 |
| D6 | Os 3 interruptores de notificação do cuidador são removidos (hoje não têm efeito) | Enviar a preferência ao servidor e respeitá-la no envio | 4.9 |
| D7 | "Baixar" continua sendo a folha de compartilhar do sistema, com nomes claros | Gravar direto em Downloads (Storage Access Framework) | 4.5 |
| D8 | Push sobre alteração de lembrete não leva o nome do remédio | Levar o nome | 3.4 |

## 3. Fase 1 — o switch não pode falhar sem aviso

### 3.1 Check-in do dia seguinte não é registrado

**Causa.** `createNextCheckinEvent` (`lib/checkin-service.ts:271`) calcula o prazo com
`computeTimeoutDate(agora)`. Antes do prazo de hoje, isso devolve o prazo de hoje, que
já existe no servidor. O de amanhã nunca é criado, e um check-in perdido amanhã não
avisa ninguém.

**Correção.** Quando o check-in de hoje já foi respondido (ou já venceu), registrar o
prazo de amanhã com `computeNextTimeoutDate`, a mesma função que a notificação local
já usa. Quando ainda não foi respondido, continuar registrando o de hoje.

**Teste.** Resposta às 09:05 com prazo às 09:30 registra o prazo de amanhã 09:30.

Esta correção é substituída pela Fase 3, mas entra antes porque é pequena e o defeito
é grave.

### 3.2 Disparo de remédio não registrado quando o app não é reaberto do zero

**Causa.** O próximo disparo de cada alarme só é registrado no servidor em cold start,
login ou edição do alarme (`components/monitoring-initializer.tsx`). Voltar do segundo
plano não registra. Do segundo disparo em diante, o servidor não tem evento pendente
e não escala.

**Correção.** No `MonitoringInitializer`, chamar `syncAlarmsToServer` também quando o
app volta a ficar ativo (`AppState → active`), no máximo uma vez por minuto. Como
responder ao alarme sempre abre o app (tela cheia, toque na notificação ou botão
"Dispensar"), toda resposta passa a registrar o disparo seguinte. Não muda nada no
servidor: `createAlarmEvent` já mantém um único pendente futuro por alarme e não toca
nos pendentes passados.

**Lacuna que fica.** Se o alarme toca e ninguém interage, o disparo registrado escala
normalmente, mas o seguinte só é registrado na próxima abertura do app. A escada de
30 min / 2 h / 6 h continua avisando nesse intervalo. O fechamento definitivo é o
servidor calcular os disparos sozinho, que entra na Fase 4.

**Teste.** Simular `AppState → active` duas vezes em menos de um minuto: uma chamada.
Depois de um minuto: outra chamada.

### 3.3 Swipe na notificação do alarme (Android 14+)

**Causa.** O Android 14 passou a permitir swipe em notificação com `setOngoing(true)`.
O swipe dispara o `deleteIntent`, que chega ao `NotificationActionReceiver` como
`DISMISS_ACTION` e chama `Manager.stop()` em Java. O alarme para, o JS não fica
sabendo, o evento continua pendente e o servidor avisa a família.

**Correção (D1).** No patch de `expo-alarm-module`, o `DISMISS_ACTION` deixa de parar
o alarme. Se há alarme ativo (`Manager.getActiveAlarm() != null`), o receiver publica
de novo a mesma notificação (id 1, `Helper.getAlarmNotification`), com o botão
"Dispensar" e o full-screen intent. Som e vibração continuam. Se não há alarme ativo,
o receiver só cancela a notificação.

O `DISMISS_ACTION` hoje só é usado pelo swipe (os botões usam deep link desde
`fb7f379`), então nenhum outro caminho muda.

**Fora do alcance desta correção.** O relato "continuou tocando e o app não abriu a
tela do alarme" não é explicado pelo código. Tarefa de investigação separada:
reproduzir com logcat no aparelho do testador. Depende de saber modelo, versão do
Android e data do APK. Nenhuma correção é escrita antes da reprodução.

**Verificação.**
- Teste de texto do patch, no padrão de `tests/android-alarm-dismiss-confirms.test.ts`:
  o ramo `DISMISS_ACTION` não chama `Manager.stop` e chama `notify`.
- Aparelho: um Android 14+ primeiro (S21 FE ou S23). Swipe cinco vezes seguidas: a
  notificação volta, o som não para, "Dispensar" confirma no servidor. Só depois os
  demais aparelhos.
- Atualizar `docs/claude/alarmes.md` (a seção "Vão conhecido — o swipe" deixa de ser
  pendência).

Lembrete de processo: `pnpm patch` extrai o pacote original; reaplicar o patch atual
antes de editar.

### 3.4 Alarme excluído ou desativado some sem deixar rastro

**Causa.** O `monitoring-job` apaga o evento pendente de um alarme que saiu da lista ou
foi desativado (`isAlarmStillArmed`). É o comportamento certo para não gerar alerta
falso, mas ninguém fica sabendo que o alarme deixou de existir.

**Correção.** Em `userData.put`, antes de gravar, o servidor compara a lista de alarmes
gravada com a recebida, por `id`:

| Mudança detectada | Tipo |
|---|---|
| `id` existia e não existe mais | `deleted` |
| `enabled` passou de verdadeiro para falso | `disabled` |
| `time`, `repeat` ou `customDays` mudou | `rescheduled` |

Criação e reativação não geram registro. Se a lista anterior não é um array (conta
nova, formato antigo), não há comparação.

Cada mudança vira uma linha na tabela nova `alarm_changes`:

| Coluna | Conteúdo |
|---|---|
| `id` | chave |
| `openId` | dono dos alarmes |
| `alarmId` | id do alarme |
| `alarmDescription` | nome no momento da mudança |
| `changeType` | `deleted` · `disabled` · `rescheduled` |
| `oldTime` / `newTime` | "HH:mm", quando se aplica |
| `createdAt` | quando o servidor recebeu |

Consequências obrigatórias da tabela nova:
- migração Drizzle (roda no boot desde `0b4f13f`);
- entra na exclusão de conta (`server/db-account.ts`) e na exportação (`userData.export`);
  os testes de paridade entre as duas listas precisam continuar passando;
- mesma retenção de 180 dias dos eventos.

**Aviso ao cuidador.** Um push por `userData.put` com mudança, tipo `alarm_changed`,
para os cuidadores com vínculo ativo. Texto sem o nome do remédio (D8), no padrão dos
pushes atuais: "*Nome* alterou os lembretes. Toque para ver os detalhes." O tipo entra
em `CAREGIVER_PUSH_TYPES` e o toque leva à aba de alertas.

**Tela do cuidador.** `link.getMonitoredAlerts` passa a devolver as últimas 20 mudanças.
A aba de alertas mostra cada uma com nome, tipo e horário ("Excluiu *Losartana 08:00*
· ontem 14:32").

**Desvínculo.** Quando o monitorado revoga o vínculo, o cuidador recebe um push
`link_revoked` ("*Nome* encerrou o acompanhamento."). Hoje a revogação não avisa.

**Limite conhecido.** A mudança só chega ao servidor quando o celular do monitorado
envia o backup (3 s depois da alteração, se houver rede). Sem rede, o aviso sai quando
a rede voltar.

**Testes.** Função pura de comparação (excluir, desativar, mudar horário, lista anterior
inválida, lista igual). Um `put` com duas mudanças gera duas linhas e um push.
Autorização: o cuidador só lê mudanças do monitorado ao qual está vinculado.

### 3.5 SOS promete o que não faz

| Hoje | Passa a ser |
|---|---|
| A voz diz "Avisando suas pessoas e ligando para o SAMU" e nenhuma ligação acontece (`components/sos-countdown-dialog.tsx:176`) | "Avisando suas pessoas. Para chamar o SAMU, toque no botão vermelho." |
| "Ligue para o SAMU" é um texto (`components/sos-active-screen.tsx`) | Botão que abre o discador com 192, com o mesmo diálogo de confirmação da tela Ambulância |
| Os "enviado" por contato são simulados por timer | Estado real vindo do resultado de `escalateSOSToContacts`: enviando, enviado, falhou |
| A lista mostra todos os contatos, mas só os com WhatsApp recebem | Contato sem WhatsApp aparece como "não será avisado (sem WhatsApp)" |

A ligação continua sendo feita pelo usuário no discador. O app não liga sozinho e não
se integra ao SAMU, que é a linha que `docs/strategy/regulatory-context.md` proíbe.

**Teste.** O texto falado não contém "ligando". O botão chama `tel:192` só depois da
confirmação. O estado de cada contato reflete o resultado recebido.

## 4. Fase 2 — ajustes pedidos no teste

Todos os itens valem para os modos normal e acessível, salvo indicação.

### 4.1 Remover a soneca
- `showSnooze: false` nos quatro pontos de `lib/native-alarm-manager.ts`.
- Botão "Soneca" sai da `alarm-ring` nos dois modos.
- Saem junto, por ficarem sem uso: `handleSnooze`, o efeito de `&snooze=1`,
  `snoozeNativeAlarm` e a constante `SNOOZE_MINUTES`.
- Fica: o sufixo `_snooze` nas expressões regulares de uid, para um alarme de soneca
  já armado no aparelho no momento da atualização ainda abrir a tela certa.

### 4.2 Remover "Idioma" (D3)
A seção sai de Configurações e `language` sai do tipo e dos padrões de `settings`.
Valor já gravado no aparelho é ignorado.

### 4.3 Telefone de emergência do plano de saúde
- Campo novo `anamnesis.healthPlanPhone`, só dígitos, de 8 a 13.
- Formulário: passo "Plano" no modo normal e um campo no formulário do modo acessível.
- Tela Ambulância: "Plano de Saúde" liga para `healthPlanPhone`. Sem telefone, mostra
  "Configurar" e abre direto o campo. O número da carteirinha deixa de ser discado.
- No modo acessível, a opção "Plano de Saúde" aparece quando há telefone cadastrado.

### 4.4 Convite por WhatsApp (D5)
Botão "Enviar código" em `invite-caregiver.tsx`, usando `Share.share` com o texto:
"Meu código do Vigora é ABC-DEF. Ele vale por 10 minutos. Abra o app Vigora, entre
como cuidador e digite o código." Gerar novo código atualiza o texto.

### 4.5 Exportação e PDF (D7)
- "Baixar meus dados" passa a "Exportar meus dados (arquivo)" com a linha "Arquivo
  técnico com todos os seus dados, para guardar ou levar a outro serviço".
- A seção "Dados e armazenamento" ganha "Relatório de saúde (PDF)", reutilizando
  `HealthReportButton`.
- `exportAnamnesisPDF` (`lib/pdf-utils-v2.ts`): quando o compartilhamento não está
  disponível, a tela mostra o erro em `AppToast` em vez de só registrar no log.
- O aviso de falha do relatório no modo acessível sai de dentro do `ScrollView`.

### 4.6 Atualização no app do cuidador
- Ligar o `focusManager` do React Query ao `AppState`: voltar ao app recarrega as
  consultas ativas. `refetchOnWindowFocus` passa a verdadeiro só para as consultas do
  cuidador.
- Puxar para atualizar nas telas Início, Pessoa e Alertas.
- Linha "Atualizado há X min" (a partir de `dataUpdatedAt` da consulta) e botão de
  atualizar com rótulo de acessibilidade.
- Push recebido com o app aberto invalida as duas consultas.

### 4.7 Histórico de alarmes (D2)
- Evento de alarme que não está mais na lista ganha o sufixo "(excluído)".
- Evento "Agendado" de alarme excluído ou desativado não é mostrado.
- Falha ao carregar mostra erro com "Tentar de novo", em vez do estado vazio.
- "Ver histórico" passa a existir também no modo acessível.

### 4.8 Formulário de lembrete em lista (modo normal)
Criar e editar passam a ser uma tela única com rolagem, nesta ordem: Nome, Que horas
tomar, Repetição, Som, Vibração, Habilitado. Na edição, "Excluir lembrete" fica no fim,
com a confirmação atual. O assistente de dois passos sai. O modo acessível mantém o
formulário próprio e ganha os interruptores Som e Vibração.

### 4.9 Rótulos e interruptores do cuidador (D6)
- Check-in perdido aparece como "Check-in não respondido", não como alarme.
- Evento `not_sent`: "Sem confirmação do aparelho" no lugar de "celular pode estar
  desligado". O servidor não sabe se o alarme tocou; o texto novo não afirma nada.
- Os três interruptores de notificação do cuidador saem da tela.

## 5. Fase 3 — check-in como tipo de alarme (D4)

### 5.1 Modelo
`Alarm` ganha dois campos opcionais:

| Campo | Valores | Padrão |
|---|---|---|
| `kind` | `'medication'` · `'checkin'` | ausente = `'medication'` |
| `escalateAfterMinutes` | 5 · 10 · 15 · 30 | ausente = 5 |

Um check-in é um alarme com `kind: 'checkin'`. Ele vive em `state.alarms`, é agendado
por `scheduleFullAlarm` e toca pelo mesmo caminho: módulo nativo no Android, AlarmKit
no iOS 26+, notificação crítica no iOS anterior. O limite de 24 alarmes vale para a
soma de remédios e check-ins.

### 5.2 Telas do monitorado
- **Início:** o bloco "Avisar família" dá lugar a "Check-in". No modo acessível entra
  um botão "Check-in". Contatos continuam acessíveis pela aba "Tudo".
- **Tela Check-in** (`app/(tabs)/checkin.tsx`): lista dos check-ins com o mesmo
  cartão e o mesmo formulário dos remédios. Diferenças: sem campo de nome (o título é
  fixo, "Check-in"), e com o campo "Avisar meu cuidador depois de" (5, 10, 15 ou
  30 min).
- **Meus remédios:** lista só `kind` diferente de `'checkin'`.
- **Tela do alarme (`alarm-ring`), variante check-in:** título "Está tudo bem?",
  botão único "Estou bem", fala "Hora do seu check-in. Toque em Estou bem." A contagem
  regressiva usa `escalateAfterMinutes` no lugar de `timerDuration`.
- **Notificação nativa:** título "Check-in: está tudo bem?", botão "Estou bem".
- **Configurações:** a seção "Check-in diário" vira um atalho para a tela nova.

### 5.3 Servidor
- `alarm_events` ganha `kind` (texto, nulo = remédio) e `graceMinutes` (inteiro, nulo
  = 5), enviados pelo cliente em `monitoring.createEvent` e validados com Zod
  (`kind` em lista fechada, `graceMinutes` em 5, 10, 15, 30).
- `monitoring-job`, Passo 1: o prazo de cada evento passa a ser
  `scheduledAt + (graceMinutes ?? 5)`.
- Textos de escalação e push escolhidos por `kind`. O id fixo `checkin-daily`
  continua reconhecido como check-in enquanto houver evento antigo dentro da janela
  de 48 h.
- Check-in passa a obedecer `isAlarmStillArmed` como qualquer alarme, o que também o
  coloca no registro de mudanças da seção 3.4.

Atraso até o cuidador: de `escalateAfterMinutes` (app aberto) até
`escalateAfterMinutes` + 5 min (job a cada 5 min). Hoje são 30 a 40 min.

### 5.4 Migração e remoção do sistema antigo
Na primeira abertura depois da atualização, uma migração local única:
1. Se `settings.checkinEnabled` é verdadeiro, cria um alarme `kind: 'checkin'`, diário,
   no horário de `settings.checkinTime`, com `escalateAfterMinutes: 30` (o
   comportamento que o usuário tinha).
2. Cancela as notificações `checkin_prompt` e `checkin_timeout` agendadas.
3. Marca a migração como feita.

Saem do código: `lib/checkin-service.ts`, `lib/checkin-notification-handler.ts`,
`lib/checkin-dedup.ts`, `lib/checkin-defaults.ts`, `components/checkin-initializer.tsx`,
`app/checkin-response.tsx`, o tratamento de check-in no `checkInitialAlarm` do
`_layout.tsx`, os campos `checkin*` de `settings` e os testes correspondentes. O canal
de notificação `vigora-checkin` é apagado no boot.

### 5.5 Cuidador
Início e Pessoa separam "Próximo remédio" de "Próximo check-in". Alertas usam o rótulo
por `kind`.

### 5.6 Testes
- Migração: com check-in ligado cria um alarme; desligado não cria; roda uma vez só.
- Job: evento com `graceMinutes: 15` não vence aos 10 min e vence aos 15.
- Zod recusa `graceMinutes: 7` e `kind` desconhecido.
- `alarm-ring` na variante check-in usa `escalateAfterMinutes` na contagem.
- Aparelho: check-in tocando com tela bloqueada e desbloqueada, Android e iOS 26+.

## 6. Fora de escopo

- Cuidador editar alarmes à distância e modo "gerenciado pelo cuidador" (Fase 4).
- Servidor calcular os disparos sem depender do app (Fase 4).
- Check-in manual a qualquer hora ("Estou bem agora"): não foi pedido no teste.
- Link de convite de 24 h no sentido monitorado→cuidador.
- Gravar arquivos direto na pasta Downloads.
- Atraso configurável para alarmes de remédio: o campo existe no modelo, a tela não.
- Detecção de swipe no iOS anterior a 26.
- Tela cheia com o aparelho em uso: é limite do Android, não há correção no app.

## 7. Segurança, LGPD e ANVISA

- Nenhum dado novo é coletado. `alarm_changes` guarda um derivado do que já está em
  `user_data.alarms`, com a mesma base legal, e entra em exportação e exclusão.
- Push não leva nome de remédio (D8). Logs do servidor registram ids, não nomes.
- Toda entrada nova de rota tRPC é validada com Zod.
- Nenhuma permissão Android nova.
- Nada aqui interpreta ou classifica métrica de saúde.
- O botão do SAMU abre o discador; a ligação é do usuário.

## 8. Ordem de entrega

Cada linha é um PR pequeno contra `fix/launch-prep`, nesta ordem.

| # | Entrega | Seção | Depende de |
|---|---|---|---|
| 1 | Registro do check-in do dia seguinte | 3.1 | — |
| 2 | Registro do próximo disparo ao voltar ao app | 3.2 | — |
| 3 | Swipe: notificação volta (patch + validação em 1 aparelho) | 3.3 | — |
| 4 | Investigação do "continua tocando" | 3.3 | dados do testador |
| 5 | Registro de mudanças de alarme + push + desvínculo | 3.4 | — |
| 6 | SOS honesto | 3.5 | — |
| 7 | Soneca, idioma, rótulos e interruptores do cuidador | 4.1, 4.2, 4.9 | — |
| 8 | Telefone do plano, convite por WhatsApp, exportação | 4.3, 4.4, 4.5 | — |
| 9 | Atualização no cuidador | 4.6 | — |
| 10 | Histórico e formulário em lista | 4.7, 4.8 | 7 |
| 11 | Check-in: modelo, servidor e migração | 5.1, 5.3, 5.4 | 5, 10 |
| 12 | Check-in: telas do monitorado e do cuidador | 5.2, 5.5 | 11 |

Depois da entrega 12: build de teste, rodada nos 5 aparelhos do Test Lab e nova
rodada com o testador original.
