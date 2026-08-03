# Convite por link (cuidador → monitorado) — Design

**Status:** ✅ Implementado (2026-06-01). Decisão: vínculo com **toque "Aceitar"** (não automático), por LGPD e UX. Falta apenas a configuração de domínio (ver §6 e o checklist abaixo) para os links `https` abrirem o app.
**Autor:** Pedro + Claude (2026-06-01)
**Escopo:** Segundo método de vínculo em que o **cuidador** gera um link, compartilha (WhatsApp/SMS/email) e o **monitorado** se vincula ao abrir + tocar "Aceitar". O método por **código de convite + QR** (cuidador resgata código do monitorado) já existe (Fases 1–4) e permanece o caminho principal.

**Implementação:** backend `link.createShareInvite` / `link.getInviteInfo` / `link.acceptInvite` ([server/routers-links.ts](../../../server/routers-links.ts)), token de 16 chars ([server/links-code.ts](../../../server/links-code.ts)); tela [app/convite/[token].tsx](../../../app/convite/%5Btoken%5D.tsx); botão "Convidar por link" em [app/(caregiver-tabs)/link.tsx](../../../app/(caregiver-tabs)/link.tsx); retomada de token via [lib/pending-invite.ts](../../../lib/pending-invite.ts) + checks em login/register + stash no `OnboardingGate` via `getInitialURL`; `.well-known` + landing "instale o app" (`GET /convite/:token`, [server/invite-landing.ts](../../../server/invite-landing.ts)) em [server/_core/index.ts](../../../server/_core/index.ts); deep-link em [app.config.ts](../../../app.config.ts).

---

## 1. Motivação

Nem sempre o idoso consegue gerar e ditar um código. Em muitas famílias o filho (cuidador) é quem configura tudo. Para esses casos, o cuidador inicia o vínculo: gera um link, manda pelo WhatsApp, e o idoso só precisa **abrir e confirmar**. Inverte a direção do convite implementado hoje.

## 2. Direção e consentimento

No fluxo atual (código), **o código é o consentimento**: o monitorado age primeiro. No fluxo por link é o **cuidador** que age primeiro, então o monitorado **precisa confirmar** — abrir o link sozinho não basta como base legal sólida (LGPD, dado de saúde de idoso).

- **Recomendação:** ao abrir o link, mostrar uma tela "**Fulano quer acompanhar sua saúde**" com **um toque "Aceitar"** (e "Recusar"). É leve para o idoso e registra consentimento explícito do titular.
- O pedido do usuário foi "vínculo automático ao abrir". O design mantém **um toque** como meio-termo seguro. → **questão a validar antes de implementar.**

## 3. Fluxo

```
CUIDADOR                          SERVIDOR                         MONITORADO
────────                          ────────                         ──────────
"Convidar por link"               link_invites                     abre o link (WhatsApp)
 link.createShareInvite ────────► createdByRole='caregiver'   ◄──── app abre app/convite/[token]
 recebe URL + token               code = token opaco longo          tela "Fulano quer te acompanhar"
 Share API / wa.me                expiresAt (ex.: 24h)              toque "Aceitar"
                                                                    link.acceptInvite(token)
                                  caregiver_links(active) ◄──────── cria vínculo (method='invite_link')
```

## 4. Backend (reuso de schema — sem migração nova)

A tabela `link_invites` já tem `createdByRole` (`'monitored' | 'caregiver'`). O fluxo por link usa `createdByRole='caregiver'`:

- **`link.createShareInvite`** (cuidador): gera um **token opaco longo** (≥ 22 chars base64url via `node:crypto`, não o código de 6 chars legível) com TTL maior (ex.: 24h), `createdByRole='caregiver'`. Retorna `{ token, url }`. Rate-limit por openId. Se o cuidador já tem vínculo ativo com outra pessoa → `CONFLICT` (mesma regra "um por vez").
- **`link.acceptInvite`** (monitorado): input `{ token }`. Valida (existe, não expirado, não consumido, `createdByRole==='caregiver'`, `createdByOpenId !== ctx.user`). Consome atomicamente (`consumeInviteByCode`, já existe) e cria o vínculo via `upsertActiveLink({ caregiverOpenId: invite.createdByOpenId, monitoredOpenId: ctx.user.openId, method: 'invite_link', ... })`. Retorna `{ caregiverName }` para a tela de confirmação.
- `getMyLink` / `getMyCaregivers` / `revokeLink` / `getMonitored*` continuam idênticos — o vínculo resultante é igual ao do fluxo por código.

Reuso: `generateInviteCode` (precisa de variante "token longo"; manter o de 6 chars para o fluxo código), `consumeInviteByCode`, `isInviteExpired`, `upsertActiveLink`. O helper de token longo entra em `server/links-code.ts`.

## 5. Cliente

- **Cuidador:** botão "Convidar por link" (em `link.tsx` ou em Config) → `createShareInvite` → `Share.share({ message: 'Quero acompanhar sua saúde no Vigora: <url>' })`. Atalho WhatsApp: `https://wa.me/?text=<encoded>`.
- **Monitorado:** nova rota `app/convite/[token].tsx` (Expo Router resolve o path do deep link). Tela mostra "Fulano quer te acompanhar" → "Aceitar" chama `acceptInvite(token)` → sucesso → toast + volta para `/(tabs)`. "Recusar" → descarta.
- Estados: token inválido/expirado/já usado → mensagem clara ("Convite expirado, peça um novo"). Se o monitorado não estiver logado ao abrir, rotear para login e retomar o token depois (guardar em memória/param).

## 6. Deep linking — pré-requisito de configuração

Para o link abrir o app instalado de forma confiável:

- **Universal Links (iOS)** + **App Links (Android)**: associar um domínio (ex.: `https://app.vigorasaude.com/convite/<token>`) via `apple-app-site-association` e `assetlinks.json`, e declarar em `app.config.ts` (`associatedDomains` / `intentFilters`).
- Fallback `vigora://convite/<token>` (scheme já configurado) funciona só com o app instalado; sem app, o link `https` deve cair numa landing que instrui a instalar.
- Hoje o `expo-web-browser` intercepta `vigora://oauth/callback` (ver CLAUDE.md §9) — o path `/convite/[token]` é diferente e deve chegar ao Expo Router normalmente, mas validar que não há conflito de interceptação.

## 7. Segurança

- Token: ≥ 128 bits de entropia, base64url, **não** legível/ditável (diferente do código de 6 chars).
- TTL curto-médio (ex.: 24h), **single-use** (mesmo claim atômico do fluxo código → sem TOCTOU).
- Rate-limit em `createShareInvite` e `acceptInvite`.
- Continua valendo: monitorado vê e revoga quem o acompanha (`getMyCaregivers` + `revokeLink`).

## 8. Fora de escopo / futuro

- Implementação de fato (este doc é só o design).
- Configuração de domínio/Universal Links (tarefa de infra própria).
- Múltiplos monitorados por cuidador.
- Pré-preenchimento de telefone do monitorado para mandar o WhatsApp direto ao número certo.

## 9. Questões em aberto

1. Vínculo ao abrir o link: automático vs. um toque "Aceitar"? (recomendação: um toque, por LGPD).
2. Domínio para Universal Links/App Links (precisa de um host servindo os arquivos de associação).
3. Comportamento quando o monitorado abre o link sem ter conta ainda (instalar → cadastrar → retomar token).
