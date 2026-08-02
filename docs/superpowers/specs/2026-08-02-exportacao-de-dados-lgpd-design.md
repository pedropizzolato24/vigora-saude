# Exportação de dados (LGPD Art. 18 V) — design

**Data:** 2026-08-02
**Item do roadmap:** #5 de `docs/claude/roadmap.md`
**Status:** aprovado, pronto para plano de implementação

---

## Problema

A LGPD Art. 18 V dá ao titular o direito à **portabilidade**: receber seus dados em
formato estruturado e legível por máquina. O Vigora já implementa o Art. 18 VI
(exclusão de conta, via `hooks/use-delete-account.ts` + `server/db-account.ts`), mas
não tem nenhum caminho de exportação. O único "export" existente é o relatório de saúde
em PDF (`lib/health-report-generator.ts`), que serve para leitura humana e não atende
portabilidade.

Como o Vigora trata dados sensíveis de saúde de idosos, ele cai no regime de alto risco
da ANPD (Resolução CD/ANPD nº 2/2022, Art. 4, II-d) e não pode usar o regime
simplificado de pequeno porte — as obrigações valem em força total. Ver
`docs/strategy/regulatory-context.md`, seção 2.

## Escopo

Exportar **tudo que o controlador guarda** — ou seja, o servidor — mais o que existe no
aparelho. Só o local não bastaria: o histórico de disparos de alarme (`alarm_events`) e
o registro de alertas enviados aos contatos (`warning_log`) existem apenas no servidor,
e são justamente os dados que o titular não tem outra forma de ver.

Fora de escopo: exportação em PDF (já existe para saúde), agendamento de exports,
export de dados de outra conta (um cuidador não exporta os dados da pessoa acompanhada).

---

## Arquitetura

Três unidades novas, cada uma com um propósito único:

```
server/routers.ts → userData.export          o que o servidor guarda
lib/_core/data-export.ts                     monta o JSON (função pura)
components/data-export-button.tsx            gera arquivo + compartilha
components/account-danger-zone.tsx           move a exclusão de conta para cá
                    ↓
app/(tabs)/profile.tsx                       passa a hospedar os dois
```

### Espelhamento export ↔ delete

`server/db-account.ts` já enumera toda tabela que guarda dado da conta, para poder
apagá-la. O `export` usa **exatamente a mesma lista de tabelas**. Os dois arquivos
ganham um comentário cruzado: tabela nova precisa entrar nos dois lugares, senão o app
passa a guardar dado que não exporta (ou a exportar dado que não apaga).

---

## Servidor — `userData.export`

`protectedProcedure.query`, chaveado por `ctx.user.openId`. Nunca aceita openId como
input — o titular só exporta a si mesmo.

**Inclui:**

| Tabela | Conteúdo |
|---|---|
| `users` | nome, e-mail, telefone da conta |
| `user_data` | anamnese, contatos de emergência, alarmes, métricas de saúde, perfil, configurações |
| `alarm_events` | histórico de disparos de alarme e respostas |
| `warning_log` | alertas enviados aos contatos de emergência |
| `account_liveness` | último sinal de vida registrado |
| `caregiver_links` | vínculos ativos com cuidadores |

**Exclui deliberadamente** (com a justificativa escrita no código, para não parecer
omissão):

- `auth_codes` — códigos de login em trânsito. São segredos; exportá-los seria uma
  falha de segurança, não um direito atendido.
- `push_tokens` — identificadores de aparelho. Não têm significado nem utilidade para o
  titular.
- `link_invites` — convites transitórios que expiram sozinhos.

---

## Cliente — `lib/_core/data-export.ts`

Função pura, sem UI (convenção de `lib/_core/`):

```ts
buildExportPayload({ local, server, serverUnavailable }) => ExportPayload
```

Onde `local` é o `state` do `AppContext` (anamnese, contatos, alarmes, métricas de
saúde, perfil, configurações — o que está no AsyncStorage) e `server` é a resposta de
`userData.export`, ou `null` quando `serverUnavailable` é `true`.

O payload tem um cabeçalho com data de geração, versão do app e o campo
**`servidor_incluido: boolean`**. Quando o servidor não respondeu, o campo vai `false` e
entra um `aviso` em português explicando que a parte do servidor faltou e como pedir de
novo. O arquivo fica autoexplicativo mesmo aberto fora do app.

