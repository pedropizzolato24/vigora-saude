# Regulatory and compliance launch readiness for Vigora

**Bottom line: Vigora can launch on App Store and Google Play without ANVISA registration, but LGPD compliance is materially heavier than the "small operator" regime allows.** ANVISA's own Q&A explicitly excludes medication reminders, manual health logging, medical record storage, and communication/SOS features from software-as-medical-device (SaMD) classification [anvisa](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas/perguntas-respostas-rdc-657-de-2022-v1-01-09-2022.pdf). However, because Vigora processes health data on elderly users, it falls into ANPD's "high-risk" treatment category — which strips out the simplified small-operator regime, makes DPO/Encarregado designation mandatory under Art. 41 LGPD, and requires a public privacy policy, formal incident response, and full record of processing activities [in.gov](https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-2-de-27-de-janeiro-de-2022-376562019). Marketing language must avoid clinical efficacy claims (CONAR), but CFM does not apply to a non-physician app. The dead man's switch is regulatorily fine in Brazil and has live precedents on both app stores (Snug Safety, My SOS Family). The realistic pre-launch blockers are LGPD documentation, store-submission metadata, and likely registering a CNPJ to avoid friction with Google Play's tightening health-app verification.

---

## 1. ANVISA / RDC 657/2022 — Vigora is not a medical device

**ANVISA itself has answered this question.** In the official Q&A accompanying RDC 657/2022, the agency directly addresses each of Vigora's feature categories. The answers are unusually clear for Brazilian regulatory practice and remove almost all ambiguity.

### What the regulation says

RDC 657/2022 Art. 2 defines software como dispositivo médico (SaMD) as software with one or more "medical indications" — meaning intended for "prevention, diagnosis, treatment, rehabilitation or contraception" — that performs these functions without being part of medical hardware . The regulation explicitly excludes (Art. 1, §2): wellness software, administrative/financial software, demographic data software, and software for storing/viewing electronic medical records.

