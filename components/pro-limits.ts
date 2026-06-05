/**
 * components/pro-limits.ts
 * Limites do plano gratuito do Vigora Saúde Pro.
 *
 * Módulo puro (sem JSX/React Native) para que tanto a UI quanto os testes
 * possam importar a MESMA fonte de verdade. Re-exportado por `pro-gate.tsx`
 * para manter compatibilidade com os imports existentes.
 */

export const FREE_LIMITS = {
  /** Máximo de contatos de emergência no plano gratuito */
  CONTACTS: 3,
  /** Máximo de alarmes no plano gratuito */
  ALARMS: 5,
  /** Exportação PDF disponível apenas no Pro */
  PDF_EXPORT: false,
  /** Monitoramento contínuo disponível apenas no Pro */
  MONITORING: false,
} as const;
