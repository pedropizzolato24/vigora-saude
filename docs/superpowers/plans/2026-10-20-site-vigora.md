# Site do Vigora — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar `vigorasaude.com` — página inicial que leva à lista de espera, lista gravada no MySQL com e-mail de confirmação via Resend, e as páginas `/privacidade` e `/termos` em rascunho.

**Architecture:** O site é HTML + CSS sem framework, servido pelo mesmo Express do Railway que roda a API. As páginas são fragmentos em `site/*.html` embrulhados por um layout comum (`site/_layout.html`) num módulo `server/site.ts`, lidos uma vez no boot. A lista de espera é um módulo de rotas (`server/waitlist.ts`) sobre um módulo de banco (`server/db-waitlist.ts`). Formulário funciona sem JavaScript (POST + redirecionamento 303).

**Tech Stack:** Node 22 + Express · Drizzle ORM (MySQL) · Zod · Vitest 2 · Resend (HTTP puro, já em `server/email-auth.ts`).

**Spec:** `docs/superpowers/specs/2026-10-20-site-vigora-design.md` — leia antes de cada tarefa; o plano argumenta a partir dele.

## Global Constraints

- Texto em PT-BR; voz calma e precisa (`docs/PRODUCT.md`). Nenhum termo proibido de `.claude/CLAUDE.md` › Marketing ("previne", "garante segurança", "controla a pressão", "trata", "diagnostica" afirmativo, "substitui consulta").
- Nada de preço (`R$`), nada da palavra "Pro", nada sobre beta.
- Sem recurso de terceiros no navegador: sem Google Fonts, sem CDN, sem analytics, sem cookies, sem JavaScript.
- Fontes servidas de `assets/fonts/` (`PlusJakartaSans-Variable.ttf`, `SpaceMono-Regular.ttf`). Fraunces não é usada.
- Cores = tokens de `docs/DESIGN.md`; abertura em `#1E4D8C` com texto `#F4EFE5`; dark mode via `prefers-color-scheme` com os tokens dark do mesmo doc.
- Corpo ≥ 18px, alvos de toque ≥ 44px, contraste AA, foco visível, `prefers-reduced-motion` respeitado, nada quebra a 360px.
- Segurança: não remover `securityHeadersMiddleware` nem o CORS; o CSP só é relaxado nas rotas do site. Nunca logar o e-mail de quem se cadastra (logar só o motivo do erro).
- Paths de runtime relativos ao cwd (raiz do repo), como `runPendingMigrations` já faz com `./drizzle`.
- Disclaimer obrigatório, texto exato: "Vigora é um aplicativo informativo para monitoramento de saúde e não substitui o diagnóstico, tratamento ou acompanhamento profissional médico. Em caso de emergência médica, ligue 192 (SAMU) ou 193 (Bombeiros). Alertas automáticos podem falhar; não confie exclusivamente neste aplicativo em situações de risco."
- Mensagem da tela após o cadastro, texto exato e sempre igual: "Pronto! Se este e-mail ainda não estava na lista, você vai receber a confirmação em instantes."
- Contatos: rodapé `suporte@vigorasaude.com`; DPO `privacidade@vigorasaude.com`; controlador `vigora@vigorasaude.com`.

## Review Focus

1. **Leitor de link do provedor de e-mail** (Outlook/Gmail abrem links para checar segurança): um GET em `/lista/sair?t=…` NÃO pode apagar nada — só mostra a confirmação; apagar exige POST. Teste na Tarefa 3.
2. **Mesmo e-mail com maiúsculas/espaços** (`" Ana@Exemplo.com "`): é o mesmo cadastro; não cria linha nem manda segundo e-mail. Teste na Tarefa 3.
3. **Resend fora do ar ou sem configuração**: o cadastro é gravado, a pessoa vê `/obrigado`, o erro é logado com o motivo e sem o e-mail. Teste na Tarefa 3.
4. **Formulário adulterado** (motivo desconhecido, `<script>`, motivo repetido, aceite ausente, e-mail de 400 caracteres): motivos desconhecidos são descartados, aceite ausente/e-mail inválido voltam para `/?erro=1#lista`, nunca 500. Teste na Tarefa 3.
5. **CSP bloqueando o próprio site** (página sem estilo porque `style-src`/`font-src` não liberam `'self'`): o header das rotas do site libera exatamente o necessário. Teste na Tarefa 2; checagem visual a 360px na Tarefa 6.

