# Diagnóstico — Login com Google falhando no APK

Feedback do beta: "Entrar com o Google" retornava **"Não foi possível concluir o login"**
e o usuário teve que entrar por e-mail.

## Não é bug de código

O CI (`.github/workflows/eas-build.yml`) injeta `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` tanto no
`expo export:embed` quanto no `gradle assembleRelease` (o gradle re-bundla o JS), e ainda
**verifica** que o client ID está no bundle do APK. Ou seja, as envs estão embutidas — a
falha está na **configuração do client OAuth no Google Cloud Console**, não no código.

A tela `app/oauthredirect.tsx` agora **mostra o erro real** (ex.: `redirect_uri_mismatch`,
`invalid_grant`, `unauthorized_client`) por 5s, e `lib/google-signin.ts` loga o `clientId`
usado. Rode um novo APK, reproduza, e leia a mensagem — ela aponta a causa exata.

## Checklist (causa mais provável: SHA-1)

Client Android de release usado no APK: `…iv01adn3g5di03k6ukp9n02mri393s6n` (debug: `…cm5s8hs0…`).

1. **SHA-1 do keystore** que assinou o APK:
   ```
   keytool -list -v -keystore <release.jks> -alias <alias>
   ```
   (release = keystore do secret `ANDROID_KEYSTORE_BASE64`; debug = keystore de debug do CI.)
2. No **Google Cloud Console → APIs e Serviços → Credenciais**, abra o client OAuth **Android**
   correspondente e confirme:
   - **Nome do pacote** = `com.vigora.saude`
   - **Impressão digital SHA-1** = a do passo 1 (é o que normalmente falta).
3. Se o erro for `redirect_uri_mismatch`: confira o `redirectUri` logado vs. o registrado.
4. Rebuild + re-teste lendo o erro detalhado na tela.

> Se o APK de teste foi o **debug**, use o client `…cm5s8hs0…` e o SHA-1 do keystore de debug.
