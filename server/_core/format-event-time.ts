/**
 * format-event-time.ts
 *
 * Formata o horário de um alarm_event para as mensagens de escalação
 * (WhatsApp aos contatos, push ao cuidador).
 *
 * O horário exibido tem que ser o que o IDOSO viu na tela do aparelho dele:
 * o Railway roda em UTC (sem timeZone, 21:00 de Brasília virava "00:00") e o
 * Brasil tem quatro fusos — fixar "America/Sao_Paulo" errava por 1–2h para
 * quem mora no Acre, Amazonas, Mato Grosso ou Fernando de Noronha. Mostrar
 * um horário falso dentro de um alerta de saúde é pior do que não mostrar.
 *
 * `timezone` vem do cliente (nome IANA capturado quando o evento foi criado),
 * então é entrada NÃO confiável: linhas anteriores à migração 0013 têm null, e
 * um valor inválido faz o Intl lançar RangeError. Se isso vazasse, derrubaria
 * o job de monitoramento e o cuidador nunca seria avisado — daí o fallback.
 */
const FALLBACK_TIMEZONE = "America/Sao_Paulo";

export function formatEventTime(scheduledAt: Date, timezone: string | null): string {
  const format = (tz: string) =>
    scheduledAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });

  if (!timezone) return format(FALLBACK_TIMEZONE);

  try {
    return format(timezone);
  } catch (error) {
    console.warn(
      `[Monitoring] fuso inválido "${timezone}" no alarm_event — usando ${FALLBACK_TIMEZONE}:`,
      error
    );
    return format(FALLBACK_TIMEZONE);
  }
}