---

### Task 1: Tabela e módulo de banco da lista de espera

**Files:**
- Modify: `drizzle/schema.ts` (nova tabela no fim)
- Create: `drizzle/0018_*.sql` + `drizzle/meta/0018_snapshot.json` + entrada em `drizzle/meta/_journal.json` (gerados)
- Create: `server/db-waitlist.ts`
- Test: `tests/db-waitlist.test.ts`

**Interfaces:**
- Produces:
  - `waitlist` (tabela `waitlist`): `id` int autoincrement PK · `email` varchar(320) notNull unique · `reasons` json `string[]` notNull · `policyVersion` varchar(20) notNull · `consentAt` timestamp notNull · `unsubscribeToken` varchar(64) notNull unique · `createdAt` timestamp defaultNow notNull.
  - `WAITLIST_REASONS = ["queda", "sem-noticia", "remedio", "internacao", "outro"] as const` e `type WaitlistReason`.
  - `addToWaitlist(input: { email: string; reasons: WaitlistReason[]; policyVersion: string }): Promise<{ created: true; unsubscribeToken: string } | { created: false }>` — `email` já normalizado pelo chamador; `created:false` quando o e-mail já existe; lança se não há banco.
  - `removeFromWaitlist(token: string): Promise<boolean>` — apaga a linha; `true` se apagou.

- [ ] **Step 1: Adicionar a tabela `waitlist` em `drizzle/schema.ts`** com as colunas acima, comentário de uma linha explicando a finalidade (lista de espera do site, LGPD: só e-mail + motivos de múltipla escolha), e os tipos `Waitlist`/`InsertWaitlist` no padrão das outras tabelas.

- [ ] **Step 2: Gerar a migração**

Run: `DATABASE_URL=mysql://u:p@localhost:3306/x npx drizzle-kit generate --name site_waitlist` (o generate não conecta; o `drizzle.config.ts` só exige a variável).
Expected: cria `drizzle/0018_site_waitlist.sql` contendo `CREATE TABLE \`waitlist\`` com os dois UNIQUE, e só isso (nenhum ALTER em outra tabela).

- [ ] **Step 3: Escrever o teste que falha** em `tests/db-waitlist.test.ts`, mockando `../server/db` com um `getDb` que devolve um dublê mínimo do builder do Drizzle (padrão de `tests/auth-providers.test.ts`):

```ts
it("gera token novo e devolve created:true quando insere", async () => {
  // dublê: insert(...).values(v).ignore() resolve [{ affectedRows: 1 }]
  const r = await addToWaitlist({ email: "ana@exemplo.com", reasons: ["queda"], policyVersion: "2026-10-20" });
  expect(r).toEqual({ created: true, unsubscribeToken: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) });
});
it("devolve created:false quando o e-mail já existe (affectedRows 0)", ...)
it("removeFromWaitlist devolve false para token inexistente e true quando apaga", ...)
it("lança quando não há banco", async () => { /* getDb → null */ await expect(addToWaitlist(...)).rejects.toThrow(); });
```

- [ ] **Step 4: Rodar e ver falhar** — Run: `npx vitest run tests/db-waitlist.test.ts` · Expected: FAIL (módulo não existe).

- [ ] **Step 5: Implementar `server/db-waitlist.ts`.** Insert com `.ignore()` (sem consulta prévia; o UNIQUE decide) e `affectedRows` lido como em `server/db-alarm-management.ts:30`. Token: `randomBytes(24).toString("base64url")` (32 caracteres). `consentAt: new Date()`.

- [ ] **Step 6: Rodar e ver passar** — Run: `npx vitest run tests/db-waitlist.test.ts` · Expected: PASS.

- [ ] **Step 7: Commit** — `feat(site): tabela waitlist + módulo de banco (migração 0018)`

---

### Task 2: Casca do site — layout, rotas estáticas, CSP, www, depoimentos

**Files:**
- Create: `server/site.ts`
- Create: `site/_layout.html`, `site/assets/site.css`, `site/assets/favicon.png`, `site/depoimentos.ts`
- Create: `site/index.html`, `site/privacidade.html`, `site/termos.html`, `site/obrigado.html` (nesta tarefa, conteúdo provisório de uma linha; o conteúdo real vem nas Tarefas 4 e 5)
- Modify: `server/_core/index.ts` (registrar as rotas do site **antes** do tRPC e depois de `express.urlencoded`)
- Modify: `.env.example`, `README.md` e `docs/ARCHITECTURE.md` (tabela de env): `SITE_URL`
- Test: `tests/site.test.ts`

