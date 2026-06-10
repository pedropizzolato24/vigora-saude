/**
 * components/pro-limits.ts
 * Política de acesso do Vigora.
 *
 * O app NÃO restringe recursos por plano: durante o free trial (e fora dele)
 * o usuário tem a experiência completa — contatos e alarmes ilimitados,
 * exportação de PDF e monitoramento liberados. A monetização acontece via
 * assinatura após o trial (TrialBanner/ExpiredBanner + paywall), não via
 * bloqueio de funcionalidades.
 *
 * Módulo puro (sem JSX/React Native) para que tanto a UI quanto os testes
 * possam importar a MESMA fonte de verdade. Re-exportado por `pro-gate.tsx`
 * para manter compatibilidade com os imports existentes.
 */

export const FREE_LIMITS = {
  /** Contatos de emergência — sem limite por plano */
  CONTACTS: Infinity,
  /** Alarmes — sem limite por plano (há um teto técnico de 24 no app) */
  ALARMS: Infinity,
  /** Exportação PDF liberada para todos */
  PDF_EXPORT: true,
  /** Monitoramento contínuo liberado para todos */
  MONITORING: true,
} as const;

/** Teto técnico de alarmes simultâneos (limite do agendador, não do plano). */
export const MAX_ALARMS = 24;