Toda a lógica testável mora aqui — é o que permite cobrir o comportamento sem montar UI.

---

## Erros e fallback

Segue a regra de cobertura de dispositivos do `CLAUDE.md` (sempre ter caminho de
fallback, nunca engolir erro com `catch {}`):

1. Tenta o servidor. Respondeu → JSON completo, `servidor_incluido: true`.
2. Falhou (offline, 503, timeout) → **gera assim mesmo** com os dados locais,
   `servidor_incluido: false`, loga o motivo real no console e mostra `AppToast` de
   aviso. O usuário sai com algo na mão.
3. Só falha de verdade se nem os dados locais existirem → `AppDialog` de erro.

Nenhum dado de saúde entra em log em nenhum caminho (regra 1 de Segurança do
`CLAUDE.md`).

---

## UI — reorganização da tela de Perfil

Hoje "Excluir minha conta" mora em Configurações, o que não casa com o modelo mental do
usuário. Os dois direitos do Art. 18 passam a morar no Perfil, que é onde a conta é
gerenciada.

### Layout do rodapé do Perfil

```
[ Salvar Perfil ]          já existe
[ Baixar meus dados ]      NOVO — fora da zona perigosa
[ Sair da Conta ]          já existe, permanece vermelho e inalterado

╭─ ⚠ Zona perigosa ────────╮   NOVO
│ Excluir minha conta       │
│ Apaga permanentemente…    │
│       [ Excluir conta ]   │
╰───────────────────────────╯
```

A zona perigosa segue o padrão do GitHub: caixa delimitada, borda de alerta, título
próprio e uma linha explicando a consequência antes do botão. O diálogo de confirmação
forte que já existe ("Esta ação é PERMANENTE…") vem junto, sem alteração de texto.

**Decisão de layout registrada:** "Sair da Conta" fica vermelho como está hoje. Foi
considerado neutralizar a cor (sair é reversível, excluir não é), mas optou-se pela
alternativa mais cirúrgica — não mexer no que não faz parte do pedido.

### Rótulo

O botão diz **"Baixar meus dados"**, não "exportar". Mais direto para o público 60+.

### Mecânica

Segue o padrão já provado do `HealthReportButton`: estado de carregando →
`expo-file-system` escreve `vigora-meus-dados-AAAA-MM-DD.json` → `Sharing.shareAsync()`
abre a folha nativa (WhatsApp, e-mail, Drive).

`expo-file-system@19.0.23` já vem instalado como dependência direta do pacote `expo` —
não é dependência nova e não exige rebuild nativo. Atenção na implementação: a v19
(SDK 54) mudou a API; a antiga ficou em `expo-file-system/legacy`. Confirmar qual usar
ao implementar.

### Acessibilidade

Paridade obrigatória nos dois modos (normal e acessível), conforme `docs/claude/ui.md`:
cores por token (zero hex), alvo de toque ≥44px (≥60px no modo acessível), fontes
respeitando os mínimos, `AppDialog`/`AppToast` em vez de `Alert.alert()`.

### O que sai de `settings.tsx`

Remove `handleDeleteAccount`, a chamada de `useDeleteAccount`, o estado `isDeleting` e
os dois blocos de UI (linhas ~761 no modo acessível e ~1624 no normal), mais os imports
que ficarem órfãos por causa **desta** remoção. Saldo aproximado: −60 linhas num arquivo
que hoje tem 1945.

Código morto pré-existente não relacionado não é tocado (regra 3 do `CLAUDE.md`).

---

## Testes

O peso vai na função pura, que é onde mora a lógica:

- `buildExportPayload` inclui todas as seções quando o servidor responde
- marca `servidor_incluido: false` e injeta o aviso quando o servidor falha
- não vaza `auth_codes` nem `push_tokens` no payload
- `userData.export` de um usuário nunca retorna dado de outro `openId` (autorização)

Critério de sucesso: suíte verde (330+ testes atuais mais os novos), `tsc --noEmit`
limpo, e o fluxo validado em aparelho real gerando um JSON legível.

---

## Referências

- `docs/strategy/regulatory-context.md` — seção 2 (LGPD), item 6 da checklist pré-lançamento
- `docs/claude/roadmap.md` — item 5
- `server/db-account.ts` — lista canônica de tabelas por conta (espelho do export)
- `components/health-report-button.tsx` — padrão de gerar + compartilhar
