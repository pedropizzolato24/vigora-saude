# Site do Vigora (vigorasaude.com) — design

Data: 2026-10-20 · Status: aguardando aprovação

## Intenção

O app ainda não foi lançado e `vigorasaude.com` hoje só responde a API. O site tem três
funções:

1. **Convencer o comprador** (o filho adulto, 35–55, ou alguém próximo de uma pessoa com
   doença crônica) de que o susto que ele já viveu foi sério e que o Vigora existe para que,
   da próxima vez, ele fique sabendo.
2. **Captar uma lista de espera** — a única ação da página. Não existe beta aberta: um app
   cuja razão de existir é avisar quando algo dá errado não pode falhar em público antes do
   lançamento.
3. **Publicar a parte legal** (Política de Privacidade e Termos de Uso) num link público.
   As lojas exigem a URL da política; hoje o app só tem resumos em diálogo
   (`app/(tabs)/settings.tsx` ~L1450–1460), e o login/paywall já dizem "você concorda com os
   Termos de Uso e Política de Privacidade" sem que eles existam por inteiro.

### O leitor

Já passou por um evento estressante: queda descoberta horas depois, ligação sem resposta,
remédio esquecido, internação. Chega com essa lembrança. A página reconhece que foi sério,
sem dramatizar nem culpar, e mostra que o problema foi **ninguém ficar sabendo a tempo** —
que é exatamente o que o Vigora resolve.

