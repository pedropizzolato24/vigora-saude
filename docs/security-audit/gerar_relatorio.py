#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
gerar_relatorio.py — Gera o PDF da auditoria de segurança do Vigora.

Uso (a partir da raiz do repositório):
    docs/security-audit/.venv/Scripts/python.exe docs/security-audit/gerar_relatorio.py

Se o venv não existir:
    python -m venv docs/security-audit/.venv
    docs/security-audit/.venv/Scripts/python.exe -m pip install reportlab matplotlib

Os achados vivem na constante ACHADOS abaixo — editá-la e rodar de novo
regenera o relatório inteiro (gráficos, tabelas e issues).
"""

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle, XPreformatted,
)

# --------------------------------------------------------------------------
# Configuração
# --------------------------------------------------------------------------

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "relatorio-auditoria-seguranca.pdf")
GRAFICOS = os.path.join(AQUI, "graficos")

PROJETO = "Vigora"
DATA = "4 de setembro de 2026"
BRANCH = "fix/launch-prep"
COMMIT = "fb7f379"

COR = {
    "critica":     colors.HexColor("#B91C1C"),
    "alta":        colors.HexColor("#EA580C"),
    "media":       colors.HexColor("#D97706"),
    "baixa":       colors.HexColor("#2563EB"),
    "informativa": colors.HexColor("#64748B"),
    "forte":       colors.HexColor("#059669"),
}
MARCA = colors.HexColor("#1E4D8C")
TINTA = colors.HexColor("#11181C")
SUAVE = colors.HexColor("#687076")
LINHA = colors.HexColor("#D9D9D9")
FUNDO = colors.HexColor("#F7F5F0")

ROTULO = {
    "critica": "CRÍTICA", "alta": "ALTA", "media": "MÉDIA",
    "baixa": "BAIXA", "informativa": "INFORMATIVA",
}

# --------------------------------------------------------------------------
# Achados
# --------------------------------------------------------------------------

# (chave, rótulo curto p/ o gráfico, rótulo completo p/ as fichas)
CATEGORIAS = [
    ("cat1", "1. Isolamento", "1. Banco sem tranca (isolamento por conta)"),
    ("cat2", "2. Papel no cliente", "2. Permissão definida no cliente"),
    ("cat3", "3. IDOR", "3. IDOR (objeto por ID)"),
    ("cat4", "4. Chaves expostas", "4. Chaves expostas (hardcode)"),
    ("cat5", "5. Inputs / XSS", "5. Inputs sem tratamento (XSS)"),
    ("hard", "Endurecimento", "Endurecimento (informativo)"),
]

ACHADOS = [
    {
        "id": "V-01",
        "cat": "cat3",
        "sev": "media",
        "titulo": "push.unregister apaga o token de push de qualquer conta, sem verificar posse",
        "arquivo": "server/routers-push.ts",
        "linhas": "91-96",
        "codigo": """unregister: protectedProcedure
  .input(z.object({ token: z.string().min(1).max(255) }))
  .mutation(async ({ input }) => {
    await deletePushToken(input.token);   // <- sem ctx.user.openId
    return { success: true } as const;
  }),""",
        "porque": (
            "É o único handler do backend que localiza uma linha por identificador vindo do "
            "cliente e a apaga sem cruzar com <b>ctx.user.openId</b>. O <b>protectedProcedure</b> "
            "garante apenas que existe uma sessão válida — não que o token pertence a quem chama. "
            "A função de banco <b>deletePushToken</b> (server/db-push.ts:42-46) filtra só por "
            "<font face=\"Courier\">eq(pushTokens.token, token)</font>. O comportamento é "
            "deliberado e está travado por teste "
            "(tests/push-unregister.test.ts:80-93, \"apaga a linha mesmo quando ela pertence a "
            "outra conta\"), o que significa que uma correção precisa preservar o caso de uso "
            "legítimo — aparelho que registrou como cuidador e depois entrou como monitorado."
        ),
        "impacto": (
            "Apagar o token do cuidador desarma silenciosamente o canal de alerta em tempo real "
            "do dead man's switch: <b>pushMissedAlarmToCaregivers</b>, <b>sosAlertCaregivers</b> e "
            "os Passos 3 e 4 do monitoring-job resolvem zero tokens e saem sem notificar. O "
            "cuidador só descobriria abrindo a tela de Alertas. É o cenário de falha mais grave "
            "do produto (alarme não entregue) provocado por uma chamada autenticada de terceiro."
        ),
        "condicao": (
            "Exige conhecer o valor do Expo push token da vítima. Nenhuma rota do servidor "
            "devolve tokens ao cliente (getPushTokensForOpenIds é usado só internamente), então "
            "não há enumeração remota: o vetor realista é vazamento por log, aparelho "
            "compartilhado, backup ou comprometimento do dispositivo."
        ),
        "correcao": (
            "Apagar por <font face=\"Courier\">(token, openId)</font> quando a linha pertence a "
            "quem chama e, para o caso de troca de conta no mesmo aparelho, exigir prova de posse "
            "do dispositivo — por exemplo aceitar o par (token, deviceId) ou deixar a limpeza da "
            "linha órfã para o <b>upsertPushToken</b> do próximo registro, que já reatribui o "
            "openId da linha. No mínimo, aplicar limite de taxa por chamador e registrar log da "
            "remoção cruzada."
        ),
    },
    {
        "id": "V-02",
        "cat": "cat5",
        "sev": "media",
        "titulo": "lastLocation entra sem validação na mensagem de WhatsApp enviada aos contatos de emergência",
        "arquivo": "server/routers-monitoring.ts",
        "linhas": "203 (entrada) → server/monitoring-job.ts:470-476 (uso)",
        "codigo": """// routers-monitoring.ts:203 — heartbeat aceita texto livre
lastLocation: z.string().optional(),

// monitoring-job.ts:470-476 — o texto vira URL dentro da mensagem
const liveness = await getAccountLiveness(account.openId);
if (liveness?.lastLocation) {
  const [lat, lng] = liveness.lastLocation.split(",");
  if (lat && lng) {
    locationUrl = `https://maps.google.com/?q=${lat},${lng}`;
  }
}
// buildWarningMessage (monitoring-job.ts:228-231)
message += `\\n\\n📍 Última localização registrada:\\n${locationUrl}`;""",
        "porque": (
            "<b>lastLocation</b> é aceito como <font face=\"Courier\">z.string()</font> sem "
            "formato nem tamanho, gravado direto em <b>account_liveness.lastLocation</b> "
            "(server/db-monitoring.ts:41-43) e depois interpolado numa URL que compõe o corpo da "
            "mensagem enviada pelo número do WhatsApp Business do Vigora, com "
            "<font face=\"Courier\">preview_url: true</font> (server/whatsapp.ts:231). O "
            "<font face=\"Courier\">split(\",\")</font> não valida que as partes sejam "
            "coordenadas: qualquer texto com uma vírgula produz um "
            "<font face=\"Courier\">locationUrl</font> arbitrário. O próprio código reconhece "
            "esse risco no caminho gêmeo — em server/routers.ts:385 o campo "
            "<font face=\"Courier\">locationUrl</font> é validado com "
            "<font face=\"Courier\">.url()</font> justamente para que \"texto arbitrário/phishing "
            "não seja injetado no corpo templado do WhatsApp sob o remetente confiável Vigora\". "
            "A mesma defesa não existe nesta rota."
        ),
        "impacto": (
            "Injeção de conteúdo em mensagem enviada sob remetente verificado a familiares "
            "idosos, num momento de pânico (\"alerta sério\"). Permite phishing com alta taxa de "
            "sucesso e, se abusado, coloca em risco a reputação do número do WhatsApp Business — "
            "cujo banimento pela Meta derrubaria a escalação de <i>todos</i> os usuários."
        ),
        "condicao": (
            "Exige controle de uma sessão válida da conta monitorada (o próprio aparelho, uma "
            "sessão roubada ou um cliente modificado) — a mensagem envenenada vai para os "
            "contatos daquela conta. A coluna é <font face=\"Courier\">varchar(64)</font>, o que "
            "limita o payload; conforme o <font face=\"Courier\">sql_mode</font> do MySQL o valor "
            "é truncado (silencioso) ou rejeitado."
        ),
        "correcao": (
            "Validar o formato no limite tRPC — por exemplo "
            "<font face=\"Courier\">z.string().regex(/^-?\\d{1,3}(\\.\\d+)?,-?\\d{1,3}(\\.\\d+)?$/)"
            "</font> — e, em monitoring-job.ts, converter cada parte com "
            "<font face=\"Courier\">Number()</font> e só montar a URL se ambas forem finitas e "
            "dentro das faixas de latitude/longitude, aplicando "
            "<font face=\"Courier\">encodeURIComponent</font> na concatenação."
        ),
    },
    {
        "id": "V-03",
        "cat": "cat5",
        "sev": "baixa",
        "titulo": "PDF da ficha médica monta HTML sem escapar nenhum campo do usuário",
        "arquivo": "lib/pdf-utils-v2.ts",
        "linhas": "89, 93, 111, 115, 119, 127, 131, 135",
        "codigo": """<div class="field-value">${anamnesis.fullName || 'Não informado'}</div>
