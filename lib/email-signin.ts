/**
 * lib/email-signin.ts
 *
 * Cliente do login por e-mail+senha. O cadastro exige confirmação por código
 * de 6 dígitos enviado ao e-mail — é isso que permite vincular com segurança
 * ao mesmo e-mail usado no Google/Apple (mesma conta, mesmos dados).
 */
import {
  completeServerLogin,
  postAuthRoute,
  type Nav,
  type ServerAuthResult,
} from "@/lib/auth-session";

/** Inicia o cadastro: envia o código de confirmação ao e-mail. */
export async function emailSignup(
  email: string,
  password: string,
  name: string
): Promise<void> {
  await postAuthRoute("/api/auth/email/signup", { email, password, name });
}

/** Confirma o código do cadastro e já entra (cria/vincula a conta). */
export async function emailVerify(
  email: string,
  code: string,
  router: Nav,
  reconcileFromCloud: () => Promise<void>
): Promise<void> {
  const result = await postAuthRoute<ServerAuthResult>(
    "/api/auth/email/verify",
    { email, code }
  );
  await completeServerLogin(result, router, reconcileFromCloud);
}

export async function emailLogin(
  email: string,
  password: string,
  router: Nav,
  reconcileFromCloud: () => Promise<void>
): Promise<void> {
  const result = await postAuthRoute<ServerAuthResult>(
    "/api/auth/email/login",
    { email, password }
  );
  await completeServerLogin(result, router, reconcileFromCloud);
}

/** Pede o código de redefinição de senha (sempre responde ok). */
export async function emailForgot(email: string): Promise<void> {
  await postAuthRoute("/api/auth/email/forgot", { email });
}

/** Define a nova senha com o código recebido e já entra. */
export async function emailReset(
  email: string,
  code: string,
  newPassword: string,
  router: Nav,
  reconcileFromCloud: () => Promise<void>
): Promise<void> {
  const result = await postAuthRoute<ServerAuthResult>(
    "/api/auth/email/reset",
    { email, code, newPassword }
  );
  await completeServerLogin(result, router, reconcileFromCloud);
}
