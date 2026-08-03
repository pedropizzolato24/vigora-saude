# Pedido de Critical Alerts Entitlement — Apple

**Onde enviar:** https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/
(exige login com a conta Apple Developer paga da Vigora)

**Antes de enviar:** habilitar a capability "Critical Alerts" no App ID
(`com.vigora.saude`) no Apple Developer Portal → Certificates, Identifiers &
Profiles → Identifiers. O formulário pede isso feito primeiro.

---

## Campos do formulário

**App Type:** `Personal Safety and Security`

> Não escolhi `Healthcare`: o Vigora não é dispositivo médico nem se
> posiciona como saúde/tratamento (regra do produto — ver seção Conformidade
> do CLAUDE.md). O mecanismo real é o dead man's switch — o alarme perdido é
> o gatilho, a escalação de segurança é o motivo do pedido.

**Bundle ID:** `com.vigora.saude`

**Describe your app:**
> Vigora is a wellbeing and safety monitoring app for elderly users in Brazil
> (60+), typically set up and monitored by their adult children as
> caregivers. The app schedules medication reminder alarms and includes a
> dead man's switch: if the user does not acknowledge an alarm within a short
> window, the app notifies their designated emergency contacts that the
> person may need help.

**What type of notifications will you send as Critical Alerts?**
> Medication alarm reminders that the user must actively acknowledge inside
> the app. This is the only notification type we are requesting Critical
> Alerts for — not used for any marketing, social, or general-purpose
> notification.

**How frequently will you send Critical Alerts?** `Regularly scheduled`

> Alarms fire at times the user configures themselves (typically 1-4 per
> day, tied to their medication schedule) — not ad-hoc or high-frequency.

**Explain why you need this entitlement and how it will be used in your app.**
> A missed medication alarm has two real consequences for this user
> population: (1) a missed dose, which for common elderly prescriptions
> (blood pressure, diabetes) carries genuine health risk; and (2) it is the
> only trigger for our safety escalation — if the user does not respond, we
> notify their emergency contacts that they may be unresponsive. Standard and
> time-sensitive notifications are silenced by Focus modes and by the
> iPhone's physical silent switch, which many elderly users leave engaged out
> of habit; today the alarm fails silently in exactly that state, and our
> escalation logic never gets the chance to work as intended. We are
> requesting Critical Alerts scoped solely to this medication-alarm
> notification type, not for any promotional or engagement purpose.

---

## Depois da aprovação

1. Adicionar a capability no `app.config.ts` (ios.entitlements):
   ```ts
   "com.apple.developer.usernotifications.critical-alerts": true
   ```
2. Trocar `allowCriticalAlerts` (já presente em
   `lib/notifications-utils.ts:103`) para efetivamente funcionar — hoje o iOS
   ignora essa flag silenciosamente por falta do entitlement.
3. Nas notificações do alarme (`lib/notifications-utils.ts`), usar
   `interruptionLevel: 'critical'` + `criticalSoundVolume`/`criticalSound` em
   vez de `'timeSensitive'` (fix atual, que não fura Não Perturbe/silencioso).
4. Rebuild com `eas build` — sem o entitlement aprovado na conta, esse build
   falha na assinatura.

## Status

- [ ] Capability habilitada no App ID
- [ ] Formulário enviado
- [ ] Aprovado pela Apple
- [ ] Entitlement adicionado ao app.config.ts
- [ ] `interruptionLevel: 'critical'` aplicado nas notificações de alarme