<div class="field-value">${formatDate(anamnesis.birthDate)}</div>
<div class="field-value">${anamnesis.allergies || 'Nenhuma informada'}</div>
<div class="field-value">${anamnesis.medications || 'Nenhum informado'}</div>
<div class="field-value">${anamnesis.diseases || 'Nenhuma informada'}</div>
<div class="field-value">${anamnesis.susNumber || 'Não informado'}</div>
<div class="field-value">${anamnesis.healthPlanProvider || 'Não informado'}</div>
<div class="field-value">${anamnesis.healthPlanNumber || 'Não informado'}</div>""",
        "porque": (
            "Oito campos de texto livre da anamnese são concatenados crus no HTML que "
            "<b>expo-print</b> renderiza (<font face=\"Courier\">Print.printToFileAsync</font>, "
            "lib/pdf-utils-v2.ts:158) — no Android isso é um WebView de impressão. O módulo irmão "
            "<b>lib/health-report-generator.ts</b> já corrigiu exatamente esta classe de bug: ele "
            "define <font face=\"Courier\">esc()</font> (linhas 28-36) e o cabeçalho do arquivo "
            "documenta que \"a versão anterior concatenava input cru do usuário no HTML, "
            "permitindo injeção trivial de HTML/script\". O pdf-utils-v2 nunca recebeu esse "
            "tratamento — não há nenhuma chamada de escape no arquivo."
        ),
        "impacto": (
            "Injeção de HTML/CSS num documento médico compartilhado externamente "
            "(<font face=\"Courier\">Sharing.shareAsync</font>, linha 170): o conteúdo do PDF "
            "entregue ao profissional de saúde pode ser adulterado — campos ocultados, valores "
            "sobrepostos, texto forjado. No WebView de impressão do Android há ainda execução de "
            "script no contexto da renderização."
        ),
        "condicao": (
            "A anamnese renderizada é a da própria conta (app/(tabs)/anamnesis.tsx:126 passa o "
            "formulário local), então é autoinjeção: exige que o dado malicioso já esteja no "
            "estado da conta. Nenhuma tela de cuidador chama este gerador, portanto não há "
            "caminho entre contas. Vale como defeito de consistência e defesa em profundidade, "
            "não como tomada de conta."
        ),
        "correcao": (
            "Importar e aplicar o <font face=\"Courier\">esc()</font> já exportado por "
            "lib/health-report-generator.ts em todos os oito pontos de interpolação (e nas partes "
            "de <font face=\"Courier\">formatDate</font>). Um teste que renderize uma anamnese "
            "com <font face=\"Courier\">&lt;script&gt;</font> e afirme a ausência da tag no HTML "
            "de saída trava a regressão."
        ),
    },
    {
        "id": "V-04",
        "cat": "cat4",
        "sev": "baixa",
        "titulo": "JWT_SECRET tem fallback para string vazia; a trava de inicialização depende só de NODE_ENV",
        "arquivo": "server/_core/env.ts",
        "linhas": "9 e 99-110; server/_core/sdk.ts:50-53",
        "codigo": """// env.ts:9
cookieSecret: process.env.JWT_SECRET ?? "",

// sdk.ts:50-53 — assina E verifica com a chave vazia se a env faltar
function getSessionSecret() {
  const secret = process.env.JWT_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

// env.ts:99-110 — a recusa de boot só vale quando NODE_ENV === "production"
const isProduction = env.NODE_ENV === "production";
if (!isProduction) {
  if (secret.length === 0) { console.warn(...); }
  return;                       // <- segue com HMAC de chave vazia
}""",
        "porque": (
            "O valor padrão vazio é exatamente o \"default que vira segredo real se não for "
            "sobrescrito\": com ele, os JWTs de sessão são assinados <i>e</i> verificados com uma "
            "chave HMAC vazia, permitindo forjar token para qualquer <b>openId</b>. A validação "
            "de startup <b>assertRequiredSecrets</b> existe e está correta — mas decide pela "
            "string <font face=\"Courier\">NODE_ENV</font> em vez de decidir pela presença do "
            "segredo. Qualquer desvio (<font face=\"Courier\">\"Production\"</font>, "
            "<font face=\"Courier\">\"prod\"</font>, variável ausente porque um Start Command "
            "customizado no painel do Railway substituiu o script "
            "<font face=\"Courier\">start</font> — que é quem define "
            "<font face=\"Courier\">NODE_ENV=production</font>, package.json:10) faz o servidor "
            "subir em modo permissivo, com apenas um aviso no log."
        ),
        "impacto": (
            "No cenário em que a condição se materializa, o impacto é total: forja de sessão para "
            "qualquer conta, com acesso a métricas de saúde, anamnese, contatos de emergência e "
            "localização. Nada mais no sistema barra um JWT bem-formado."
        ),
        "condicao": (
            "Não explorável na configuração atual verificada: o script "
            "<font face=\"Courier\">start</font> define NODE_ENV=production e não há Dockerfile, "
            "Procfile, railway.json ou nixpacks.toml no repositório que contradiga isso. O risco é "
            "de configuração — a trava não é auto-suficiente. Também não foi encontrado nenhum "
            "segredo real embutido no código, nos workflows, no eas.json ou no histórico do Git "
            "(ver Pontos Fortes)."
        ),
        "correcao": (
            "Inverter a decisão: exigir o segredo sempre que ele for usado, e permitir o modo "
            "permissivo apenas mediante uma opção explícita de desenvolvimento (por exemplo "
            "<font face=\"Courier\">ALLOW_INSECURE_DEV_SECRET=1</font>), nunca por inferência de "
            "NODE_ENV. Alternativa mínima e barata: fazer "
            "<font face=\"Courier\">getSessionSecret()</font> lançar quando o segredo é vazio, de "
            "modo que a falha ocorra na primeira operação de sessão em vez de aceitar tokens "
            "forjados. Estender a checagem a DATABASE_URL fecha a mesma lacuna no banco."
        ),
    },
    {
        "id": "V-05",
        "cat": "cat1",
        "sev": "baixa",
        "titulo": "Lista de destinatários do alerta valida só os 8 últimos dígitos do telefone",
        "arquivo": "server/routers.ts",
        "linhas": "33-44 (uso em 417-426)",
        "codigo": """function isAllowedRecipient(claimed, stored): boolean {
  const claimedDigits = normalizeDigits(claimed.phone);
  if (claimedDigits.length < 8) return false;
  const claimedTail = claimedDigits.slice(-8);      // <- só o sufixo
  return stored.some((c) => {
    const tail = normalizeDigits(c.phone).slice(-8);
    return tail.length >= 8 && tail === claimedTail;
  });
}""",
        "porque": (
            "O controle existe para garantir que <b>whatsapp.sendEmergencyAlert</b> não tenha "
            "\"destinos arbitrários\" (comentário em server/routers.ts:365-368). Comparar apenas "
            "os 8 dígitos finais descarta o DDI, o DDD e o nono dígito: um contato salvo em "
            "<font face=\"Courier\">(11) 9 8888-7777</font> autoriza o envio para "
            "<font face=\"Courier\">(51) 8888-7777</font>, <font face=\"Courier\">(21) 9 "
            "8888-7777</font> e todas as demais variantes de DDD/prefixo — cerca de uma centena "
            "de números reais distintos por contato cadastrado, em vez de um. O escopo efetivo do "
            "controle é bem mais largo que o documentado."
        ),
        "impacto": (
            "Envio de mensagem sob o remetente confiável do Vigora para números que o titular "
            "nunca cadastrou. O teto de abuso é contido pelo limite de taxa por conta (5 mensagens "
            "/ 60 s, server/routers.ts:51-66) e pelo fato de o alvo ter que colidir no sufixo, mas "
            "a garantia de \"apenas contatos do titular\" não se sustenta como escrita."
        ),
        "condicao": (
            "Requer sessão autenticada. O ganho real para um atacante é limitado, porque a lista "
            "de contatos é gravada pelo próprio titular via <b>userData.put</b> — quem controla a "
            "conta já pode cadastrar o número que quiser. O achado é relevante como divergência "
            "entre a propriedade de segurança declarada e a implementada, e como enfraquecimento "
            "do controle diante de um cliente comprometido."
        ),
        "correcao": (
            "Comparar o número normalizado por completo (dígitos com DDI, via a mesma "
            "<b>normalizeBrPhone</b> de server/phone-auth.ts:41-59) em vez do sufixo. Se a "
            "tolerância a variações de formato precisar ser mantida, normalizar os dois lados para "
            "E.164 antes de comparar, tratando explicitamente o nono dígito, em vez de truncar."
        ),
    },
    {
        "id": "V-06",
        "cat": "hard",
        "sev": "informativa",
        "titulo": "Parser de formulário registrado numa API exclusivamente JSON",
        "arquivo": "server/_core/index.ts",
        "linhas": "46",
        "codigo": """app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));  // <- sem uso""",
        "porque": (
            "Nenhuma rota consome corpo <font face=\"Courier\">application/x-www-form-urlencoded"
            "</font>: as dez rotas de <font face=\"Courier\">/api/auth</font> fazem "
            "<font face=\"Courier\">safeParse(req.body)</font> sobre JSON e o restante passa pelo "
            "adaptador tRPC. O parser aumenta a superfície para requisições \"simples\" (sem "
            "preflight CORS), que são as únicas que atravessariam a política de origem com o "
            "cookie de sessão <font face=\"Courier\">SameSite=none</font> anexado."
        ),
        "impacto": (
            "Baixo. <b>Verificado empiricamente</b> com uma prova de conceito local (express + "
            "@trpc/server nas versões do projeto): o tRPC v11 responde "
            "<font face=\"Courier\">415 Unsupported Media Type</font> tanto para "
            "<font face=\"Courier\">application/x-www-form-urlencoded</font> quanto para "
            "<font face=\"Courier\">text/plain</font>, e a mutação não executa. Não há CSRF contra "
            "os procedimentos tRPC. O resíduo se limita a rotas express simples sem efeito "
            "sensível — <font face=\"Courier\">POST /api/auth/logout</font>, que apenas limparia o "
            "cookie da vítima."
        ),
        "condicao": "Nenhuma exploração confirmada. Registrado como redução de superfície.",
        "correcao": (
            "Remover a linha 46. A API é JSON de ponta a ponta e nada depende do parser."
        ),
    },
]

