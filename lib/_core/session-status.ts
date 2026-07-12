/**
 * session-status.ts
 *
 * Política PURA (sem dependências de React Native / Expo, testável em node) de
 * qual status HTTP significa "a sessão não vale mais, precisa reautenticar".
 * Fica em módulo separado de auth.ts justamente para ser importável nos testes
 * sem arrastar expo-secure-store / react-native.
 *
 * APENAS 401 desloga — NUNCA 403.
 *
 * Neste servidor, uma sessão inválida/expirada/de usuário deletado sempre vira
 * 401: authenticateRequest lança ForbiddenError, mas createContext CAPTURA isso
 * -> user=null -> protectedProcedure lança UNAUTHORIZED (401); os endpoints REST
 * de auth (/api/auth/me, /session) também convertem a falha para 401.
 *
 * Um 403, portanto, significa sempre "autenticado, PORÉM proibido DESTA ação
 * específica" — posse de dispositivo por outro usuário (monitoring.*) ou rota de
 * admin. Deslogar nesse caso chutava o usuário de volta pro login, por exemplo,
 * ao TROCAR DE CONTA no mesmo aparelho (device ainda registrado na conta
 * anterior -> heartbeat 403 -> logout -> loop). O 403 deve falhar em silêncio,
 * não encerrar a sessão.
 */
export function isSessionExpiredStatus(status: number): boolean {
  return status === 401;
}
