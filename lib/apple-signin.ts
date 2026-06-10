/**
 * lib/apple-signin.ts
 *
 * Sign in with Apple (iOS apenas). O expo-apple-authentication entrega um
 * identity token assinado pela Apple; o servidor o verifica contra o JWKS
 * público e emite o JWT de sessão interno.
 *
 * A Apple só envia nome/e-mail na PRIMEIRA autorização — enviamos o nome ao
 * servidor quando ele vem, e o servidor preserva o que já está gravado.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import {
  completeServerLogin,
  postAuthRoute,
  type Nav,
  type ServerAuthResult,
} from "@/lib/auth-session";

/** true quando o usuário fechou o diálogo da Apple — não é um erro. */
export function isAppleCancel(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "ERR_REQUEST_CANCELED"
  );
}

export async function signInWithApple(
  router: Nav,
  reconcileFromCloud: () => Promise<void>
): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("A Apple não retornou as credenciais. Tente novamente.");
  }

  const fullName = [
    credential.fullName?.givenName,
    credential.fullName?.familyName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const result = await postAuthRoute<ServerAuthResult>("/api/auth/apple", {
    identity_token: credential.identityToken,
    ...(fullName ? { full_name: fullName } : {}),
  });

  await completeServerLogin(result, router, reconcileFromCloud);
}