PONTOS_FORTES = [
    ("Isolamento por conta em 100% dos 30 procedimentos tRPC",
     "Os cinco routers (auth, userData, monitoring, link, push) foram lidos handler a handler. "
     "Todo acesso a dado de domínio deriva o escopo de <b>ctx.user.openId</b>, nunca de input do "
     "cliente. As consultas de listagem — getHistory (routers-monitoring.ts:296), getWarnings "
     "(310), getStatus (326), userData.get (routers.ts:243) e a exportação LGPD userData.export "
     "(296) — passam openId explicitamente, e as funções de banco correspondentes filtram por "
     "<font face=\"Courier\">eq(tabela.openId, openId)</font> (db-monitoring.ts:378, 450; "
     "db.ts:162; db-links.ts:145, 162)."),
    ("Acesso do cuidador é derivado no servidor, jamais aceito do cliente",
     "<b>requireCaregiverLink</b> (routers-links.ts:93-102) resolve o vínculo ativo pelo openId de "
     "quem chama e devolve 403 se não houver. É o portão único de getMonitoredData (263) e "
     "getMonitoredAlerts (294) — nenhuma das duas aceita um identificador de pessoa monitorada "
     "por parâmetro. A revogação por qualquer das partes (revokeLink, 443-452) marca "
     "<font face=\"Courier\">status='revoked'</font> e todas as consultas de acesso filtram por "
     "<font face=\"Courier\">status='active'</font>, encerrando a leitura no ato."),
    ("Categoria 2 sem achados: todo gate de papel do cliente tem par no servidor",
     "Os gates de <font face=\"Courier\">userType</font> do aplicativo são espelhados no backend: "
     "createInvite exige monitored (routers-links.ts:110-115), redeemInvite exige caregiver "
     "(148-153), createShareInvite exige caregiver (326-331) e acceptInvite exige monitored "
     "(384-389). O guard de rota app/(caregiver-tabs)/_layout.tsx:21-34 é declaradamente defesa em "
     "profundidade. O <font face=\"Courier\">isPro</font> do RevenueCat controla apenas o selo "
     "visual (app/(tabs)/index.tsx:418 e tudo.tsx:330) — nenhuma capacidade de servidor depende "
     "dele. O <b>adminProcedure</b> existe (_core/trpc.ts:30-45) mas não é usado por nenhuma "
     "rota: não há superfície administrativa a proteger."),
    ("Nenhum segredo embutido no código nem no histórico do Git",
     "Varredura por padrões de chave/token/senha em código, configs, workflows e scripts não "
     "retornou credencial alguma — apenas segredos óbvios de teste em tests/*.test.ts. Os Client "
     "IDs do Google em google-auth.ts:30-35 e eas.json são identificadores públicos de OAuth, "
     "documentados como tal. O <font face=\"Courier\">.env</font> chegou a ser versionado (commit "
     "6d65099, removido em a02346c), mas continha apenas marcadores "
     "(<font face=\"Courier\">&lt;Android Client ID do Google Cloud Console&gt;</font>) — não há "
     "vazamento no histórico. Chaveiros, credentials.json e google-service-account.json estão "
     "cobertos pelo .gitignore e nunca foram rastreados."),
    ("Escapamento de HTML correto nos dois geradores mais expostos",
     "A landing de convite renderizada pelo servidor valida o token contra "
     "<font face=\"Courier\">/^[A-Za-z0-9_-]{1,32}$/</font> antes de refleti-lo num href e passa "
     "todo o resto por <b>escapeHtml</b> (invite-landing.ts:95-125), servida sob CSP restritiva "
     "(_core/index.ts:94-97). O relatório de saúde em PDF roteia cada string do usuário por "
     "<b>esc()</b>, inclusive nos campos do cabeçalho, pré-escapados na atribuição "
     "(health-report-generator.ts:469-473). Nenhum e-mail transacional interpola input do "
     "usuário: os corpos em email-auth.ts:142-177 só recebem o código gerado no servidor."),
    ("Sessão, transporte e limites de taxa bem construídos",
     "JWT em <b>expo-secure-store</b> no nativo e cookie httpOnly na web, sem localStorage "
     "(lib/_core/auth.ts:106-157). CORS por allowlist que recusa preflight de origem desconhecida "
     "(_core/cors.ts:135-165), cabeçalhos de segurança completos incluindo HSTS e "
     "<font face=\"Courier\">frame-ancestors 'none'</font> (_core/security-headers.ts). Limite de "
     "taxa por IP não forjável, derivado de <font face=\"Courier\">req.ip</font> com "
     "<font face=\"Courier\">trust proxy 1</font> (_core/rate-limit.ts:213-224), somado a "
     "throttles por destino (db-auth.ts:245-260) e por conta em SOS, alertas, convites e resgates."),
    ("Senhas, códigos e convites com primitivas corretas",
     "scrypt N=16384 com sal por usuário e <b>timingSafeEqual</b> (email-auth.ts:59-99), hash "
     "descartável para equalizar o tempo e impedir enumeração (103, 334), códigos OTP via "
     "<font face=\"Courier\">randomInt</font> com TTL de 15 min, uso único e teto de 5 tentativas "
     "por linha (db-auth.ts:264-347). Convites usam CSPRNG — 6 caracteres com TTL de 10 min para o "
     "código falado e token de ~96 bits para o link (links-code.ts) — com resgate atômico "
     "<font face=\"Courier\">claim-before-act</font> que fecha o TOCTOU (db-links.ts:55-75)."),
    ("Exclusão de conta transacional e sem dado de saúde em log",
     "<b>deleteAccountData</b> (db-account.ts:234-287) apaga as dez tabelas numa única transação e "
     "deixa a linha de <font face=\"Courier\">users</font> por último, invalidando toda sessão em "
     "aberto no commit. Busca por <font face=\"Courier\">console.*</font> contendo anamnese, "
     "métricas, tipo sanguíneo, medicamentos, contatos ou coordenadas não retornou nenhuma "
     "ocorrência; os números de telefone são mascarados antes de qualquer log "
     "(whatsapp.ts:214-216)."),
]

PONTOS_FRACOS = [
    ("Um handler destrutivo sem verificação de posse",
     "<b>push.unregister</b> é a única exceção ao padrão de posse implícita que o resto do backend "
     "segue com rigor — e a exceção cai justamente sobre o canal de alerta em tempo real do dead "
     "man's switch, onde a falha é silenciosa (V-01)."),
    ("Validação de entrada desigual entre caminhos que terminam no mesmo lugar",
     "Dois campos alimentam a mesma mensagem de WhatsApp sob remetente confiável; um é validado "
     "com <font face=\"Courier\">.url()</font> e o outro aceita texto livre (V-02). O mesmo padrão "
     "se repete na geração de HTML: um módulo escapa tudo, o irmão não escapa nada (V-03). O risco "
     "central não é cada ponto isolado, e sim a ausência de uma regra uniforme aplicada a todo "
     "limite de confiança."),
    ("Controles que dependem de configuração externa correta para valer",
     "A recusa de boot sem JWT_SECRET protege apenas quando <font face=\"Courier\">NODE_ENV</font> "
     "vale exatamente <font face=\"Courier\">production</font> (V-04). Uma trava de segurança não "
     "deveria depender de uma string de ambiente que vive fora do repositório."),
    ("Escopo declarado mais estreito que o implementado",
     "O comentário de <b>sendEmergencyAlert</b> promete que todo destinatário é um contato "
     "cadastrado; a comparação por sufixo de 8 dígitos entrega algo consideravelmente mais amplo "
     "(V-05). Divergência entre documentação de segurança e código corrói a confiança em revisões "
     "futuras."),
]

