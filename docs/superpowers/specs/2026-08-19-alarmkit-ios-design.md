# AlarmKit como alarme real no iOS 26+ — design

**Data:** 2026-08-19
**Status:** aprovado, pronto para plano de implementação
**Antecedente:** Fase 0 (spike) medida no iPhone 12, branch `spike/alarmkit`

---

## Problema

No iPhone, o alarme do Vigora hoje é uma **notificação** com Critical Alerts. Ela
fura o silencioso e o Foco, mas toca **uma vez** e vira um banner. O que o idoso
associa ao "alarme" — som em loop, tela cheia, a voz dizendo o remédio, o botão de
confirmar — vive na `alarm-ring`, e essa tela **só abre se ele tocar no banner**.

Quem não toca não vê nada. O som já parou, a voz nunca falou, e o countdown do
cliente não roda — a escalação fica só com o backstop do servidor (5–10 min). Num
app cujo diferencial é avisar a família quando o idoso não responde, o caso mais
comum de falha é justamente esse: o alarme não insistiu o suficiente para ser
respondido.

No Android isso não acontece: o `AlarmService` nativo toca em loop e abre a tela
cheia sozinho. O iOS é que estava sem equivalente — até o AlarmKit (iOS 26).

## Escopo

Substituir o mecanismo de disparo do alarme **no iOS 26+** por AlarmKit, mantendo
o caminho atual intacto abaixo disso. Android não é tocado.

Fora de escopo: mudar a escalação do servidor, o `monitoring-job`, a `alarm-ring`
do Android, ou o formulário de alarme.

---

## Arquitetura

Um único ponto de decisão, no agendamento:

```
scheduleFullAlarm (lib/alarm-sync.ts)
  ├── Android  → expo-alarm-module            (inalterado)
  ├── iOS 26+  → AlarmKit                     NOVO
  └── iOS <26  → expo-notifications + Critical Alerts   (inalterado)
```

A escolha é por **capacidade**, não por versão declarada: o módulo expõe um
`isAvailable` que só devolve `true` quando a classe nativa respondeu. Um aparelho
26.x com AlarmKit indisponível por qualquer motivo cai no fallback em vez de ficar
sem alarme — a regra de cobertura de dispositivos do `CLAUDE.md`.

### Unidades

| Unidade | Propósito | Depende de |
|---|---|---|
| `lib/ios-alarm-kit.ts` | Fachada JS: `isAvailable`, `schedule`, `cancel`, `drainDismissals` | `expo-alarm-kit` |
| `lib/alarm-sync.ts` | Escolhe o caminho; migra quem vem do antigo | fachada acima |
| App Group store | Evidência do dismiss escrita pelo intent, fora do processo do app | entitlement |

A fachada existe para que `alarm-sync` não conheça a lib: se um dia trocarmos
`expo-alarm-kit` por módulo próprio, muda um arquivo.

---

## O que a Fase 0 já respondeu

Medido no iPhone 12, não suposto:

- **Som `.default` toca em loop** furando silencioso + Não Perturbe, em tela cheia,
  com o nome do alarme correto. (Q1)
- **Som próprio funciona com extensão** — `alarm.mp3` ✓, `alarm` ✗. (Q2)
- **O intent de dismiss roda** nos caminhos reais de dispensa, inclusive arrastando
  o banner: 8 de 9 rodadas. (Q3)
- **App Group é obrigatório**: sem ele `configure()` devolve `false` e o intent não
  registra nada.

Nada disso será re-medido.

---

## A experiência: um toque só

O **"Desligar" do AlarmKit é a confirmação**. O app abre em seguida, confirma ao
servidor, e a `alarm-ring` aparece já resolvida: fala o nome do remédio, mostra
"Confirmado", e oferece "Adiar 5 min" a quem quiser. Sem countdown e sem segundo
botão obrigatório.

O motivo de não exigir um segundo toque: a `alarm-ring` existe hoje porque a
notificação **não consegue** tomar a tela. Com o AlarmKit essa limitação some.
Manter um passo obrigatório que só existia por causa dela seria cobrar do idoso um
trabalho sem razão — e o público tem 60+.

**A escalação do cliente não regride.** Hoje, no iPhone, quem ignora o banner
também não gera countdown nenhum: a `alarm-ring` nem monta. O AlarmKit melhora
esse caso, porque o alarme insiste até alguém encostar. Onde o cliente não
confirma, o backstop do servidor continua sendo o que já é.

## Soneca: não vai para a tela do sistema

O `AlarmSnoozeIntent` da lib **não é usado**. `docs/claude/alarmes.md` já registra
por que a soneca nativa do Android foi removida: ela reagenda sem o JS saber, o
evento fica sem confirmação, e a família é avisada de um alarme que o idoso
**tinha** atendido. O botão do AlarmKit tem exatamente o mesmo defeito, na mesma
feature. Soneca só dentro do app, depois do dismiss.

## Recorrência

`Alarm.Schedule.Relative.Recurrence.weekly` cobre os quatro casos nativamente:

| `alarm.repeat` | AlarmKit |
|---|---|
| `daily` | `weekly` com os 7 dias |
| `weekdays` | `weekly` seg–sex |
| `weekends` | `weekly` sáb+dom |
| `custom` | `weekly` com `customDays` |

