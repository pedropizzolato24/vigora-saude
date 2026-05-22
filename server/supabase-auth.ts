import type { Express, Request, Response } from 'express';
import { getUserByOpenId, upsertUser } from './db';
import { sdk } from './_core/sdk';

const SUPABASE_URL = 'https://qlxlabwgflxbzavszbvb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFseGxhYndnZmx4YnphdnN6YnZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODUwMDAsImV4cCI6MjA5NDM2MTAwMH0.wQekRovkFGUIY2wQoL8ChEsuO9Yn0AZNI03bLWuoNc8';

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    email?: string;
  };
}

export function registerSupabaseAuthRoute(app: Express) {
  /**
   * POST /api/auth/supabase
   * Body: { access_token: string }
   *
   * Verifies a Supabase access token, upserts the user in our DB,
   * and returns a custom session JWT for our tRPC API.
   */
  app.post('/api/auth/supabase', async (req: Request, res: Response) => {
    const { access_token } = req.body as { access_token?: string };

    if (!access_token) {
      res.status(400).json({ error: 'access_token is required' });
      return;
    }

    try {
      // Verify token by fetching user info from Supabase Auth
      const supabaseRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      });

      if (!supabaseRes.ok) {
        console.error('[Supabase Auth] Token verification failed:', supabaseRes.status);
        res.status(401).json({ error: 'Token inválido ou expirado' });
        return;
      }

      const supabaseUser = await supabaseRes.json() as SupabaseUser;

      const openId = `google:${supabaseUser.id}`;
      const email = supabaseUser.email ?? null;
      const name =
        supabaseUser.user_metadata?.full_name ??
        supabaseUser.user_metadata?.name ??
        email ??
        'Usuário';

      const appId = process.env.VITE_APP_ID || process.env.APP_ID || 'vigora-saude';

      await upsertUser({ openId, name, email, loginMethod: 'google', lastSignedIn: new Date() });

      const sessionToken = await sdk.signSession(
        { openId, appId, name },
        { expiresInMs: 7 * 24 * 60 * 60 * 1000 },
      );

      const dbUser = await getUserByOpenId(openId);

      res.json({
        sessionToken,
        user: {
          id: dbUser?.id ?? null,
          openId,
          name,
          email,
          phone: dbUser?.phone ?? null,
          userType: dbUser?.userType ?? null,
          birthDate: dbUser?.birthDate ?? null,
          bloodType: dbUser?.bloodType ?? null,
          loginMethod: 'google',
          lastSignedIn: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[Supabase Auth] Error:', err);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });
}