RECOMENDACOES = [
    ("P1", "media", "Fechar V-01 e V-02 antes do lançamento",
     "São os dois achados que tocam o diferencial do produto. V-01 permite desarmar o alerta ao "
     "cuidador com uma chamada autenticada; V-02 permite injetar conteúdo na mensagem que a "
     "família recebe sob o remetente Vigora. Ambos têm correção pequena e localizada, e ambos "
     "merecem teste de regressão — o padrão de tests/push-unregister.test.ts serve de molde, "
     "invertendo a asserção do terceiro caso."),
    ("P2", "baixa", "Uniformizar validação e escapamento nos limites de confiança",
     "Aplicar <font face=\"Courier\">esc()</font> nos oito pontos de lib/pdf-utils-v2.ts (V-03) e "
     "trocar a comparação por sufixo por telefone normalizado completo em isAllowedRecipient "
     "(V-05). Convém registrar a regra em docs/claude/padroes-e-testes.md: todo dado que sai para "
     "HTML, URL ou mensagem passa por escape/validação explícita, sem exceção por módulo."),
    ("P3", "baixa", "Tornar a trava de segredo auto-suficiente",
     "Fazer a exigência do JWT_SECRET depender da presença do segredo e não de NODE_ENV, com "
     "escape explícito para desenvolvimento (V-04), e estender a verificação a DATABASE_URL. "
     "Complementar com um teste que afirme que a função de assinatura recusa segredo vazio."),
    ("P4", "informativa", "Reduzir superfície e fechar lacunas de consistência",
     "Remover <font face=\"Courier\">express.urlencoded</font> (V-06). Como itens menores "
     "observados durante a varredura, sem achado associado: <b>link.getInviteInfo</b> "
     "(routers-links.ts:360) é o único procedimento do router de vínculos sem limite de taxa "
     "próprio — inofensivo hoje, porque o token tem ~96 bits, mas fora do padrão dos irmãos; e "
     "<b>consumeInviteByCode</b> devolve <font face=\"Courier\">true</font> quando não há banco "
     "(db-links.ts:61), um padrão fail-open hoje inalcançável (a autenticação falha antes) que "
     "convém inverter."),
    ("P5", "informativa", "Cobrir o processo, não só o código",
     "Duas observações de arquitetura registradas na leitura: a denylist de tokens revogados e "
     "todos os limitadores de taxa são mapas em memória por processo (sdk.ts:21, "
     "rate-limit.ts:236, routers-links.ts:50-63) — corretos para uma instância, mas silenciosamente "
     "ineficazes se o deploy do Railway escalar horizontalmente; e o /api/health já expõe a saúde "
     "do job do dead man's switch, mas o incidente de 27 h registrado no repositório mostra que "
     "monitoramento externo ativo é o que fecha esse laço."),
]

# --------------------------------------------------------------------------
# Gráficos
# --------------------------------------------------------------------------

def _hex(chave):
    return COR[chave].hexval().replace("0x", "#")


def gerar_graficos():
    os.makedirs(GRAFICOS, exist_ok=True)
    plt.rcParams["font.family"] = "DejaVu Sans"

    # --- Rosca por severidade ---
    ordem = ["critica", "alta", "media", "baixa", "informativa"]
    contagem = {s: sum(1 for a in ACHADOS if a["sev"] == s) for s in ordem}
    presentes = [(s, contagem[s]) for s in ordem if contagem[s] > 0]

    fig, ax = plt.subplots(figsize=(5.0, 3.5), dpi=220)
    valores = [v for _, v in presentes]
    cores = [_hex(s) for s, _ in presentes]
    rotulos = [f"{ROTULO[s].capitalize()}\n{v}" for s, v in presentes]

    wedges, textos = ax.pie(
        valores, colors=cores, startangle=90, counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2.2),
        labels=rotulos, labeldistance=1.16,
        textprops=dict(fontsize=10.5, color="#11181C"),
    )
    total = sum(valores)
    ax.text(0, 0.10, str(total), ha="center", va="center",
            fontsize=25, weight="bold", color="#11181C")
    ax.text(0, -0.20, "achados", ha="center", va="center",
            fontsize=9.5, color="#687076")
    ax.set(aspect="equal")
    fig.tight_layout(pad=0.4)
    p1 = os.path.join(GRAFICOS, "severidade.png")
    fig.savefig(p1, transparent=True, bbox_inches="tight")
    plt.close(fig)

    # --- Barras por categoria ---
    nomes = [curto for _, curto, _ in CATEGORIAS]
    vals = [sum(1 for a in ACHADOS if a["cat"] == k) for k, _, _ in CATEGORIAS]

    # Cor da barra = severidade mais alta encontrada na categoria.
    prio = ["critica", "alta", "media", "baixa", "informativa"]
    barra_cores = []
    for k, _, _ in CATEGORIAS:
        sevs = [a["sev"] for a in ACHADOS if a["cat"] == k]
        barra_cores.append(_hex(next((s for s in prio if s in sevs), "forte")))

    # Proporção próxima da caixa de destino no PDF: figura larga demais encolhe
    # o texto ao ser redimensionada e o gráfico fica ilegível.
    fig, ax = plt.subplots(figsize=(4.6, 3.0), dpi=220)
    y = range(len(nomes))[::-1]
    barras = ax.barh(list(y), vals, color=barra_cores, height=0.60)
    ax.set_yticks(list(y))
    ax.set_yticklabels(nomes, fontsize=12, color="#11181C")
    ax.set_xlim(0, max(vals) + 0.7)
    ax.set_xticks(range(0, max(vals) + 1))
    ax.tick_params(axis="x", labelsize=11, colors="#687076")
    ax.tick_params(axis="y", length=0)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color("#D9D9D9")
    ax.xaxis.grid(True, color="#EDEDED", linewidth=0.9)
    ax.set_axisbelow(True)
    for b, v in zip(barras, vals):
        ax.text(b.get_width() + 0.09, b.get_y() + b.get_height() / 2,
                str(v), va="center", fontsize=12, weight="bold",
                color="#11181C" if v else "#9BA1A6")
    fig.tight_layout(pad=0.4)
    p2 = os.path.join(GRAFICOS, "categorias.png")
    fig.savefig(p2, transparent=True, bbox_inches="tight")
    plt.close(fig)

    return p1, p2


# --------------------------------------------------------------------------
# Estilos
# --------------------------------------------------------------------------

_ss = getSampleStyleSheet()

def E(nome, **kw):
    base = dict(name=nome, fontName="Helvetica", fontSize=9.6, leading=14.2,
                textColor=TINTA, alignment=TA_JUSTIFY)
    base.update(kw)
    return ParagraphStyle(**base)

ST = {
    "corpo":      E("corpo"),
    "corpo_c":    E("corpo_c", spaceAfter=6),
    "h1":         E("h1", fontName="Helvetica-Bold", fontSize=17, leading=21,
                    textColor=MARCA, spaceBefore=4, spaceAfter=11, alignment=0),
    "h2":         E("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16,
                    textColor=MARCA, spaceBefore=13, spaceAfter=6, alignment=0),
    "h3":         E("h3", fontName="Helvetica-Bold", fontSize=10.4, leading=14,
                    textColor=TINTA, spaceBefore=8, spaceAfter=3, alignment=0),
    "capa_t":     E("capa_t", fontName="Helvetica-Bold", fontSize=27, leading=33,
                    textColor=MARCA, alignment=TA_CENTER),
    "capa_s":     E("capa_s", fontSize=13, leading=18, textColor=SUAVE,
                    alignment=TA_CENTER),
    "capa_d":     E("capa_d", fontSize=10.2, leading=15, textColor=TINTA,
                    alignment=TA_CENTER),
    "rotulo":     E("rotulo", fontName="Helvetica-Bold", fontSize=7.6, leading=10,
                    textColor=SUAVE, alignment=0),
    # Células de tabela: alinhadas à esquerda. Justificar em coluna estreita
    # estica os espaços e quebra a leitura de caminhos de arquivo.
    "cel":        E("cel", fontSize=8.8, leading=12.2, alignment=0),
    "cel_b":      E("cel_b", fontName="Helvetica-Bold", fontSize=8.8,
                    leading=12.2, alignment=0),
    "chip":       E("chip", fontName="Helvetica-Bold", fontSize=7.8, leading=10.5,
                    textColor=colors.white, alignment=TA_CENTER),
    # backColor + border direto no estilo (em vez de Table) para que blocos
    # longos possam QUEBRAR entre páginas — Preformatted dentro de Table não
    # divide e estoura o frame.
    "mono":       ParagraphStyle(name="mono", fontName="Courier", fontSize=7.4,
                                 leading=9.6, textColor=TINTA, backColor=FUNDO,
                                 borderColor=LINHA, borderWidth=0.5,
                                 borderPadding=6),
    "issue":      ParagraphStyle(name="issue", fontName="Courier", fontSize=7.0,
                                 leading=9.2, textColor=TINTA, backColor=FUNDO,
                                 borderColor=LINHA, borderWidth=0.5,
                                 borderPadding=7),
}