Sem reagendamento manual por ocorrência — o que elimina, no iOS 26+, a classe de
bug que produziu as notificações órfãs (commit `7942787`).

## Migração

Ao agendar pelo AlarmKit, as notificações daquele alarme são canceladas por
`alarmId` via `cancelScheduledAlarmNotifications` — a função criada em `7942787`.
Sem isso o alarme toca duas vezes em quem atualizar o app.

Na direção contrária (usuário em 26+ que por algum motivo cai no fallback), o
alarme do AlarmKit é cancelado antes de agendar a notificação. Os dois caminhos
nunca coexistem para o mesmo `alarmId`.

## Reconciliação do dismiss

O intent falhou 1 vez em 9. Sem tratamento, isso vira **família avisada de um
alarme respondido**.

O princípio: **nunca sintetizar um `responded` que não foi observado.** Num dead
man's switch, o falso "respondeu" é muito pior que o falso "não respondeu" — ele
esconde um remédio realmente perdido. Então não há inferência por ausência.

O mecanismo usa a evidência que o próprio intent deixa: ele roda **fora do
processo do app** e grava o `dismissPayload` no App Group. Esse registro sobrevive
ao app não ter subido. Na próxima abertura, `drainDismissals()` lê o que está lá e
manda pela fila de confirmações pendentes que já existe
(`lib/pending-confirmations.ts`), com o horário real do dismiss.

⚠️ **A verificar no início da implementação:** a Fase 0 só exercitou
`getLaunchPayload()`, que devolve o dismiss quando o app **foi aberto pelo
intent**. Se a lib não expõe leitura do que ficou de dismisses anteriores, este
mecanismo precisa de um acréscimo — ler o `UserDefaults` do App Group direto, ou
um patch pequeno na lib. Sem essa leitura durável, a reconciliação não existe e
sobra só o `launchAppOnDismiss`, que cobre 8 de 9 casos. Confirmar antes de
construir o resto.

Confirmação tardia **corrige** o registro: `updateAlarmEventStatusByAlarmId` aceita
`responded` sobre `missed`/`not_sent` (ver `docs/claude/alarmes.md`). O que não dá
para desfazer é a mensagem já enviada — por isso `launchAppOnDismiss: true` segue
ligado, para que o caminho normal confirme em segundos, dentro do grace de 5 min.

## Perda aceita: o slider de volume

`settings.alarmVolume` **deixa de valer** no iOS 26+ — o AlarmKit toca no volume de
alarme do sistema e não aceita escalar. O slider é escondido nesses aparelhos, com
uma linha explicando que o volume do alarme é o do celular. Um controle que não faz
nada é pior que controle nenhum.

---

## Risco de compilação (resolver primeiro)

Todas as 9 declarações de topo do Swift da lib são `@available(iOS 26.0, *)`,
inclusive a classe `ExpoAlarmKitModule`. O `ExpoModulesProvider.swift` que o Expo
gera no prebuild referencia as classes **sem guarda** (`ExpoAlarmKitModule.self`),
então com o alvo do app em 15.1 o Swift tende a recusar:
*"only available in iOS 26.0 or newer"*.

A Fase 0 não cobriu isso porque rodou com o alvo em **26.1**, onde tudo está
disponível.

A tentativa mínima é uma linha no podspec: baixar `s.platforms = { :ios => '26.1' }`
para a base do app (15.1), e tirar o `deploymentTarget: "26.1"` que a Fase 0 pôs no
`app.config.ts`. Se o provider quebrar, a correção é mover as guardas para
**dentro** da classe do módulo, em vez de deixá-las na declaração — trabalho
contido, num arquivo só.

**Este é o primeiro item do plano de implementação.** Todo o resto depende de
existir binário instalável abaixo do iOS 26, e o custo de descobrir isso depois de
construir a migração inteira é alto demais.

---

## Testes

O que roda no vitest:

- Escolha de caminho: 26+ com AlarmKit disponível → AlarmKit; 26+ indisponível →
  fallback; <26 → fallback. Mockando a fachada, nunca a lib.
- Mapeamento de `repeat` → dias da recorrência, nos quatro casos.
- Migração: agendar pelo AlarmKit cancela as notificações daquele `alarmId`, e
  vice-versa; nunca os dois vivos para o mesmo alarme.
- `drainDismissals` enfileira confirmação com o horário do dismiss, e não inventa
  confirmação quando o App Group está vazio.

O que **só** o aparelho responde, e vira roteiro de teste manual:

- O app compila e instala num iPhone abaixo do iOS 26 (risco acima).
- Alarme toca em loop, tela cheia, com o silencioso ligado.
- "Desligar" confirma e o app abre com a voz certa.
- Alarme recorrente dispara no segundo dia sem reagendamento manual.
- Quem atualiza o app não recebe alarme duplicado.

Um teste que não é o alarme não é teste — a regra do `docs/claude/alarmes.md` vale
aqui inteira.

---

## Fora de escopo, anotado

- **Volume por alarme no iOS 26+**: sem caminho conhecido na API.
- **Timer/countdown do AlarmKit** (`scheduleTimerAlarm`): não usamos.
- **Substituir a `alarm-ring` do Android**: o `AlarmService` já faz o papel.
- **Pending futuro do servidor ao desabilitar alarme**: vão conhecido, já
  registrado em `docs/claude/alarmes.md`, independente desta mudança.