**Interfaces:**
- Produces (em `server/site.ts`):
  - `SITE_CSP = "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"`
  - `siteUrl(): string` — `process.env.SITE_URL` sem barra final, padrão `"https://vigorasaude.com"`.
  - `renderPage(opts: { title: string; content: string }): string` — embrulha `content` no `_layout.html` (troca `{{title}}` e `{{content}}`).
  - `renderTestimonials(list: Depoimento[]): string` — `""` se a lista for vazia; senão uma `<section id="depoimentos">` com cada item escapado.
  - `escapeHtml(s: string): string`
  - `registerSiteRoutes(app: Express): void` — middleware de `www.` → 301 para `siteUrl() + req.originalUrl`; GET `/`, `/privacidade`, `/termos`, `/obrigado`; `express.static("site/assets")` em `/assets` e `assets/fonts` em `/fonts`; todas essas respostas com `Content-Security-Policy: SITE_CSP` (sobrescreve o da API só nelas).
  - `/` renderiza `site/index.html` trocando `<!--depoimentos-->` por `renderTestimonials(DEPOIMENTOS)` e `<!--erro-lista-->` por um aviso de erro quando `req.query.erro === "1"` (texto: "Confira o e-mail e marque a caixa de aceite para entrar na lista.").
- Produces (em `site/depoimentos.ts`): `interface Depoimento { texto: string; nome: string; detalhe?: string }` e `export const DEPOIMENTOS: Depoimento[] = []` com comentário dizendo como adicionar e que a seção aparece sozinha.
- `site/_layout.html`: documento completo (`lang="pt-BR"`, viewport, `<link rel="stylesheet" href="/assets/site.css">`, favicon em `/assets/favicon.png` — cópia de `assets/images/favicon.png` em `site/assets/`), cabeçalho com o logo SVG de `server/invite-landing.ts` (`LOGO_SVG`) + "Como funciona" (`/#como-funciona`), "Perguntas" (`/#perguntas`), botão "Entrar na lista" (`/#lista`); rodapé com Termos de Uso, Política de Privacidade, `suporte@vigorasaude.com`, o disclaimer e "© Vigora".

- [ ] **Step 1: Escrever os testes que falham** em `tests/site.test.ts` (padrão de res falso de `tests/security-headers.test.ts`):

```ts
it("renderTestimonials vazio não renderiza nada", () => expect(renderTestimonials([])).toBe(""));
it("renderTestimonials escapa o texto", () => {
  const html = renderTestimonials([{ texto: "<b>oi</b>", nome: "Ana" }]);
  expect(html).toContain("&lt;b&gt;oi&lt;/b&gt;"); expect(html).toContain('id="depoimentos"');
});
it("SITE_CSP libera só o próprio domínio para estilo, fonte e formulário", () => {
  for (const d of ["style-src 'self'", "font-src 'self'", "form-action 'self'", "frame-ancestors 'none'"]) expect(SITE_CSP).toContain(d);
  expect(SITE_CSP).not.toMatch(/unsafe|https?:/);
});
it("renderPage põe título e conteúdo no layout", () => {
  const html = renderPage({ title: "Termos de Uso", content: "<p>x</p>" });
  expect(html).toContain("<title>Termos de Uso"); expect(html).toContain("<p>x</p>"); expect(html).toContain("suporte@vigorasaude.com");
});
it("siteUrl usa SITE_URL sem barra final e tem padrão", ...)
it("www redireciona 301 para a raiz preservando o caminho", ...) // chama o middleware com req { hostname: "www.vigorasaude.com", originalUrl: "/termos" }
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run tests/site.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar `server/site.ts`, `site/_layout.html`, `site/depoimentos.ts`, `site/assets/site.css` (só tokens, fontes `@font-face` de `/fonts/…`, reset, layout e rodapé), as páginas provisórias, e registrar em `server/_core/index.ts`.** Ler os arquivos uma vez no boot (cache em módulo).
- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run tests/site.test.ts` · Expected: PASS.
- [ ] **Step 5: Smoke local** — Run: `pnpm dev:server` e `curl -sI http://localhost:3000/` (porta do `.env`) · Expected: `200`, `Content-Type: text/html`, `Content-Security-Policy` igual a `SITE_CSP`; `curl -s http://localhost:3000/api/health` continua com o CSP antigo (`default-src 'none'; frame-ancestors 'none'`).
- [ ] **Step 6: Commit** — `feat(site): layout, rotas do site, CSP próprio e redirecionamento www`