def chip(sev):
    """Etiqueta colorida de severidade, como tabela de uma célula."""
    t = Table([[Paragraph(ROTULO[sev], ST["chip"])]], colWidths=[62])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COR[sev]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def _xml(texto):
    """Escapa o código para o parser do XPreformatted (que aceita marcação)."""
    return (texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def bloco_codigo(codigo, estilo="mono"):
    """Trecho monoespaçado com fundo e borda, que quebra entre páginas.

    XPreformatted (e não Preformatted) porque só ele desenha backColor/borda —
    Preformatted sobrescreve draw() e ignora o estilo. Em troca ele interpreta
    marcação, daí o escape em _xml().
    """
    return XPreformatted(_xml(codigo.rstrip()), ST[estilo])


# --------------------------------------------------------------------------
# Cabeçalho / rodapé
# --------------------------------------------------------------------------

TITULO_CURTO = f"Relatório de Auditoria de Segurança — {PROJETO}"


def _rodape(canv, doc, com_cabecalho=True):
    canv.saveState()
    if com_cabecalho:
        canv.setFont("Helvetica", 7.6)
        canv.setFillColor(SUAVE)
        canv.drawString(2 * cm, A4[1] - 1.28 * cm, TITULO_CURTO)
        canv.drawRightString(A4[0] - 2 * cm, A4[1] - 1.28 * cm, DATA)
        canv.setStrokeColor(LINHA)
        canv.setLineWidth(0.5)
        canv.line(2 * cm, A4[1] - 1.48 * cm, A4[0] - 2 * cm, A4[1] - 1.48 * cm)

    canv.setStrokeColor(LINHA)
    canv.setLineWidth(0.5)
    canv.line(2 * cm, 1.55 * cm, A4[0] - 2 * cm, 1.55 * cm)
    canv.setFont("Helvetica", 7.6)
    canv.setFillColor(SUAVE)
    canv.drawString(2 * cm, 1.12 * cm, "Documento confidencial — uso interno")
    canv.drawRightString(A4[0] - 2 * cm, 1.12 * cm, f"Página {doc.page}")
    canv.restoreState()


def capa_bg(canv, doc):
    canv.saveState()
    canv.setFillColor(MARCA)
    canv.rect(0, A4[1] - 1.1 * cm, A4[0], 1.1 * cm, stroke=0, fill=1)
    canv.setFillColor(SUAVE)
    canv.setFont("Helvetica", 7.6)
    canv.drawCentredString(A4[0] / 2, 1.12 * cm,
                           "Documento confidencial — uso interno")
    canv.restoreState()


# --------------------------------------------------------------------------
# Seções
# --------------------------------------------------------------------------

def secao_capa():
    f = [Spacer(1, 3.6 * cm),
         Paragraph("Relatório de Auditoria de Segurança", ST["capa_t"]),
         Paragraph(PROJETO, ST["capa_t"]),
         Spacer(1, 0.5 * cm),
         Paragraph("Aplicativo de monitoramento de saúde para idosos<br/>"
                   "React Native · Expo · tRPC · Drizzle/MySQL", ST["capa_s"]),
         Spacer(1, 1.1 * cm)]

    linha = Table([[""]], colWidths=[5 * cm], rowHeights=[2.2])
    linha.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MARCA)]))
    linha.hAlign = "CENTER"
    f += [linha, Spacer(1, 1.0 * cm)]

    resumo = Table(
        [[Paragraph("Data", ST["rotulo"]), Paragraph(DATA, ST["cel"])],
         [Paragraph("Escopo", ST["rotulo"]),
          Paragraph("Backend completo (server/, drizzle/, shared/), aplicativo "
                    "(app/, lib/, components/, hooks/, context/), configuração de "
                    "build e deploy (app.config.ts, eas.json, .github/workflows/) e "
                    "histórico do Git.", ST["cel"])],
         [Paragraph("Revisão", ST["rotulo"]),
          Paragraph(f"branch <font face=\"Courier\">{BRANCH}</font>, commit "
                    f"<font face=\"Courier\">{COMMIT}</font>", ST["cel"])],
         [Paragraph("Cobertura", ST["rotulo"]),
          Paragraph("30 procedimentos tRPC e 20 rotas Express — a totalidade dos "
                    "handlers do servidor, lidos um a um.", ST["cel"])],
         [Paragraph("Resultado", ST["rotulo"]),
          Paragraph("<b>5 achados</b> (2 médios, 3 baixos) e 1 observação "
                    "informativa. Nenhum achado crítico ou alto.", ST["cel"])]],
        colWidths=[2.6 * cm, 11.4 * cm])
    resumo.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
    ]))
    resumo.hAlign = "CENTER"
    f += [resumo, Spacer(1, 0.9 * cm)]

    f.append(Paragraph("Nota metodológica", ST["h3"]))
    f.append(Paragraph(
        "As cinco categorias pedidas foram traduzidas para os mecanismos reais desta pilha antes "
        "da varredura. <b>(1) Banco sem tranca:</b> o projeto não usa Supabase nem RLS — o "
        "isolamento é feito por filtro manual sobre a coluna <font face=\"Courier\">openId</font> "
        "em cada consulta Drizzle, com o valor vindo sempre de "
        "<font face=\"Courier\">ctx.user.openId</font>; a auditoria verificou cada consulta de "
        "listagem, agregação e exportação. <b>(2) Permissão no navegador:</b> não há navegador — "
        "o cliente é React Native; cada gate de <font face=\"Courier\">userType</font> e de "
        "assinatura no aplicativo foi cruzado com o procedimento tRPC correspondente. "
        "<b>(3) IDOR:</b> todos os 50 handlers foram percorridos em busca de objeto localizado por "
        "identificador do cliente sem cruzamento com o dono. <b>(4) Chaves expostas:</b> varredura "
        "de código, configs, workflows, eas.json, scripts e histórico do Git, com atenção a "
        "valores padrão que viram segredo real. <b>(5) Inputs sem tratamento:</b> sem DOM, os "
        "equivalentes são a geração de HTML para <font face=\"Courier\">expo-print</font>, a "
        "landing HTML do servidor, os corpos de e-mail e as URLs entregues a "
        "<font face=\"Courier\">Linking.openURL</font> e ao WhatsApp. Somente achados confirmados "
        "no código foram reportados; onde a exploração depende de condições, elas estão descritas "
        "em cada ficha.", ST["corpo"]))
    return f


def secao_resumo(g_sev, g_cat):
    f = [Paragraph("Resumo executivo", ST["h1"])]

    ordem = ["critica", "alta", "media", "baixa", "informativa"]
    cont = {s: sum(1 for a in ACHADOS if a["sev"] == s) for s in ordem}
    cabec = [Paragraph(ROTULO[s], ST["chip"]) for s in ordem]
    nums = [Paragraph(f'<font size="17"><b>{cont[s]}</b></font>', ST["cel"]) for s in ordem]

    placar = Table([cabec, nums], colWidths=[3.4 * cm] * 5, rowHeights=[15, 32])
    est = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
           ("ALIGN", (0, 0), (-1, -1), "CENTER"),
           ("TOPPADDING", (0, 0), (-1, 0), 3.5),
           ("BOTTOMPADDING", (0, 0), (-1, 0), 3.5),
           ("BACKGROUND", (0, 1), (-1, 1), colors.white),
           ("BOX", (0, 1), (-1, 1), 0.5, LINHA),
           ("INNERGRID", (0, 1), (-1, 1), 0.5, LINHA)]
    for i, s in enumerate(ordem):
        est.append(("BACKGROUND", (i, 0), (i, 0), COR[s]))
    placar.setStyle(TableStyle(est))
    f += [placar, Spacer(1, 0.42 * cm)]

    f.append(Paragraph(
        "O backend do Vigora chega a esta auditoria em bom estado. O isolamento por conta é "
        "consistente e verificável em todos os 30 procedimentos tRPC, o acesso do cuidador aos "
        "dados da pessoa monitorada é derivado no servidor a partir do vínculo ativo, e as "
        "primitivas de autenticação — scrypt, códigos de uso único com teto de tentativas, "
        "convites com CSPRNG e resgate atômico — estão bem escolhidas e bem aplicadas. "
        "<b>Não foi encontrado nenhum achado crítico ou alto, nem qualquer segredo embutido no "
        "código ou no histórico do Git.</b>", ST["corpo_c"]))
    f.append(Paragraph(
        "Os cinco achados compartilham uma raiz: <b>exceções pontuais a padrões que o próprio "
        "projeto já aplica corretamente em outro lugar</b>. Um handler destrutivo sem verificação "
        "de posse, num backend onde todos os outros verificam (V-01); um campo que alimenta a "
        "mensagem de WhatsApp sem validação, enquanto o campo gêmeo é validado com "
        "<font face=\"Courier\">.url()</font> exatamente contra essa ameaça (V-02); um gerador de "
        "HTML sem escape ao lado de um irmão que documenta ter corrigido esse mesmo bug (V-03). "
        "Nenhum exige rearquitetura — todos são correções pequenas e localizadas.", ST["corpo_c"]))

    f.append(Paragraph("Achados por severidade", ST["h2"]))
    img1 = Image(g_sev)
    img1._restrictSize(7.9 * cm, 6.2 * cm)
    img2 = Image(g_cat)
    img2._restrictSize(8.8 * cm, 6.2 * cm)
    par = Table([[img1, img2]], colWidths=[8.2 * cm, 8.8 * cm])
    par.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                             ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    f.append(par)
    f.append(Paragraph(
        "<i>À esquerda, distribuição por severidade. À direita, achados por categoria auditada — "
        "a cor de cada barra indica a severidade mais alta encontrada naquela categoria. A "
        "categoria 2 (permissão definida no cliente) fechou sem achados: todo gate de papel do "
        "aplicativo tem verificação equivalente no servidor.</i>", ST["rotulo"]))
    return f


