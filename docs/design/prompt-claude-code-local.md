# Prompt para o Claude Code local — implementação do roadmap de monitoramento

> Cole o bloco abaixo como primeira mensagem numa sessão nova do Claude Code
> local, no repositório `vigora-saude`.

---

## Contexto

Investigamos um bug de produção: ao trocar de conta no mesmo aparelho (ex.:
de "monitorado" para "cuidador"), o app entrava em loop de login. A raiz foi
um problema estrutural maior — o sistema de monitoramento usa **duas
identidades concorrentes**: `deviceId` (por aparelho) e `openId` (por conta).
Contas diferentes no mesmo aparelho colidiam na mesma linha de dados.

O bug agudo já foi corrigido (branch `claude/login-loop-bug-9oevus`, PR #56 —
**confira o estado atual dessa branch/PR antes de começar**: pode já estar
mergeada, ou ainda aberta). Mas a correção do sintoma não resolveu a causa:
`deviceId` continua sendo usado como chave de posse de dados em várias
tabelas, quando deveria ser só `openId`.

A partir dessa investigação, produzimos um **design doc completo** com:
- a arqueologia de por que `deviceId` existe e por que deixou de fazer sentido;
- o modelo de dados novo (posse por `openId`, `deviceId` só como metadado de
  liveness);
- um achado separado (bug pré-existente, não relacionado à troca de conta);
- uma proposta de produto ainda **não decidida** (login opcional);
- um plano de migração de dados e uma ordem de implementação sugerida.

**Leia o documento inteiro antes de fazer qualquer mudança:**
`docs/design/2026-07-12-monitoring-account-ownership.md`

Ele é a fonte da verdade para tudo abaixo — este prompt só te dá o roteiro de
execução; as decisões técnicas (schema, migração, quais tabelas somem, etc.)
estão todas lá.

---

## Como trabalhar

- **Um item do roadmap por vez.** Ao terminar um item, **pare** e me
  apresente um resumo do que mudou, o resultado dos testes, e qualquer
  decisão que você tomou no caminho. Espere minha aprovação antes de seguir
  para o próximo item.
- **Cada item = branch própria**, partindo de `main` atualizado (ou da branch
  do PR #56 se ele ainda não tiver sido mergeado — confirme comigo se tiver
  dúvida sobre em cima de qual base trabalhar).
- **Dead man's switch é código de segurança de vida.** Qualquer mudança nas
  tabelas de monitoramento ou no `monitoring-job.ts` exige: rodar a suíte de
  testes completa, e para migrações de schema/dados em produção, me perguntar
  explicitamente antes de aplicar contra o banco real (Railway MySQL) — nunca
  aplique migração destrutiva sem minha confirmação explícita, mesmo que o doc
  já descreva o plano.
- **Não invente escopo.** Se, ao implementar, você achar um problema ou
  ambiguidade que o doc não cobre, pare e me pergunte — não decida sozinho e
  não expanda o que foi pedido.

---

## Ordem de implementação (do doc, seção final)

Siga esta ordem. Para cada item, o doc tem a seção correspondente com todos
os detalhes técnicos — não resumo tudo aqui de novo.

### 1. Corrigir o falso alarme por inatividade
**Seção do doc:** "Anexo B — Achado: falso alarme do dead man's switch por
inatividade"
Bug ativo em produção, urgência máxima, dificuldade baixa. O `monitoring-job.ts`
escala pra família por **pura ausência de heartbeat**, sem exigir que um
alarme/check-in tenha realmente vencido sem confirmação — desinstalar, fazer
logout, ou só deixar o app em segundo plano já dispara aviso falso. O doc
propõe 3 alavancas; a recomendada como base é gatear a escalação por
inatividade para só disparar havendo evento esperado e não confirmado. Comece
por aqui.

### 2. Refatoração de posse por `openId`
**Seção do doc:** corpo inteiro do spec (da "Contexto" até "Plano de
implementação"), incluindo as 7 slices já detalhadas lá.
É a raiz do bug original e pré-requisito técnico do item 4. Envolve migração
de schema em 5 tabelas (elimina `app_users` e `synced_alarms`, re-chaveia
`device_heartbeat`/`alarm_events`/`warning_log` por `openId`), mudanças no
servidor inteiro e no cliente. Siga as slices do doc na ordem — cada slice já
é pensada como commit/revisão independente; não precisa parar entre slices
dentro deste item, mas pare ao final do item 2 inteiro antes de seguir.
**Backup do MySQL antes de qualquer migração contra dados reais.**

### 3. Renomear "monitorado"/"cuidador" (copy)
**Seção do doc:** "Nota de copy em aberto: renomear 'monitorado'" (dentro de
"Contas sem login").
Baixo custo, zero dependência — pode ser feito a qualquer momento, inclusive
fora de ordem. O doc só sugere direções ("é para mim" / "é para alguém que eu
cuido", ou "acompanhado(a)" como substantivo) — **não é uma decisão final de
copy**. Antes de implementar, me apresente 2–3 opções de nomenclatura para eu
escolher, não implemente a primeira sugestão do doc direto.

### 4. Login opcional via conta anônima
**Seção do doc:** "Contas sem login (conta anônima)".
**Ainda não está decidido implementar** — o doc marca essa seção como
"proposto / em discussão". Ao chegar neste item, **não implemente** — pare e
me pergunte explicitamente se seguimos com essa mudança de produto antes de
escrever qualquer código. Se eu confirmar, ela depende do item 2 já estar
concluído (identidade única por `openId` precisa existir primeiro).

---

Comece lendo o documento inteiro, depois confirme comigo o estado atual do
PR #56 e me diga se está tudo claro para começar pelo item 1.