---

### Task 3: Rotas da lista de espera + e-mail de confirmação + saída

**Files:**
- Create: `server/waitlist.ts`
- Modify: `server/email-auth.ts` (exportar `sendEmail`; nenhuma outra mudança)
- Modify: `server/_core/index.ts` (registrar `registerWaitlistRoutes`)
- Create: `site/sair.html` (fragmento com `{{token}}`), conteúdo final de `site/obrigado.html`
- Test: `tests/waitlist.test.ts`

**Interfaces:**
- Consumes: `addToWaitlist`, `removeFromWaitlist`, `WAITLIST_REASONS` (Task 1); `renderPage`, `siteUrl`, `SITE_CSP`, `escapeHtml` (Task 2); `normalizeEmail` de `server/db-auth.ts`; `sendEmail(to, subject, bodyHtml): Promise<boolean>` e `isEmailServiceConfigured()` de `server/email-auth.ts`.
- Produces (em `server/waitlist.ts`):
  - `POLICY_VERSION = "2026-10-20"`
  - `parseWaitlistForm(body: unknown): { email: string; reasons: WaitlistReason[] } | null` — Zod: `email` string trim, `.email()`, máx. 320; `motivo` string ou array de strings (opcional) → filtra para `WAITLIST_REASONS`, sem repetição; `aceite === "sim"` obrigatório. Devolve e-mail já normalizado.
  - `confirmationEmailHtml(unsubscribeUrl: string): string`
  - `registerWaitlistRoutes(app: Express): void`:
    - `POST /lista` (rate limit `createRateLimit({ max: 5, windowMs: 60_000, name: "waitlist" })`): inválido → `303 /?erro=1#lista`; válido → responde **antes** `303 /obrigado` e depois, em background, `addToWaitlist` e, só se `created`, `sendEmail` (se configurado). Erros do background: `console.error("[Waitlist] …", motivo)` sem o e-mail.
    - `GET /lista/sair?t=` → página de confirmação com formulário `POST /lista/sair` (campo oculto `t`) e botão "Sair da lista". **Não apaga.** Token fora de `^[A-Za-z0-9_-]{32}$` → mesma página sem o formulário, com "Link inválido".
    - `POST /lista/sair` → `removeFromWaitlist(t)` → página "Pronto, seu e-mail saiu da lista do Vigora." (mesma resposta se o token não existir).
    - Todas com `Content-Security-Policy: SITE_CSP`.
- Copy do e-mail (assunto e corpo exatos):
  - Assunto: `Você está na lista de espera do Vigora`
  - Corpo: `<p>Obrigado pelo interesse no Vigora. Vamos te avisar por e-mail quando o app for lançado.</p><p>Não foi você que se cadastrou? <a href="{unsubscribeUrl}">Tire este e-mail da lista</a>.</p>` com `unsubscribeUrl = siteUrl() + "/lista/sair?t=" + token`.
- `site/obrigado.html`: a mensagem exata da tela (Global Constraints) + link de volta para o início.

- [ ] **Step 1: Escrever os testes que falham** em `tests/waitlist.test.ts`, com `vi.mock("../server/db-waitlist")` e `vi.mock` parcial de `../server/email-auth` (`sendEmail`, `isEmailServiceConfigured`); handlers chamados com req/res falsos:

```ts
it("normaliza o e-mail", () => expect(parseWaitlistForm({ email: " Ana@Exemplo.com ", aceite: "sim" })?.email).toBe("ana@exemplo.com"));
it("descarta motivos desconhecidos e repetidos", () =>
  expect(parseWaitlistForm({ email: "a@b.co", aceite: "sim", motivo: ["queda", "<script>", "queda", "remedio"] })?.reasons).toEqual(["queda", "remedio"]));
it("aceita motivo único como string e motivo ausente", ...)
it("recusa sem aceite, e-mail inválido e e-mail > 320", () => { /* cada um → null */ });
it("POST /lista válido redireciona 303 para /obrigado e envia e-mail só quando created", async () => { /* add → created:true → sendEmail 1x com link contendo /lista/sair?t= */ });
it("POST /lista com e-mail já cadastrado responde igual e não envia e-mail", async () => { /* add → created:false → sendEmail 0x, mesmo 303 /obrigado */ });
it("POST /lista inválido redireciona 303 para /?erro=1#lista", ...)
it("falha do Resend não muda a resposta e loga sem o e-mail", async () => { /* sendEmail → false; console.error chamado; nenhum argumento contém "a@b.co" */ });
it("GET /lista/sair não apaga nada", async () => { /* removeFromWaitlist não chamado; html contém action="/lista/sair" */ });
it("POST /lista/sair apaga pelo token", ...)
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run tests/waitlist.test.ts` · Expected: FAIL.
- [ ] **Step 3: Exportar `sendEmail` em `server/email-auth.ts`.**
- [ ] **Step 4: Implementar `server/waitlist.ts`, `site/sair.html`, `site/obrigado.html` e registrar no `index.ts`** (handlers exportados para os testes, ou testados via `registerWaitlistRoutes` com um app falso que captura os handlers — escolha do implementador).
- [ ] **Step 5: Rodar e ver passar** — Run: `npx vitest run tests/waitlist.test.ts tests/auth-providers.test.ts` · Expected: PASS.
- [ ] **Step 6: Commit** — `feat(site): lista de espera com confirmação por e-mail e saída em dois passos`

---

### Task 4: Página inicial — conteúdo e visual

> Use a skill `frontend-design` nesta tarefa. A direção visual está decidida no spec (seção "Visual"); os mockups aprovados estão em `.superpowers/brainstorm/1099-1792510573/content/visual-direcao-v2.html` (opção 2) e `estrutura.html`.

**Files:**
- Modify: `site/index.html`, `site/assets/site.css`
- Test: `tests/site-content.test.ts`

**Interfaces:**
- Consumes: marcadores `<!--depoimentos-->` e `<!--erro-lista-->` (Task 2); formulário posta em `POST /lista` com campos `email`, `motivo` (checkbox, valores de `WAITLIST_REASONS`), `aceite=sim` (Task 3).

Seções, nesta ordem, com os ids: abertura · `#o-que-deu-errado` · `#como-funciona` (lista ordenada `<ol>` de 3 passos) · `#o-que-mais` (lista, não cards) · `#do-lado-dele` · `#o-que-nao-faz` (com o disclaimer exato) · `<!--depoimentos-->` · `#lista` (formulário completo + "No lançamento, você terá 14 dias para testar com tudo liberado.") · `#perguntas` (`<details>` nativo; perguntas mínimas do spec).

Abertura, copy exata: balão "A Lúcia não respondeu ao alarme das 8h00." com `08:07` em Space Mono; título `<h1>` "Uma mensagem, na hora em que ela importa."; subtítulo "Quando o alarme toca e ninguém responde, o Vigora avisa vocês pelo WhatsApp, por SMS e no app."; campo de e-mail + "Entrar na lista de espera" (este formulário curto também posta em `/lista` e leva `aceite` como checkbox visível com link para `/privacidade`). Rótulos dos motivos: os cinco textos do spec. Rótulo do aceite: "Li a Política de Privacidade e quero ser avisado por e-mail do lançamento do Vigora."

Movimento: no máximo o balão entrando uma vez; nada com `prefers-reduced-motion: reduce`.

- [ ] **Step 1: Escrever os testes de conteúdo que falham** em `tests/site-content.test.ts`, lendo `site/*.html` do disco:

```ts
it("tem o disclaimer exato", () => expect(index).toContain(DISCLAIMER));
it("tem o título aprovado", () => expect(index).toContain("Uma mensagem, na hora em que ela importa."));
it("nenhuma página tem preço, 'Pro' ou termo proibido", () => {
  for (const html of allPages) {
    expect(html).not.toMatch(/R\$|\bPro\b|previne|prevenir|garante|controla a press|substitui consulta/i);
    for (const m of html.matchAll(/diagnostic/gi)) expect(html.slice(Math.max(0, m.index! - 40), m.index)).toMatch(/não|nem/i);
  }
});
it("o formulário posta em /lista com os cinco motivos e o aceite obrigatório", () => {
  for (const r of WAITLIST_REASONS) expect(index).toContain(`value="${r}"`);
  expect(index).toMatch(/name="aceite"[^>]*required/);
});
it("tem os dois marcadores do servidor", ...)
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run tests/site-content.test.ts` · Expected: FAIL.
- [ ] **Step 3: Escrever `site/index.html` e completar `site/assets/site.css`.**
- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run tests/site-content.test.ts` · Expected: PASS.
- [ ] **Step 5: Revisão visual** — com `pnpm dev:server`, abrir `/` a 360px, 768px e 1280px, em claro e escuro, com zoom de texto 200%. Expected: nada corta ou sobrepõe; foco visível ao navegar por Tab; formulário envia sem JavaScript e cai em `/obrigado`; `/?erro=1#lista` mostra o aviso. Despachar o agente `Accessibility Auditor` sobre `site/` e corrigir o que ele apontar como bloqueante.
- [ ] **Step 6: Commit** — `feat(site): página inicial`

---

### Task 5: Textos legais (rascunho para revisão jurídica)

**Files:**
- Modify: `site/privacidade.html`, `site/termos.html`
- Modify: `tests/site-content.test.ts`

Conteúdo: exatamente as seções listadas no spec, "Textos legais". A Política parte do resumo em `app/(tabs)/settings.tsx` (~L1459) e cobre app **e** lista de espera. Cada página abre com um aviso visível "Rascunho — em revisão jurídica. Não publicar antes da revisão." e termina com "Versão 2026-10-20" (`POLICY_VERSION`). Na Política, junto do controlador, um aviso visível: "TROCAR pela razão social e CNPJ quando o MEI for aberto (roadmap, item 6)." Pendências para o revisor (prazo de backup, região do servidor) aparecem marcadas como "[A CONFIRMAR]".

- [ ] **Step 1: Escrever os testes que falham** (acrescentar a `tests/site-content.test.ts`):

```ts
it("Política identifica controlador, DPO, Resend e a lista de espera", () => {
  for (const s of ["Pedro Frey Pizzolato", "Novo Hamburgo", "vigora@vigorasaude.com", "privacidade@vigorasaude.com", "Resend", "lista de espera", "TROCAR pela razão social", "Versão 2026-10-20"]) expect(privacidade).toContain(s);
});
it("Termos têm foro, teste de 14 dias, disclaimer e suporte", () => {
  for (const s of ["Novo Hamburgo", "14 dias", DISCLAIMER, "suporte@vigorasaude.com"]) expect(termos).toContain(s);
});
it("as duas páginas abrem com o aviso de rascunho", ...)
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run tests/site-content.test.ts` · Expected: FAIL nos novos.
- [ ] **Step 3: Escrever os dois textos.**
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS (inclusive o teste de termos proibidos da Task 4, que agora varre as páginas legais).
- [ ] **Step 5: Commit** — `docs(site): rascunho da Política de Privacidade e dos Termos de Uso`

---

### Task 6: Verificação final e documentação

**Files:**
- Modify: `docs/claude/roadmap.md` (item 9: site criado, copy auditada por teste; pendências: DNS de `vigorasaude.com` e `www` no Railway, `SITE_URL` no Railway, revisão jurídica, caixas de e-mail)
- Modify: `docs/ARCHITECTURE.md` (uma linha: o Express também serve o site e a lista de espera)

- [ ] **Step 1: Suite completa** — Run: `npx vitest run` · Expected: tudo PASS.
- [ ] **Step 2: Tipos** — Run: `npx tsc --noEmit` · Expected: só o erro pré-existente de `lib/storageProxy.ts`.
- [ ] **Step 3: Build do servidor** — Run: `pnpm build` · Expected: sem erro (os HTML não entram no bundle; são lidos do disco em runtime a partir da raiz do repo).
- [ ] **Step 4: Smoke ponta a ponta local** com banco de dev: cadastrar um e-mail pelo formulário, conferir a linha em `waitlist`, cadastrar de novo (sem segundo e-mail), abrir o link de saída (GET não apaga), confirmar (POST apaga).
- [ ] **Step 5: Atualizar os docs acima e rodar `graphify update .`.**
- [ ] **Step 6: Commit** — `docs(site): roadmap e arquitetura`