def secao_fortes_fracos():
    f = [Spacer(1, 0.55 * cm), Paragraph("Pontos fortes", ST["h1"]),
         Paragraph("O que foi verificado e está correto. Esta seção é também a prova de cobertura "
                   "da auditoria: cada item cita o arquivo e as linhas inspecionadas.",
                   ST["corpo_c"]), Spacer(1, 0.18 * cm)]

    for titulo, texto in PONTOS_FORTES:
        marca = Table([[""]], colWidths=[3], rowHeights=[1])
        marca.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), COR["forte"])]))
        linha = Table(
            [[marca, Paragraph(f"<b><font color='#059669'>✓</font>  {titulo}</b><br/>"
                               f"<font size='9'>{texto}</font>", ST["corpo"])]],
            colWidths=[0.12 * cm, 16.6 * cm])
        linha.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (0, 0), COR["forte"]),
            ("LEFTPADDING", (1, 0), (1, 0), 9),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))
        f.append(linha)

    f += [Spacer(1, 0.3 * cm), Paragraph("Pontos fracos — os riscos centrais", ST["h1"])]
    for titulo, texto in PONTOS_FRACOS:
        marca = Table([[""]], colWidths=[3], rowHeights=[1])
        linha = Table(
            [[marca, Paragraph(f"<b>{titulo}</b><br/><font size='9'>{texto}</font>",
                               ST["corpo"])]],
            colWidths=[0.12 * cm, 16.6 * cm])
        linha.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (0, 0), COR["media"]),
            ("LEFTPADDING", (1, 0), (1, 0), 9),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))
        f.append(linha)
    return f


def secao_tabela():
    f = [PageBreak(), Paragraph("Achados — visão consolidada", ST["h1"]),
         Paragraph("Ordenados por severidade. As fichas completas, com evidência de código, vêm "
                   "logo em seguida.", ST["corpo_c"]), Spacer(1, 0.2 * cm)]

    cab = [Paragraph("<font color='white'><b>SEVERIDADE</b></font>", ST["cel_b"]),
           Paragraph("<font color='white'><b>ARQUIVO:LINHA</b></font>", ST["cel_b"]),
           Paragraph("<font color='white'><b>DESCRIÇÃO</b></font>", ST["cel_b"])]
    dados = [cab]
    prio = {"critica": 0, "alta": 1, "media": 2, "baixa": 3, "informativa": 4}
    ordenados = sorted(ACHADOS, key=lambda a: prio[a["sev"]])
    for a in ordenados:
        dados.append([
            chip(a["sev"]),
            Paragraph(f"<font face='Courier' size='7.6'>{a['arquivo']}<br/>:{a['linhas']}</font>",
                      ST["cel"]),
            Paragraph(f"<b>{a['id']}</b> — {a['titulo']}", ST["cel"]),
        ])

    t = Table(dados, colWidths=[2.7 * cm, 5.4 * cm, 8.9 * cm], repeatRows=1)
    est = [("BACKGROUND", (0, 0), (-1, 0), MARCA),
           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
           ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
           ("TOPPADDING", (0, 0), (-1, -1), 5),
           ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
           ("LEFTPADDING", (0, 0), (-1, -1), 5),
           ("RIGHTPADDING", (0, 0), (-1, -1), 5)]
    for i in range(1, len(dados)):
        if i % 2 == 0:
            est.append(("BACKGROUND", (1, i), (-1, i), colors.HexColor("#FAFAF8")))
    t.setStyle(TableStyle(est))
    f.append(t)
    return f


def secao_fichas():
    f = [PageBreak(), Paragraph("Achados detalhados", ST["h1"])]
    rot_cat = {k: completo for k, _, completo in CATEGORIAS}

    prio = {"critica": 0, "alta": 1, "media": 2, "baixa": 3, "informativa": 4}
    for a in sorted(ACHADOS, key=lambda x: prio[x["sev"]]):
        blocos = []

        cab = Table([[chip(a["sev"]),
                      Paragraph(f"<b>{a['id']}</b> — {a['titulo']}",
                                E("t", fontName="Helvetica-Bold", fontSize=11,
                                  leading=14.5, textColor=MARCA, alignment=0))]],
                    colWidths=[2.2 * cm, 14.8 * cm])
        cab.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                 ("LEFTPADDING", (0, 0), (0, 0), 0),
                                 ("LEFTPADDING", (1, 0), (1, 0), 6),
                                 ("TOPPADDING", (0, 0), (-1, -1), 0),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        blocos.append(cab)
        blocos.append(Paragraph(
            f"<font size='8' color='#687076'>Categoria {rot_cat[a['cat']]} &nbsp;·&nbsp; "
            f"<font face='Courier'>{a['arquivo']}:{a['linhas']}</font></font>", ST["rotulo"]))
        blocos.append(Spacer(1, 0.22 * cm))
        blocos.append(Paragraph("Evidência", ST["h3"]))
        blocos.append(bloco_codigo(a["codigo"]))

        for rot, chave in (("Por que é explorável", "porque"),
                           ("Impacto", "impacto"),
                           ("Condições de explorabilidade", "condicao"),
                           ("Correção sugerida", "correcao")):
            blocos.append(Paragraph(rot, ST["h3"]))
            blocos.append(Paragraph(a[chave], ST["corpo"]))

        blocos.append(Spacer(1, 0.42 * cm))
        sep = Table([[""]], colWidths=[17 * cm], rowHeights=[0.6])
        sep.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LINHA)]))
        blocos.append(sep)
        blocos.append(Spacer(1, 0.42 * cm))

        # Mantém cabeçalho + evidência juntos; o resto pode fluir.
        f.append(KeepTogether(blocos[:5]))
        f.extend(blocos[5:])
    return f


def secao_recomendacoes():
    f = [PageBreak(), Paragraph("Recomendações priorizadas", ST["h1"]),
         Paragraph("P1 é o que deve entrar antes do lançamento; P2 e P3 no ciclo seguinte; P4 e P5 "
                   "são endurecimento e processo.", ST["corpo_c"]), Spacer(1, 0.2 * cm)]

    dados = [[Paragraph("<font color='white'><b>#</b></font>", ST["cel_b"]),
              Paragraph("<font color='white'><b>AÇÃO</b></font>", ST["cel_b"]),
              Paragraph("<font color='white'><b>DETALHE</b></font>", ST["cel_b"])]]
    for p, sev, titulo, texto in RECOMENDACOES:
        dados.append([
            Paragraph(f"<font color='white'><b>{p}</b></font>", ST["chip"]),
            Paragraph(f"<b>{titulo}</b>", ST["cel"]),
            Paragraph(texto, ST["cel"]),
        ])

    t = Table(dados, colWidths=[1.3 * cm, 5.0 * cm, 10.7 * cm], repeatRows=1)
    est = [("BACKGROUND", (0, 0), (-1, 0), MARCA),
           ("VALIGN", (0, 0), (-1, -1), "TOP"),
           ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
           ("TOPPADDING", (0, 0), (-1, -1), 6),
           ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
           ("LEFTPADDING", (0, 0), (-1, -1), 5),
           ("RIGHTPADDING", (0, 0), (-1, -1), 5),
           ("ALIGN", (0, 0), (0, -1), "CENTER"),
           ("VALIGN", (0, 1), (0, -1), "MIDDLE")]
    for i, (_, sev, _, _) in enumerate(RECOMENDACOES, start=1):
        est.append(("BACKGROUND", (0, i), (0, i), COR[sev]))
    t.setStyle(TableStyle(est))
    f.append(t)
    return f


# --------------------------------------------------------------------------
# Issues para o GitHub
# --------------------------------------------------------------------------