A visão do idoso aparece de forma sutil (dignidade, independência, "é só um alarme com um
botão grande"), mas o texto é escrito para o filho.

## Metas, não-metas, anti-metas

**Metas**
- Uma página inicial que leve o leitor do susto à lista de espera, num único fio de raciocínio.
- Lista de espera gravada no servidor próprio (Railway/MySQL), com e-mail de confirmação.
- `/privacidade` e `/termos` completos, em rascunho para revisão jurídica (o pai do Pedro,
  advogado, revisa antes do lançamento).
- Rápido em aparelho de entrada (Samsung série A, Motorola G) e legível para 60+.

**Não-metas (fora por enquanto)**
- Preços. Só se menciona o teste de 14 dias; os valores (hoje R$ 19,90/mês, R$ 199,90/ano,
  R$ 299,90 vitalício) não são finais e ficam para a loja.
- Envio do e-mail de lançamento para a lista (fica para perto do lançamento, quando se
  souber o tamanho da lista).
- Blog, "quem somos", login, página de preços, depoimentos (ver abaixo), analytics.
- Qualquer menção à beta fechada.

**Anti-metas (falharia mesmo funcionando)**
- Prometer o que o app não cumpre. Proibido: "previne", "garante segurança", "controla a
  pressão", "diagnostica", "substitui consulta". Ver a lista completa em `CLAUDE.md`
  (Marketing). O app não impede o evento; ele encurta o tempo até a família saber.
- Tom agressivo ou que explore o medo. O Pedro rejeitou a versão "Esta é a mensagem que
  faltou naquele dia" por ser emocional demais.
- Usar a palavra "Pro" ou falar em "plano pago" — o app é pago, não tem plano grátis.
- Coletar dado de saúde de terceiro (por isso a pergunta "o que aconteceu" é de múltipla
  escolha, sem texto livre).
- Mandar dado do visitante a terceiros sem necessidade (sem Google Fonts, sem pixels).

## Conteúdo da página inicial

Ordem aprovada pelo Pedro (mockup `estrutura.html`):

1. **Abertura.** Fundo azul `#1E4D8C`, texto creme `#F4EFE5`. Imagem principal: um balão de
   mensagem (fundo creme, texto escuro, horário em Space Mono) com
   *"A Lúcia não respondeu ao alarme das 8h00."* e `08:07`. Título (Plus Jakarta Sans 800,
   sem serifa): **"Uma mensagem, na hora em que ela importa."** Subtítulo: "Quando o alarme
   toca e ninguém responde, o Vigora avisa vocês pelo WhatsApp, por SMS e no app." Campo de
   e-mail + botão "Entrar na lista de espera" já aqui.
2. **O que deu errado naquele dia.** Curto, sem drama: o problema não foi só o que
   aconteceu, foi o tempo até alguém saber.
3. **Como funciona** — sequência real, numerada: ① o alarme toca no celular dele → ② ele não
   responde → ③ a família recebe aviso no WhatsApp, por SMS e no app do cuidador. Latência
   real: o aviso chega 5–10 min após o horário (`docs/claude/alarmes.md`, "Latência"). Não
   prometer "na hora" nem "imediato".
4. **O que mais o app faz** — lista enxuta, não grade de cards: lembretes de remédio,
   verificação diária "tudo bem?", botão de SOS, registro de pressão/glicemia/frequência,
   histórico em PDF para levar ao médico, cuidador vinculado que acompanha e pode gerenciar
   os alarmes (com aceite do idoso).
5. **Do lado dele** — a visão do idoso: sem câmera, sem tratar como paciente, um alarme com
   um botão grande.
6. **O que o Vigora não faz** — seção própria de honestidade: não chama SAMU/Bombeiros (só
   contatos que o usuário escolheu), não diagnostica, depende de bateria e internet. Inclui o
   disclaimer obrigatório completo (texto em `CLAUDE.md`, "Disclaimer obrigatório"). Fato
   útil: se o celular estiver desligado/sem sinal, a família recebe um aviso diferente
   ("não foi entregue — celular pode estar desligado"), não um falso "não respondeu".
7. **(Depoimentos)** — ver abaixo; hoje não aparece.
8. **Lista de espera** — "No lançamento, você terá 14 dias para testar com tudo liberado."
   Formulário completo (ver "Lista de espera").
9. **Perguntas frequentes** — no mínimo: E se o celular estiver sem bateria? · O Vigora
   chama o SAMU? · E se meu pai/minha mãe não quiser usar? · Onde ficam os dados? · Quanto
   vai custar? (resposta: 14 dias de teste; depois assinatura mensal ou anual, valores
   anunciados no lançamento).

**Rodapé:** links para Termos de Uso e Política de Privacidade, `suporte@vigorasaude.com`,
o disclaimer curto, © Vigora.

**Navegação do topo:** logo + "Como funciona" + "Perguntas" + botão "Entrar na lista".

### Depoimentos

Sem depoimentos por enquanto — nenhum pode ser inventado. A seção é alimentada por uma
lista no código (nome, idade/cidade opcionais, texto). Lista vazia ⇒ a seção não é
renderizada. Ordem na página: entre a seção 6 e a lista de espera.

### Voz e texto

"Você" direto, frases curtas, sem jargão, PT-BR. Calmo, preciso, humano
(`docs/PRODUCT.md`). Nomes de exemplo (Lúcia) são fictícios e não devem ser apresentados
como caso real. Todo texto final passa pela lista de termos proibidos antes de publicar
(roadmap item 9 exige auditar também o site).

## Visual

Escolhido pelo Pedro: **cores da direção B + tipografia e mensagem da direção C**
(mockups `visual-direcao.html` e `visual-direcao-v2.html` em `.superpowers/brainstorm/`).

- Paleta = tokens do app (`docs/DESIGN.md`): `primary #1E4D8C` (azul profundo, carrega a
  abertura e seções-chave), `background #F4EFE5` (creme), `foreground #0E1417`,
  `muted #5B636A`, `border #D8D1C2`, `accent #C96442` (terracota, uso raro),
  `warning #F0C24A`. Respeitar `prefers-color-scheme: dark` com os tokens dark do mesmo doc.
- Tipografia: **Plus Jakarta Sans** para títulos (800) e corpo; **Space Mono** só para
  horários. Fraunces itálico **não** é usado nos títulos (o Pedro preferiu a versão sem
  serifa). As fontes são servidas pelo próprio servidor a partir de `assets/fonts/`
  (`PlusJakartaSans-Variable.ttf`, `SpaceMono-Regular.ttf`) — nada de Google Fonts.
- Logo: a marca "lua crescente" em SVG inline (`server/invite-landing.ts`, `LOGO_SVG`).
- Acessibilidade 60+: corpo ≥ 18px no site, alvos de toque ≥ 44px, contraste AA, foco de
  teclado visível, `prefers-reduced-motion` respeitado, funciona a ~360px de largura.
- Movimento: no máximo um momento (ex.: o balão de mensagem aparecendo). Nada de animação
  de entrada em cada seção.

## Lista de espera

**Campos**
- E-mail (obrigatório, validado).
- "O que aconteceu com vocês?" — múltipla escolha, **opcional**, várias marcáveis:
  "Uma queda que só descobrimos depois" · "Não atendeu o telefone e ficamos sem notícia" ·
  "Esqueceu ou trocou um remédio" · "Uma internação" · "Outro motivo". **Sem texto livre**
  (evita dado de saúde de terceiro — LGPD).
- Aceite obrigatório: "Li a Política de Privacidade e quero ser avisado por e-mail do
  lançamento do Vigora."

**Gravação** — tabela nova no MySQL (migração Drizzle `0018_…`): e-mail (único,
normalizado em minúsculas), motivos (lista de códigos fixos), data/hora do aceite, versão da
política aceita, data de cadastro, token de saída. Rota validada com Zod
e com o rate limit existente (`server/_core/rate-limit.ts`). Cadastro repetido do mesmo
e-mail não cria duplicata nem revela se o e-mail já existe (resposta igual).

**E-mail de confirmação** — enviado na hora pelo Resend, reaproveitando o envio de
`server/email-auth.ts` (HTTP puro, `RESEND_API_KEY` + `EMAIL_FROM` já configurados em
produção; `/api/auth/methods` retorna `email:true`). Conteúdo: "você está na lista do
Vigora" + link "não fui eu / me tire da lista" (token de saída). Falha no envio é logada com
o motivo real e não desfaz o cadastro.

**Anti-abuso** *(decisão do Claude)*: opt-in simples — o cadastro vale ao enviar o
formulário, e o e-mail de confirmação traz o link de saída. Se o e-mail já está na lista,
**nenhum e-mail novo é enviado** e a resposta na tela é a mesma. Isso impede usar o
formulário para encher a caixa de terceiros e protege a reputação do domínio, que também
envia os códigos de login.

**Saída** *(decisão do Claude)*: o link de saída **apaga o registro** (sem status "saiu") e
mostra uma confirmação. Quem voltar se cadastra de novo, com aceite novo. É o mesmo link
que o e-mail de lançamento usará. Com isso, a tabela não precisa de coluna de status.

**Exportação** — o Pedro conta e exporta cadastros direto no banco. Não há painel.

## Construção (decidido)

- **HTML + CSS sem framework**, servido pelo **mesmo servidor Express do Railway** que roda
  a API. Precedente: `/convite/:token` já serve uma página pública. Formulário no mesmo
  domínio ⇒ não é preciso alargar o CORS.
- O formulário funciona **sem JavaScript** (POST de formulário HTML comum + redirecionamento
  para uma página/estado de "obrigado"). JS, se houver, é só melhoria.
- O CSP estrito da API (`default-src 'none'`, `server/_core/security-headers.ts`) deve ser
  relaxado **só nas rotas do site**, o mínimo necessário (estilos, fontes e imagens do
  próprio domínio, `form-action 'self'`). Não remover os security headers.
- Sem analytics nem cookies ⇒ sem banner de cookies.
- DNS de `vigorasaude.com` (raiz) apontando para o mesmo serviço do Railway é configuração
  do Pedro. *(Decisão do Claude)*: as rotas do site respondem no host raiz; `www`
  redireciona para a raiz; uma variável nova `SITE_URL` (padrão `https://vigorasaude.com`,
  também no `.env.example`) monta os links absolutos dos e-mails.

## Textos legais (rascunho para revisão jurídica)

**Política de Privacidade** (`/privacidade`) — cobre o **app e a lista de espera**. Partir
do resumo já existente em `app/(tabs)/settings.tsx` (dados tratados, onde ficam,
compartilhamento com WhatsApp/Meta, Twilio, Expo, Google, Apple, RevenueCat, cuidador e
consentimento, verificação diária, direitos do Art. 18) e acrescentar: lista de espera
(dados, finalidade, base legal consentimento, Resend como operador que recebe só o e-mail,
retenção), base legal por finalidade, retenção, transferência internacional (Meta, Twilio,
Resend, RevenueCat etc. ficam fora do Brasil), segurança, dados de idosos/sensíveis,
atualização da política, data de vigência e versão.

- **Controlador:** Pedro Frey Pizzolato, pessoa física, Novo Hamburgo/RS, contato
  `vigora@vigorasaude.com` (não usar o e-mail pessoal; sem CPF no site). Marcar no próprio
  texto um aviso bem visível para trocar pela razão social/CNPJ quando o MEI for aberto
  (lembrete já existe em `docs/claude/roadmap.md`, item 6).
- **Encarregado (DPO):** `privacidade@vigorasaude.com`.
- **Retenção** *(decisão do Claude, para revisão)*: lista de espera apagada até 12 meses
  após o lançamento ou na hora da saída; dados do app como hoje (apagados ao excluir a
  conta). Prazo de backups e região do servidor (transferência internacional) ficam
  marcados como pendência para a revisão jurídica.

**Termos de Uso** (`/termos`) — hoje só existe o disclaimer. Rascunho completo: o que é o
serviço, o que ele não é (não é dispositivo médico, não é serviço de emergência), limitações
(alertas podem falhar), conta e responsabilidades, assinatura com 14 dias de teste e
cobrança/cancelamento pela loja, contatos de emergência precisam aceitar antes de receber
alertas, cuidador vinculado, encerramento de conta, lei brasileira e foro da comarca de
**Novo Hamburgo/RS**, contato (`suporte@vigorasaude.com`).

Ambos levam no topo um aviso de rascunho enquanto não forem revisados.

## Fora deste projeto (anotado, não fazer aqui)

- Pacote do app para o lançamento (decidido pelo Pedro: não fazer na beta fechada): trocar
  `DPO_EMAIL` em `app/(tabs)/settings.tsx:46` (`privacidade@vigora.com.br`) por
  `privacidade@vigorasaude.com` **e** fazer login (`app/login.tsx:415`), paywall
  (`app/(modal)/paywall.tsx:390`) e Configurações apontarem para `/termos` e
  `/privacidade`.
- Renomear o que o usuário vê de "Vigora Pro" (nome na loja/paywall); **não** mexer no
  identificador do entitlement no RevenueCat.
- Apagar o prefixo da chave Resend em `todo.md:504`.
- Confirmar que as caixas `privacidade@`, `suporte@` e `vigora@vigorasaude.com` recebem
  e-mail.

## Deixado para quem construir

Textos finais de cada seção (dentro da voz e das regras acima), as perguntas frequentes
além das mínimas, o layout fino de cada seção abaixo da abertura, os nomes de rota e de
tabela, a página/estado de "obrigado" e o tratamento do modo escuro.