Risk classes I–IV are determined by (1) information output (store/transmit → inform decision → diagnosis) × (2) condition severity [saudedigitalbrasil](https://saudedigitalbrasil.com.br/anvisa-atualiza-regras-para-regularizacao-de-dispositivos-medicos-no-brasil/). Vigora's features sit at the store/transmit end, paired with low-severity contexts.

### Feature-by-feature classification (from ANVISA's official Q&A)

| Vigora feature | ANVISA Q&A reference | Classification |
|---|---|---|
| Medication reminders/alarms | Question 7 — "agenda, alarme e manter um prontuário rudimentar… **não constitui um dispositivo médico passível de regularização**" | **Not SaMD** [anvisa](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas/perguntas-respostas-rdc-657-de-2022-v1-01-09-2022.pdf) |
| Manual BP / glucose / vital sign logging | Question 69 — "softwares com indicação de uso para construção de prontuário eletrônico, como **registro manual de sinais vitais, não se enquadram**" | **Not SaMD** [anvisa](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas/perguntas-respostas-rdc-657-de-2022-v1-01-09-2022.pdf) |
| PDF / document medical record storage | Question 44 — "softwares exclusivamente para registro de informações e visualização de prontuário eletrônico **não se enquadram**" | **Not SaMD** [anvisa](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas/perguntas-respostas-rdc-657-de-2022-v1-01-09-2022.pdf) |
| SOS / contact emergency contacts | Question 35 — communication-only functions ("transmitir prontuário e informações médicas sem processamento") are excluded | **Not SaMD** [anvisa](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas/perguntas-respostas-rdc-657-de-2022-v1-01-09-2022.pdf) |
| Dead man's switch / inactivity check-in | No specific Q&A — but framework analysis: pure notification function with no clinical interpretation | **Likely not SaMD** (inferred, single-source framework reading) |

### The bright line: storing/transmitting vs. evaluating/interpreting

ANVISA Q&A Question 11 draws the decisive distinction: software that *records* pain or symptoms "for future evaluation by a healthcare professional" is not SaMD; software that *performs periodic evaluation* of those symptoms is SaMD Class I [anvisa](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas/perguntas-respostas-rdc-657-de-2022-v1-01-09-2022.pdf). **This is the line Vigora must not cross.** Concrete examples of what would trigger SaMD classification:

- Auto-flagging "high blood pressure" or "low glucose" with a recommendation
- Scoring or grading user-entered values
- Drug interaction warnings driven by Vigora's own logic
- Algorithmic adherence "scores" or "risk levels"
- Any threshold-based alert that suggests a clinical decision

If Vigora confines itself to logging values, displaying them back as a graph or table, and reminding the user to take medication, it sits outside RDC 657/2022. Adding any rule that *interprets* a value crosses into Class I SaMD territory and triggers notificação (the simplified notification process for Class I/II — but still requires ANVISA filing).

### Enforcement risk if classification is wrong

Penalties under Lei 6.437/77 for marketing an unregistered medical device range R$2,000–R$75,000 (light), R$75,000–R$200,000 (serious), and R$200,000–R$1,500,000 (very serious), with doubling for recidivism, and possible product seizure or operational suspension [curitiba](https://saude.curitiba.pr.gov.br/vigilancia/sanitaria/leis/legislacao-federal.html). ANVISA has historically enforced against unregistered medical imaging software , but **no documented enforcement against consumer medication-reminder or health-logging apps was found**. The realistic risk is theoretical, not active — but a single feature creep beyond the wellness line could change that.

**Decision: Pedro can launch without ANVISA registration provided Vigora avoids any interpretive/evaluative health logic.** This is by far the cleanest of all the regulatory dimensions.

---

## 2. LGPD — the real compliance work

LGPD compliance is where most of the actual pre-launch effort belongs. Vigora cannot use Brazil's simplified small-operator regime, so the obligations sit at full strength.

### Why the small-operator exemption does not apply

ANPD's Resolução CD/ANPD nº 2/2022 created a simplified regime for "agentes de tratamento de pequeno porte." But Art. 4, II(d) defines treatment of "dados pessoais sensíveis… ou de idosos" as **high-risk**, which disqualifies an operator from the simplified rules entirely [in.gov](https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-2-de-27-de-janeiro-de-2022-376562019). Vigora processes both (health = sensitive under Art. 5, II [lgpd-brasil](https://lgpd-brasil.info/capitulo_02/artigo_11); users are 60+), so revenue size doesn't matter — the high-risk classification is triggered by data type alone.

**Consequence:** Pedro must comply with the full LGPD: DPO mandatory, full registry of processing operations (Art. 37), full incident response (Art. 48), full information security policy (Art. 47), and a possible RIPD/DPIA assessment (Art. 38) .

### The DPO (Encarregado) requirement

Art. 41 LGPD requires designation of an Encarregado. ANPD Resolução 18/2024 confirms the DPO can be a natural or legal person, internal or external [svxconsultoria](https://svxconsultoria.com.br/dpo-as-a-service-entenda-como-implementar-na-sua-empresa/). **Pedro can serve as his own DPO** — there's no explicit prohibition — but legal commentary notes the structural conflict of interest in a solo founder advising himself .

**The DPO's name and contact must be publicly disclosed in the privacy policy and on the website** (Art. 41, §1) [planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm). Internal-only documentation is insufficient.

Outsourced "DPO-as-a-service" runs **R$2,500–R$6,500/month** in Brazil [svxconsultoria](https://svxconsultoria.com.br/dpo-as-a-service-entenda-como-implementar-na-sua-empresa/) [lirolla](https://lirolla.com.br/dpo-para-empresas/) — likely too expensive for Pedro's 1–2 month runway. The pragmatic path is to **self-designate as DPO at launch**, publish a contact email, and revisit when revenue allows outsourcing.

### Sensitive-data consent flow

Art. 11, I LGPD requires explicit, specific, **highlighted** consent for sensitive data. The consent flow can't bundle health data into a generic "I accept terms" checkbox — it must be a separate, visually distinct affirmation that names health data specifically [juristas](https://juristas.com.br/modelos-de-documentos/modelo-termo-de-consentimento-para-o-tratamento-de-dados-pessoais-e-dados-pessoais-sensiveis-lgpd-aplicativo-de-saude-healthtech/).

Concrete pattern:
> ☐ Autorizo a Vigora a tratar **meus dados pessoais sensíveis de saúde** (medicações, pressão arterial, glicemia, documentos médicos) para as finalidades de: lembretes de medicação, registro de indicadores, armazenamento de prontuário e alertas de emergência aos contatos por mim designados.

### Elderly user accessibility obligations

LGPD Art. 55-J, XIX requires ANPD to ensure that data treatment for elderly persons is "simple, clear, accessible, and adequate to their understanding" per the Estatuto do Idoso [medicinasa](https://medicinasa.com.br/ilpis-lgpd/). Legal commentary specifies that this means information should account for "physical-motor, perceptual, sensory, intellectual and mental characteristics" of elderly users, potentially with audiovisual support .

For Vigora, this aligns with the UX work already on the canvas (16pt+ fonts, modo simplificado): the privacy policy itself needs a plain-language version, large fonts, and ideally an in-app summary the elder can be walked through by an adult child.

### Data subject rights

Art. 18 LGPD grants users rights to access, correction, anonymization, **portability**, and **elimination**. Practical requirements:

- **Portability (Art. 18, V):** Vigora must export user data in a structured, machine-readable format (JSON or CSV) within 15 days of request [blog.idp](https://blog.idp.edu.br/direito-digital/passo-a-passo-para-elaborar-um-termo-de-consentimento/). Medication log, glucose/BP readings, and uploaded documents in original format.
- **Elimination (Art. 18, VI):** Users can request deletion. Health-sector exception applies — medical records can be retained when "required by law" (20-year retention) , but Vigora as a consumer app probably doesn't fall under that obligation. Default to honoring deletion, with documented retention exceptions if any.

### Enforcement reality for small apps

**The first ANPD fine ever issued (July 2023) was against a microenterprise**, not a large platform. Telekall Infoservice, a telemarketing microcompany, was fined R$14,400 total (two R$7,200 fines, each capped at 2% of microenterprise turnover) for processing without a legal basis (Art. 7) and failing to designate a DPO (Art. 41) [barbieriadvogados](https://www.barbieriadvogados.com/multa-lgpd/) [conjur](https://www.conjur.com.br/2023-jul-06/anpd-aplica-primeira-sancao-violacao-lgpd/).

**Key implications for Pedro:**
- ANPD will fine small operators — size doesn't shield you
- Fines for a microenterprise are bounded at 2% of revenue per violation, so the absolute amount is small
- ANPD moved directly to enforcement without warning rituals
- **The exact violations ANPD penalized are the easiest to avoid**: have a legal basis, designate a DPO, respond to ANPD inquiries

**No ANPD enforcement against any healthtech or health app has been documented.** ANPD has not published any health-app-specific guidance either — the agency's published Guias Orientativos cover public sector, academic research, DPO role, cookies, and high-risk criteria, but no health-app vertical [anpd.gov](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado).

### Pre-launch LGPD minimum

1. Privacy policy in plain Portuguese, covering Art. 8 elements (controller, purposes, data types with sensitive data flagged separately, retention, sharing, rights, DPO contact)
2. Separate highlighted consent checkbox for sensitive health data
3. Self-designate as DPO with a real published contact email
4. Implement data export (Art. 18, V) and deletion (Art. 18, VI) flows in-app or via DPO contact
5. Document a minimum incident response plan (who notifies ANPD if there's a breach — Art. 48 within ANPD's expected timeframes)
6. Internal record of processing (Art. 37) — a simple spreadsheet listing what data is collected, why, for how long, and who can see it

---

## 3. App Store and Google Play — approvable, but pay attention to metadata

Both stores have specific health-app policies that Vigora intersects. The good news: **the dead man's switch and SOS features have direct live precedents that have cleared review on both stores**.

### Apple App Store

The most binding section is **Guideline 1.4.1** (Safety / Physical Harm), which states (verbatim from current 2026 guidelines):

> "Medical apps that could provide inaccurate data or information, or that could be used for diagnosing or treating patients may be reviewed with greater scrutiny… Apps that claim to take x-rays, **measure blood pressure**, body temperature, blood glucose levels, or blood oxygen levels using only the sensors on the device are not permitted. **Apps should remind users to check with a doctor in addition to using the app and before making medical decisions.**" [apple](https://developer.apple.com/app-store/review/guidelines/)

This translates to two hard rules for Vigora:
- **Never claim Vigora "measures" BP or glucose** — users *enter* their readings. The metadata, screenshots, and copy must make this clear.
- **Display a "consult your doctor" reminder** in the app and description.

**Guideline 5.1.3** restricts health-data use: data collected via health features cannot be used for advertising or third-party sharing beyond the user's health management [apple](https://developer.apple.com/app-store/review/guidelines/). Vigora's monetization is RevenueCat IAP — no ad networks — so this is straightforward to satisfy.

**Account type:** Apple permits both Individual and Organization Developer accounts for health apps; the policy is advisory, not prohibitive [apple](https://developer.apple.com/health-fitness/). Pedro can submit as Individual.

### Google Play

Two policies apply, both updated in 2025–2026:

**Health Apps Declaration (effective August 28, 2025):** All health apps must complete a declaration form in Play Console before publication. Required disclaimer for non-medical-device apps: "This app is not a medical device and does not diagnose, treat, cure, or prevent any medical condition" [google](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en). This must be in the **first paragraph of the description** under January 2026 rules [myappmonitor](https://myappmonitor.com/blog/google-play-health-apps-update-2026-requirements).

**Organization verification:** Sources conflict on whether Individual accounts are now barred from publishing health apps. MyAppMonitor (third-party blog) states Google "no longer allows" Individual accounts in Medical/Health categories [myappmonitor](https://myappmonitor.com/blog/google-play-health-apps-update-2026-requirements). Google's own policy language is softer: "high-risk health apps are encouraged (and in some regions required) to be under a verified Organization account" [google](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en). Stack Overflow reports from May 2026 show inconsistent manual review of organization status [stackoverflow](https://stackoverflow.com/questions/79857424/google-play-console-app-rejected-for-organization-account-required-even-after).

**Practical recommendation: register a CNPJ before submitting to Google Play.** This is the single most likely operational launch blocker for Pedro. MEI registration is fast and cheap in Brazil (under R$100 setup, monthly fees ~R$70). Combined with a D-U-N-S number (free from Dun & Bradstreet), it converts Pedro's account to Organization status and removes ambiguity. The same CNPJ also gives ANPD-friendly accountability (a real legal entity to designate as controller).

**SMS / contact permissions:** Google Play explicitly permits SMS for "Physical safety/emergency alerts" use case [google](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en). Vigora's dead man's switch and SOS features fit this carve-out. The Permissions Declaration Form should explicitly state "Physical safety/emergency alerts" as the use case.

### Dead man's switch precedents — both stores approve it

- **Snug Safety** (daily check-in with automatic SMS to contacts if missed) — live on both stores, 20M+ check-ins processed [apple](https://apps.apple.com/us/app/snug-safety/id1122758716) 
- **My SOS Family** (countdown timer with auto-alert if not cancelled) — live on both stores [apple](https://apps.apple.com/us/app/my-sos-family-emergency-alert/id1057086897) 
- **Google Personal Safety** (native Android — "Safety Check" with automatic location/message if user doesn't check in) — Google itself ships this feature

These precedents are decisive: **the dead man's switch is not a novel store policy question, and it has cleared review on both platforms**.

### Submission metadata checklist

| Field | Apple | Google Play |
|---|---|---|
| Category | Health & Fitness (NOT Medical) | Medical (Health Apps Declaration required) |
| Disclaimer in description | "Vigora não é dispositivo médico. Consulte seu médico…" | "Vigora não é um dispositivo médico e não diagnostica, trata, cura ou previne nenhuma condição médica" — **first paragraph** |
| Privacy policy | Linked, accessible, in Portuguese | Public webpage (not PDF), in Portuguese, linked in Play Console + in-app |
| Age rating | 4+ | Everyone |
| Account type | Individual OK | Organization recommended (CNPJ + D-U-N-S) |
| Notes for review | "Does not diagnose. Does not contact emergency services. User-designated contacts only." | Permissions Declaration: "Physical safety/emergency alerts" |
| Health Connect | Don't request unless feature requires it | High clinical justification needed if requested |

No documented Brazilian-specific rejections of health/safety apps surfaced in research, beyond standard generic patterns (privacy policy in Portuguese, no false medical claims, no COVID-19 mentions without institutional backing) [goodbarber](https://pt.goodbarber.com/help/rejeicao-apple-r100/motivos-comuns-de-rejeicao-da-apple-a94/).

---

## 4. Marketing claims — CONAR matters, CFM does not

### CFM does not apply

**CFM Resolução 2.336/2023 governs only physicians and medical establishments.** Art. 1 defines "publicidade médica" as communication "with the initiative, participation and/or consent of the physician" [cfm](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2023/2336_2023.pdf) [publicidademedica.cfm](https://publicidademedica.cfm.org.br/resolucao/o-que-muda). Pedro is not a physician; Vigora is not affiliated with a clinic. CFM has no jurisdiction over Vigora's marketing.

### CONAR applies

The Código Brasileiro de Autorregulamentação Publicitária governs all Brazilian advertising, including health/wellness apps. Core rules:

- Art. 36: advertising must be clearly identifiable
- Art. 37: prohibits false or omissive information misleading consumers
- Anexo I §2: claims about health benefits must be **comprobatórias** (scientifically substantiated) on demand
- Cannot announce cure of diseases lacking established scientific treatment
- Cannot encourage automedicação
- Cannot exploit fear or dramatic situations 

### What Vigora can and cannot say

| Permitted ✓ | Prohibited ✗ |
|---|---|
| "Monitoramento de saúde" | "Ajuda a controlar a pressão arterial" |
| "Tranquilidade para quem você ama" | "Previne quedas" |
| "Cuida da sua saúde" | "Trata hipertensão" |
| "Lembretes de medicação" | "Diagnostica problemas cardíacos" |
| "Registro de seus indicadores" | "Reduz riscos cardiovasculares" |
| "Saiba que está bem mesmo de longe" | "Substitui consulta médica" |
| "Se algo acontecer, sua família saberá em minutos" | "Garante segurança em emergências" |

The line is **wellness/lifestyle framing OK, therapeutic-efficacy framing not OK**. The competitive landscape document shows that Goldies, MyTherapy, and Caixa de Remédios all stay on the safe side of this line, so the convention is well-established. Marketing copy reviewed in the canvas ("estar perto mesmo de longe," "tranquilidade") already sits in safe territory.

CONAR enforcement examples are real but extreme — a July 2025 decision ordered removal of supplement ads using deepfakes promising diabetes cures [oglobo](https://oglobo.globo.com/blogs/lauro-jardim/post/2025/07/conar-pede-remocao-de-anuncio-que-prometia-cura-da-diabetes-com-deepfake-de-drauzio-varella.ghtml). Standard wellness-framed marketing has near-zero realistic CONAR exposure.

### Required disclaimer pattern

Drawing from Diário da Saúde [diariodasaude](https://www.diariodasaude.com.br/disclaimer.php), GREA [grea](https://grea.org.br/disclaimer-medico/), and Medisafe's Brazilian terms , the established pattern is:

> *Vigora é um aplicativo informativo para monitoramento de saúde e não substitui o diagnóstico, tratamento ou acompanhamento profissional médico. O usuário é responsável por consultar um médico sobre qualquer questão de saúde. Vigora não é um serviço de emergência — em caso de emergência médica, ligue 192 (SAMU) ou 193 (Bombeiros). Alertas automáticos podem falhar; não confie exclusivamente neste aplicativo em situações de risco.*

This disclaimer should appear (a) at first launch, (b) in the privacy policy, (c) in the App Store / Play Store description, and (d) accessible from in-app settings.

---

## 5. Emergency / dead man's switch — minimal regulatory exposure

This was the area with the thinnest evidence base, which is itself a finding: **there is no Brazilian regulatory regime that specifically governs consumer apps sending automated alerts to user-designated contacts.**

### ANATEL: SMS rules apply, but accommodate emergency use

ANATEL Portaria 2123/2018 covers SMS sent by applications. Key constraints:

- Opt-in consent required (the emergency contacts must agree to receive alerts)
- Commercial SMS restricted to 9h–22h on weekdays (no equivalent restriction documented for emergency alerts)
- Opt-out mechanism required
- Mass-messaging operators must be registered/homologated [anatel](https://informacoes.anatel.gov.br/legislacao/procedimentos-de-fiscalizacao/1213-portaria-2123)

**No ANATEL prohibition on automated emergency alerts was found.** ANATEL has explicitly stated that SMS-via-app is application/content, not a regulated telecommunications service, and falls outside its scope [oglobo](https://oglobo.globo.com/economia/anatel-prorroga-prazo-para-consulta-sobre-envio-de-sms-com-propaganda-6099003).

**Practical implication:** Vigora should obtain explicit consent from each emergency contact (e.g., the contact receives a one-time confirmation message and must reply to opt in before the dead man's switch can target them). This protects against ANATEL spam exposure and is also a sensible UX safeguard.

### Consumer protection: theoretical, not active

The Código de Defesa do Consumidor (Arts. 36–37) prohibits false or abusive advertising. PROCON tracks publicidade enganosa [agenciagov](https://agenciagov.ebc.com.br/noticias/202506/senacon-alerta-publicidade-nas-redes-sociais-deve-ser-claramente-identificada). Civil liability under tort law (responsabilidade civil) is theoretically possible if a false alert causes harm — e.g., a family member rushes home and has an accident.

But: **no Brazilian court case was found imposing liability on a safety/health app for a false SOS alert**, and the panic-button industry openly operates with 80–90% false-alarm rates without legal consequence [sousecurity](https://www.sousecurity.com.br/blog/botao-antipanico-saiba-tudo-sobre-este-dispositivo). The realistic exposure is reputational, not regulatory.

**Risk mitigation built into the product:**

- Include the disclaimer language above ("alertas automáticos podem falhar")
- Implement a "snooze / confirm / cancel" window before the dead man's switch triggers (most precedents have this — Snug, My SOS Family)
- Never market the feature as "guaranteed emergency response"
- Don't integrate with 192/SAMU or 193 — only with user-designated contacts (which Vigora already does)

---

## 6. Practical pre-launch checklist

Pedro's runway is 1–2 months. Here is the ordered list of what blocks launch vs. what can wait.

### Hard pre-launch requirements (must do before submitting to stores)

1. **Register a CNPJ** (MEI is fastest — under a week, ~R$100). Needed for Google Play Organization verification, ANPD-recognized data controller, and tax-clean monetization. **This is the single biggest operational unlock.**
2. **Obtain D-U-N-S number** (free from Dun & Bradstreet) — required for Google Play Organization verification.
3. **Write LGPD-compliant privacy policy** in plain Portuguese. Must include Art. 8 elements, separately flag sensitive health data, name the DPO with a real contact email, and explicitly describe the dead man's switch and SOS data flows.
4. **Design consent flow** with a separately highlighted checkbox for sensitive health data — not bundled with terms acceptance.
5. **Self-designate as Encarregado/DPO** — publish name and email in the privacy policy.
6. **Implement data export and deletion flows** — at minimum, a "request my data" / "delete my account" path that emails the DPO and gets handled within 15 days.
7. **Add the "não substitui consulta médica" + "não é serviço de emergência" disclaimer** at first launch, in privacy policy, and in store descriptions.
8. **Complete Google Play Health Apps Declaration** before submission.
9. **Set App Store category to Health & Fitness, not Medical** — significantly reduces 1.4.1 scrutiny.
10. **Add "consult your doctor" reminder** in-app (Apple 1.4.1 requirement) and "this app does not diagnose, treat, cure or prevent…" disclaimer in description first paragraph (Google requirement).
11. **Audit metadata for forbidden claims** — no "controla pressão," "previne quedas," "trata," "diagnostica" anywhere in the store listing or marketing site.
12. **Require opt-in confirmation from emergency contacts** before activating dead man's switch escalation to them — ANATEL-compliant and sensible UX.

### Within 30 days post-launch

- Document a minimum information security policy (Art. 47) and incident response plan (Art. 48)
- Maintain internal record of processing activities (Art. 37) — a spreadsheet is sufficient
- Monitor app store reviews for any user complaint patterns that could attract PROCON attention (false alarm complaints, billing complaints)

### Can wait (post-traction)

- DPO-as-a-service outsourcing (R$2,500–6,500/month) — defer until revenue justifies it
- RIPD/DPIA (Relatório de Impacto à Proteção de Dados) — required if ANPD requests it, but not blocking for launch
- ANVISA registration — not needed unless Vigora adds evaluative/interpretive health logic
- CFM compliance — not applicable
- Corporate restructuring beyond MEI — only if MEI revenue ceiling (~R$81k/year, 2026) is approached

### What absolutely cannot be added post-launch without re-evaluating

- **Any algorithmic evaluation of health metrics** (auto-flagging "high BP," scoring glucose readings, drug-interaction warnings) — this triggers ANVISA Class I SaMD classification [anvisa](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas/perguntas-respostas-rdc-657-de-2022-v1-01-09-2022.pdf)
- **Direct 192/SAMU integration** or any claim of emergency response — substantively changes app store policy treatment and CDC exposure
- **Telemedicine features** (video/audio consultation with healthcare professionals) — triggers CFM Resolução 2.314/2022 and full SaMD analysis
- **Selling, sharing, or monetizing user health data** — explicit Estatuto do Idoso + LGPD Art. 11 §4 prohibition [medicinasa](https://medicinasa.com.br/ilpis-lgpd/)

---

## 7. Realistic risk profile

| Risk dimension | Probability | Impact | Pre-launch action |
|---|---|---|---|
| ANVISA enforcement (claiming SaMD without registration) | Very low — explicit Q&A exemption | High if triggered (R$2k–1.5M fines) | Stay disciplined on feature scope; no interpretive logic |
| ANPD fine for LGPD breach | Low for compliant launch; moderate without DPO | Low absolute amount (2% of revenue, microenterprise cap) | Designate DPO, write proper policy, implement export/delete |
| App Store rejection (Apple) | Low — clear precedents exist | Days of resubmission delay | Category Health & Fitness, disclaimers, accurate metadata |
| Google Play rejection | Moderate without CNPJ | Days to weeks of delay | Register CNPJ + D-U-N-S before submitting |
| CONAR complaint | Very low for wellness-framed copy | Order to remove ad | Audit marketing language; no efficacy claims |
| Civil liability for false SOS alert | Very low — no precedent | Theoretically high but unprecedented | Disclaimer language; confirm-before-trigger UX |
| ANATEL spam-SMS issue | Very low | Low | Opt-in confirmation from emergency contacts |

**The realistic compliance burden for Pedro is two weeks of focused work, mostly LGPD documentation, plus registering an MEI/CNPJ and obtaining D-U-N-S. None of the regulatory dimensions investigated are launch blockers under the current feature scope.** The single most important discipline is keeping Vigora on the storing/transmitting side of the ANVISA line — every interpretive feature added in future versions needs to be re-evaluated against RDC 657/2022.

---

## Where additional research would most strengthen the conclusions

- **A direct LinkedIn/email outreach to ANPD or a Brazilian healthtech-focused law firm** for a written second opinion on the small-operator high-risk classification — the conclusion that Vigora cannot use the simplified regime is well-sourced but consequential, and a 30-minute consultation would convert "high confidence based on Resolução 2/2022 text" into "confirmed by counsel." Expected cost: low (most Brazilian privacy firms offer free 30-minute discovery calls).
- **Confirmation of Google Play's current enforcement of the Organization-account requirement for health apps** in May–June 2026 — sources conflict, and a direct test (submitting Vigora to internal track with an Individual account vs. Organization account) would resolve whether MEI/CNPJ is a launch blocker or a recommended upgrade. If MEI takes longer than expected, this might shift launch sequencing.