ISSUES = [
    ("V-01", """# [Segurança] push.unregister apaga token de push sem verificar posse

**Labels:** `security`, `severity:media`, `backend`

## Problema

`push.unregister` recebe um token de push do cliente e apaga a linha
correspondente sem cruzar com `ctx.user.openId`. O `protectedProcedure`
garante apenas que existe uma sessão valida - nao que o token pertence a
quem chama. E o unico handler do backend que localiza um objeto por
identificador vindo do cliente e o remove sem verificacao de dono.

O comportamento e deliberado (resolve o caso do aparelho que registrou como
cuidador e depois entrou como monitorado) e esta travado por teste, entao a
correcao precisa preservar esse caso de uso.

## Evidencia

server/routers-push.ts:91-96

    unregister: protectedProcedure
      .input(z.object({ token: z.string().min(1).max(255) }))
      .mutation(async ({ input }) => {
        await deletePushToken(input.token);   // sem ctx.user.openId
        return { success: true } as const;
      }),

server/db-push.ts:42-46

    export async function deletePushToken(token: string): Promise<void> {
      const db = await getDb();
      if (!db) return;
      await db.delete(pushTokens).where(eq(pushTokens.token, token));
    }

tests/push-unregister.test.ts:80-93 documenta e trava o comportamento atual
("apaga a linha mesmo quando ela pertence a outra conta").

## Impacto

Apagar o token do cuidador desarma silenciosamente o canal de alerta em
tempo real do dead man's switch. `pushMissedAlarmToCaregivers`,
`sosAlertCaregivers` e os Passos 3 e 4 do monitoring-job passam a resolver
zero tokens e saem sem notificar ninguem. O cuidador so perceberia abrindo a
tela de Alertas manualmente.

Explorabilidade: exige conhecer o valor do Expo push token da vitima.
Nenhuma rota devolve tokens ao cliente, entao nao ha enumeracao remota - o
vetor realista e vazamento por log, aparelho compartilhado ou backup.

## Sugestao de correcao

Apagar por `(token, openId)` quando a linha pertence a quem chama. Para o
caso legitimo de troca de conta no mesmo aparelho, exigir prova de posse do
dispositivo (aceitar o par `token` + `deviceId`), ou deixar a limpeza da
linha orfa para o `upsertPushToken` do proximo registro, que ja reatribui o
openId da linha via onDuplicateKeyUpdate.

No minimo: limite de taxa por chamador e log da remocao cruzada.

## Criterios de aceite

- [ ] `push.unregister` nao apaga linha de outra conta sem prova de posse do
      aparelho
- [ ] O caso "aparelho trocou de conta" continua funcionando (o token para de
      receber push apos o logout)
- [ ] tests/push-unregister.test.ts atualizado: o caso "apaga a linha mesmo
      quando ela pertence a outra conta" passa a exigir a prova de posse
- [ ] Novo teste: chamador autenticado sem prova de posse nao consegue apagar
      token de terceiro
- [ ] `pnpm test` e `pnpm check` passam"""),

    ("V-02", """# [Segurança] lastLocation sem validacao entra na mensagem de WhatsApp

**Labels:** `security`, `severity:media`, `backend`, `lgpd`

## Problema

`monitoring.heartbeat` aceita `lastLocation` como string livre, sem formato
nem tamanho. O valor e gravado em `account_liveness.lastLocation` e depois
interpolado numa URL que compoe o corpo da mensagem enviada pelo numero do
WhatsApp Business do Vigora, com `preview_url: true`.

O `split(",")` nao valida que as partes sejam coordenadas: qualquer texto
contendo uma virgula produz um `locationUrl` arbitrario dentro de uma
mensagem que sai sob remetente confiavel.

O caminho gemeo ja se defende disso: em `whatsapp.sendEmergencyAlert` o
campo `locationUrl` e validado com `.url()`, e o comentario diz
explicitamente que e "para que texto arbitrario/phishing nao seja injetado no
corpo templado do WhatsApp sob o remetente confiavel Vigora". A mesma defesa
nao existe nesta rota.

## Evidencia

server/routers-monitoring.ts:203 (entrada)

    lastLocation: z.string().optional(),

server/db-monitoring.ts:41-43 (persistencia)

    const locationFields = meta?.lastLocation
      ? { lastLocation: meta.lastLocation, lastLocationAt: now }
      : {};

server/monitoring-job.ts:470-476 (uso)

    const liveness = await getAccountLiveness(account.openId);
    if (liveness?.lastLocation) {
      const [lat, lng] = liveness.lastLocation.split(",");
      if (lat && lng) {
        locationUrl = `https://maps.google.com/?q=${lat},${lng}`;
      }
    }

server/monitoring-job.ts:228-231 (envio)

    if (locationUrl) {
      message += `\\n\\nUltima localizacao registrada:\\n${locationUrl}`;
    }

Compare com server/routers.ts:383-385, o caminho ja protegido:

    // .url() so arbitrary text/phishing can't be injected into the
    // templated WhatsApp body under the trusted "Vigora" sender.
    locationUrl: z.string().url().max(500).optional(),

## Impacto

Injecao de conteudo em mensagem enviada sob remetente verificado a
familiares idosos, num momento de panico ("alerta serio"). Alta taxa de
sucesso para phishing. Se abusado em escala, coloca em risco a reputacao do
numero do WhatsApp Business - cujo banimento pela Meta derrubaria a
escalacao de todos os usuarios.

Explorabilidade: exige controle de uma sessao valida da conta monitorada
(aparelho, sessao roubada ou cliente modificado). A coluna e varchar(64), o
que limita o payload; conforme o sql_mode do MySQL o valor e truncado ou
rejeitado.

## Sugestao de correcao

Validar no limite tRPC:

    lastLocation: z
      .string()
      .regex(/^-?\\d{1,3}(\\.\\d+)?,-?\\d{1,3}(\\.\\d+)?$/)
      .max(64)
      .optional(),

E, em monitoring-job.ts, converter cada parte com `Number()`, montar a URL
apenas se ambas forem finitas e dentro das faixas de latitude/longitude, e
aplicar `encodeURIComponent` na concatenacao.

## Criterios de aceite

- [ ] `monitoring.heartbeat` rejeita `lastLocation` que nao seja um par
      "lat,lng" numerico
- [ ] `monitoring-job` nao monta `locationUrl` a partir de valor invalido
      (defesa em profundidade para linhas ja gravadas no banco)
- [ ] Teste: heartbeat com `lastLocation` contendo texto/URL e recusado
- [ ] Teste: valor invalido ja persistido nao aparece na mensagem gerada por
      `buildWarningMessage`
- [ ] `pnpm test` e `pnpm check` passam"""),

    ("V-03", """# [Segurança] PDF da ficha medica monta HTML sem escapar campos do usuario

**Labels:** `security`, `severity:baixa`, `frontend`

## Problema

`lib/pdf-utils-v2.ts` concatena oito campos de texto livre da anamnese
diretamente no HTML que o `expo-print` renderiza - no Android, um WebView de
impressao. Nao ha nenhuma chamada de escape no arquivo.

O modulo irmao `lib/health-report-generator.ts` ja corrigiu exatamente esta
classe de bug: define `esc()` e o cabecalho do arquivo documenta que "a
versao anterior concatenava input cru do usuario no HTML, permitindo injecao
trivial de HTML/script". O pdf-utils-v2 nunca recebeu esse tratamento.

## Evidencia

lib/pdf-utils-v2.ts - linhas 89, 93, 111, 115, 119, 127, 131, 135

    <div class="field-value">${anamnesis.fullName || 'Nao informado'}</div>
    <div class="field-value">${formatDate(anamnesis.birthDate)}</div>
    <div class="field-value">${anamnesis.allergies || 'Nenhuma informada'}</div>
    <div class="field-value">${anamnesis.medications || 'Nenhum informado'}</div>
    <div class="field-value">${anamnesis.diseases || 'Nenhuma informada'}</div>
    <div class="field-value">${anamnesis.susNumber || 'Nao informado'}</div>
    <div class="field-value">${anamnesis.healthPlanProvider || 'Nao informado'}</div>
    <div class="field-value">${anamnesis.healthPlanNumber || 'Nao informado'}</div>

lib/pdf-utils-v2.ts:158 - o HTML vai para o renderizador

    const { uri } = await Print.printToFileAsync({ html: htmlContent, ... });

lib/health-report-generator.ts:28-36 - o escape que ja existe no projeto

    export function esc(value: unknown): string {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

## Impacto

Injecao de HTML/CSS num documento medico compartilhado externamente via
`Sharing.shareAsync`: o PDF entregue ao profissional de saude pode ter campos
ocultados, valores sobrepostos ou texto forjado. No WebView de impressao do
Android ha ainda execucao de script no contexto da renderizacao.

Explorabilidade: a anamnese renderizada e a da propria conta
(app/(tabs)/anamnesis.tsx:126 passa o formulario local), entao e
autoinjecao. Nenhuma tela de cuidador chama este gerador - nao ha caminho
entre contas. Vale como defeito de consistencia e defesa em profundidade.

## Sugestao de correcao

Importar `esc` de `@/lib/health-report-generator` e aplicar nos oito pontos
de interpolacao, incluindo as partes usadas por `formatDate`.

## Criterios de aceite

- [ ] Os oito campos passam por `esc()` antes de entrar no HTML
- [ ] `formatDate` nao devolve fragmento nao escapado
- [ ] Teste: anamnese com `<script>alert(1)</script>` em `allergies` gera HTML
      sem a tag `<script>`
- [ ] O PDF continua sendo gerado e compartilhado normalmente
- [ ] `pnpm test` e `pnpm check` passam"""),

    ("V-04", """# [Segurança] JWT_SECRET com fallback vazio e trava presa a NODE_ENV

**Labels:** `security`, `severity:baixa`, `backend`, `infra`

## Problema

`JWT_SECRET` cai para string vazia quando a variavel nao esta definida. Com
ela, os JWTs de sessao sao assinados E verificados com uma chave HMAC vazia -
forja de token para qualquer `openId`.

A validacao de startup `assertRequiredSecrets` existe e esta bem escrita, mas
decide pela string `NODE_ENV` em vez de decidir pela presenca do segredo.
Qualquer desvio ("Production", "prod", ou variavel ausente porque um Start
Command customizado no painel do Railway substituiu o script `start` - que e
quem define NODE_ENV=production) faz o servidor subir em modo permissivo com
apenas um aviso no log.

Nao ha exploracao confirmada na configuracao atual: o script `start` define
NODE_ENV=production e nao ha Dockerfile, Procfile, railway.json ou
nixpacks.toml no repositorio que contradiga isso. O problema e que a trava
nao e auto-suficiente.

## Evidencia

server/_core/env.ts:9

    cookieSecret: process.env.JWT_SECRET ?? "",

server/_core/sdk.ts:50-53

    function getSessionSecret() {
      const secret = process.env.JWT_SECRET ?? "";
      return new TextEncoder().encode(secret);
    }

server/_core/env.ts:99-110

    const isProduction = env.NODE_ENV === "production";
    const secret = env.JWT_SECRET ?? "";
    if (!isProduction) {
      if (secret.length === 0) { console.warn(...); }
      return;                    // segue com HMAC de chave vazia
    }

package.json:10 - a unica coisa que garante NODE_ENV em producao

    "start": "NODE_ENV=production node dist/index.js",

## Impacto

No cenario em que a condicao se materializa o impacto e total: forja de
sessao para qualquer conta, com acesso a metricas de saude, anamnese,
contatos de emergencia e localizacao. Nada mais no sistema barra um JWT
bem-formado.

## Sugestao de correcao

Inverter a decisao: exigir o segredo sempre que ele for usado e permitir o
modo permissivo apenas mediante opcao explicita de desenvolvimento
(`ALLOW_INSECURE_DEV_SECRET=1`), nunca por inferencia de NODE_ENV.

Alternativa minima: fazer `getSessionSecret()` lancar quando o segredo e
vazio, de modo que a falha ocorra na primeira operacao de sessao em vez de
aceitar tokens forjados.

Estender a checagem a `DATABASE_URL` fecha a mesma lacuna no banco.

## Criterios de aceite

- [ ] Servidor recusa iniciar sem `JWT_SECRET`, independente de `NODE_ENV`
- [ ] Modo permissivo de desenvolvimento so e ativado por variavel explicita
- [ ] `getSessionSecret()` lanca em vez de devolver chave vazia
- [ ] `assertRequiredSecrets` tambem valida `DATABASE_URL`
- [ ] Teste: com JWT_SECRET vazio e NODE_ENV="dev", o boot falha (ou a
      assinatura lanca)
- [ ] `pnpm test` e `pnpm check` passam"""),

    ("V-05", """# [Segurança] Allowlist de destinatarios compara so 8 digitos finais

**Labels:** `security`, `severity:baixa`, `backend`

## Problema

`isAllowedRecipient` existe para garantir que `whatsapp.sendEmergencyAlert`
nao tenha "destinos arbitrarios". A comparacao usa apenas os 8 digitos
finais, descartando DDI, DDD e o nono digito.

Um contato salvo como `(11) 9 8888-7777` autoriza envio para
`(51) 8888-7777`, `(21) 9 8888-7777` e todas as demais variantes de
DDD/prefixo - cerca de uma centena de numeros reais distintos por contato
cadastrado, em vez de um. O escopo efetivo do controle e bem mais largo que o
documentado no proprio comentario da rota.

## Evidencia

server/routers.ts:33-44

    function isAllowedRecipient(claimed, stored): boolean {
      const claimedDigits = normalizeDigits(claimed.phone);
      if (claimedDigits.length < 8) return false;
      const claimedTail = claimedDigits.slice(-8);      // so o sufixo
      return stored.some((c) => {
        const tail = normalizeDigits(c.phone).slice(-8);
        return tail.length >= 8 && tail === claimedTail;
      });
    }

server/routers.ts:365-368 - a garantia declarada

    // SECURITY: Requires authentication and verifies that:
    //   1. Every phone number in `contacts` matches a stored emergency
    //      contact for ctx.user's account (no arbitrary destinations)

## Impacto

Envio de mensagem sob o remetente confiavel do Vigora para numeros que o
titular nunca cadastrou. O teto de abuso e contido pelo limite de taxa por
conta (5 mensagens / 60s) e pela necessidade de colisao no sufixo, mas a
garantia de "apenas contatos do titular" nao se sustenta como escrita.

Explorabilidade: requer sessao autenticada. O ganho real para um atacante e
limitado, porque a lista de contatos e gravada pelo proprio titular via
`userData.put` - quem controla a conta ja pode cadastrar o numero que quiser.
O achado importa como divergencia entre a propriedade de seguranca declarada
e a implementada, e como enfraquecimento do controle diante de um cliente
comprometido.

## Sugestao de correcao

Comparar o numero normalizado por completo, reaproveitando `normalizeBrPhone`
de server/phone-auth.ts:41-59 nos dois lados antes de comparar. Se a
tolerancia a variacoes de formato precisar ser mantida, tratar
explicitamente o nono digito em vez de truncar.

## Criterios de aceite

- [ ] `isAllowedRecipient` compara telefone normalizado completo (com DDI)
- [ ] Teste: contato salvo em DDD 11 nao autoriza envio para o mesmo sufixo em
      DDD 51
- [ ] Teste: variacoes legitimas de formato do MESMO numero continuam
      autorizadas ("(11) 99999-9999", "5511999999999", "+55 11 9 9999-9999")
- [ ] O comentario de SECURITY da rota descreve o comportamento real
- [ ] `pnpm test` e `pnpm check` passam"""),

    ("V-06", """# [Segurança] Remover express.urlencoded de uma API exclusivamente JSON

**Labels:** `security`, `severity:informativa`, `backend`, `hardening`

## Problema

O servidor registra um parser de `application/x-www-form-urlencoded` que
nenhuma rota consome: as dez rotas de `/api/auth` fazem
`safeParse(req.body)` sobre JSON e o restante passa pelo adaptador tRPC.

O parser aumenta a superficie para requisicoes "simples" (sem preflight
CORS), que sao as unicas que atravessariam a politica de origem com o cookie
de sessao `SameSite=none` anexado.

## Evidencia

server/_core/index.ts:45-46

    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ limit: "1mb", extended: true }));  // sem uso

## Impacto

Baixo, e verificado empiricamente. Uma prova de conceito local (express +
@trpc/server nas versoes do projeto) confirmou que o tRPC v11 responde
`415 Unsupported Media Type` tanto para `application/x-www-form-urlencoded`
quanto para `text/plain`, e a mutacao nao executa:

    urlencoded  -> 415 | mutation executou? false
    text/plain  -> 415 | mutation executou? false

Nao ha CSRF contra os procedimentos tRPC. O residuo se limita a rotas express
simples sem efeito sensivel - `POST /api/auth/logout`, que apenas limparia o
cookie da vitima.

Registrado como reducao de superficie, nao como vulnerabilidade explorada.

## Sugestao de correcao

Remover a linha 46. A API e JSON de ponta a ponta.

## Criterios de aceite

- [ ] `express.urlencoded` removido de server/_core/index.ts
- [ ] Todas as rotas de `/api/auth` continuam funcionando (JSON)
- [ ] `pnpm test` e `pnpm check` passam"""),
]


