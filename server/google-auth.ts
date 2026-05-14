import type { Express, Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'crypto';
import { getUserByOpenId, upsertUser } from './db';
import { sdk } from './_core/sdk';

// ── State signing ──────────────────────────────────────────────────────────────

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? '');
}

async function signGoogleState(): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  return new SignJWT({ nonce, typ: 'google-state' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600) // 10 min
    .sign(getSecret());
}

async function verifyGoogleState(state: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(state, getSecret(), { algorithms: ['HS256'] });
    return (payload as Record<string, unknown>)?.typ === 'google-state';
  } catch {
    return false;
  }
}

// ── URL helpers ────────────────────────────────────────────────────────────────

function getCallbackUrl(): string {
  if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;
  return 'https://vigoraapp-2ncfsgrj.manus.space/api/auth/google/callback';
}

const APP_SCHEME = 'manus20260417141411';

// ── Google token types ─────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerGoogleAuthRoute(app: Express) {
  /**
   * Step 1 — Client calls this to get the Google OAuth URL with a signed state.
   * GET /api/auth/google/start
   * Response: { url: string }
   */
  app.get('/api/auth/google/start', async (_req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({ error: 'Google Sign-In not configured on the server' });
      return;
    }

    const state = await signGoogleState();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getCallbackUrl(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'select_account',
    });

    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  });

  /**
   * Step 2 — Google redirects here after the user authenticates.
   * GET /api/auth/google/callback?code=...&state=...
   * Redirects to: manus20260417141411://oauth/callback?sessionToken=...&user=...
   */
  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    const fail = (reason: string) =>
      res.redirect(`${APP_SCHEME}://oauth/callback?error=${encodeURIComponent(reason)}`);

    if (error) { fail(error); return; }
    if (!code || !state) { fail('missing_params'); return; }

    const stateOk = await verifyGoogleState(state);
    if (!stateOk) { fail('invalid_state'); return; }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) { fail('server_not_configured'); return; }

    try {
      // Exchange authorization code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: getCallbackUrl(),
          grant_type: 'authorization_code',
        }).toString(),
      });

      const tokenData = await tokenRes.json() as GoogleTokenResponse;

      if (!tokenRes.ok || tokenData.error || !tokenData.id_token) {
        console.error('[Google Auth] Token exchange failed:', tokenData.error_description);
        fail('token_exchange_failed');
        return;
      }

      // Decode the ID token (trusted: came directly from Google's token endpoint)
      const payloadB64 = tokenData.id_token.split('.')[1];
      const userPayload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8'),
      ) as GoogleIdTokenPayload;

      const openId = `google:${userPayload.sub}`;
      const email = userPayload.email ?? null;
      const name = userPayload.name ?? userPayload.given_name ?? email ?? 'Usuário Google';
      const appId = process.env.VITE_APP_ID || process.env.APP_ID || 'vigora-saude';

      await upsertUser({ openId, name, email, loginMethod: 'google', lastSignedIn: new Date() });

      const sessionToken = await sdk.signSession(
        { openId, appId, name },
        { expiresInMs: 7 * 24 * 60 * 60 * 1000 },
      );

      const dbUser = await getUserByOpenId(openId);
      const userB64 = Buffer.from(
        JSON.stringify({
          id: dbUser?.id ?? null,
          openId,
          name,
          email,
          loginMethod: 'google',
          lastSignedIn: new Date().toISOString(),
        }),
      ).toString('base64');

      // Reuse the existing oauth/callback deep link — app already handles sessionToken + user params
      res.redirect(
        `${APP_SCHEME}://oauth/callback?sessionToken=${encodeURIComponent(sessionToken)}&user=${encodeURIComponent(userB64)}`,
      );
    } catch (err) {
      console.error('[Google Auth] Callback failed:', err);
      fail('auth_failed');
    }
  });
}
