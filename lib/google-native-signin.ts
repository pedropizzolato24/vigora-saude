import {
  GoogleSignin,
} from "@react-native-google-signin/google-signin";
import {
  completeServerLogin,
  postAuthRoute,
  type Nav,
  type ServerAuthResult,
} from "@/lib/auth-session";
import { GOOGLE_WEB_CLIENT_ID } from "@/constants/oauth";

let configured = false;

/**
 * Login Google pelo Google Play Services — NÃO abre navegador.
 *
 * O fluxo por navegador (expo-auth-session + Custom Tab) morre em aparelhos sem
 * navegador visível para o app: no Samsung A15 o Custom Tab, o navegador padrão
 * e a consulta de navegadores do Android deram todos vazio. O seletor de conta
 * do Play Services é desenhado pelo próprio sistema, então não depende disso.
 *
 * O `id_token` devolvido aqui tem `aud` = webClientId — já aceito pelo servidor
 * (server/google-auth.ts), então a verificação não muda.
 *
 * @returns `false` quando o usuário fecha o seletor de conta (não é erro).
 */
export async function signInWithGoogleNative(
  router: Nav,
  reconcileFromCloud: () => Promise<void>
): Promise<boolean> {
  if (!configured) {
    // webClientId (não o androidClientId) é o que faz o Play Services emitir o
    // id_token — o app é identificado pelo package + assinatura.
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    configured = true;
  }

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (response.type === "cancelled") return false;

  const idToken = response.data.idToken;
  if (!idToken) throw new Error("id_token não recebido do Google");

  const result = await postAuthRoute<ServerAuthResult>("/api/auth/google", {
    id_token: idToken,
  });
  await completeServerLogin(result, router, reconcileFromCloud);
  return true;
}