def secao_issues():
    f = [PageBreak(), Paragraph("Issues para o GitHub", ST["h1"]),
         Paragraph("Texto completo de cada issue, em Markdown, pronto para copiar e colar. Cada "
                   "bloco esta delimitado por <font face=\"Courier\">--- ISSUE n ---</font> e "
                   "<font face=\"Courier\">--- FIM ISSUE n ---</font>. Achados triviais "
                   "relacionados foram mantidos juntos quando compartilham o mesmo tema, para não "
                   "gerar ruído de issues.", ST["corpo_c"]), Spacer(1, 0.2 * cm)]

    for n, (ident, corpo) in enumerate(ISSUES, start=1):
        marcador = Paragraph(
            f"<font face='Courier' size='8.4'><b>--- ISSUE {n} ({ident}) ---</b></font>",
            ST["rotulo"])
        fim = Paragraph(
            f"<font face='Courier' size='8.4'><b>--- FIM ISSUE {n} ---</b></font>",
            ST["rotulo"])

        caixa = bloco_codigo(corpo, estilo="issue")
        f += [marcador, Spacer(1, 0.30 * cm), caixa, Spacer(1, 0.26 * cm), fim]
        # Sem respiro depois do último: um Spacer sobrando cria página em branco.
        if n < len(ISSUES):
            f.append(Spacer(1, 0.6 * cm))
    return f


# --------------------------------------------------------------------------
# Montagem
# --------------------------------------------------------------------------

def main():
    g_sev, g_cat = gerar_graficos()

    doc = BaseDocTemplate(
        SAIDA, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title=TITULO_CURTO, author="Auditoria de Segurança",
        subject=f"Auditoria de segurança do aplicativo {PROJETO}",
    )

    quadro_capa = Frame(2 * cm, 2 * cm, A4[0] - 4 * cm, A4[1] - 4 * cm, id="capa")
    quadro = Frame(2 * cm, 2 * cm, A4[0] - 4 * cm, A4[1] - 4.2 * cm, id="corpo")

    doc.addPageTemplates([
        PageTemplate(id="capa", frames=[quadro_capa], onPage=capa_bg),
        PageTemplate(id="corpo", frames=[quadro], onPage=_rodape),
    ])

    hist = []
    hist += secao_capa()
    hist.append(NextPageTemplate("corpo"))
    hist.append(PageBreak())
    hist += secao_resumo(g_sev, g_cat)
    hist += secao_fortes_fracos()
    hist += secao_tabela()
    hist += secao_fichas()
    hist += secao_recomendacoes()
    hist += secao_issues()

    doc.build(hist)
    print(f"PDF gerado: {SAIDA}")


if __name__ == "__main__":
    main()
