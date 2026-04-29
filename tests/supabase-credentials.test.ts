/**
 * supabase-credentials.test.ts
 *
 * Valida que as credenciais do Supabase estão configuradas e funcionais.
 */
import { describe, it, expect } from 'vitest';

describe('Supabase credentials', () => {
  it('EXPO_PUBLIC_SUPABASE_URL deve estar configurada e ter formato válido', () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(url, 'EXPO_PUBLIC_SUPABASE_URL não está definida').toBeTruthy();
    expect(url).toMatch(/^https:\/\/.+\.supabase\.co$/);
  });

  it('EXPO_PUBLIC_SUPABASE_ANON_KEY deve estar configurada e ter formato JWT', () => {
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(key, 'EXPO_PUBLIC_SUPABASE_ANON_KEY não está definida').toBeTruthy();
    // JWT tem 3 partes separadas por ponto
    const parts = key!.split('.');
    expect(parts.length).toBe(3);
  });

  it('deve conseguir conectar ao Supabase e listar tabelas', async () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

    // Testa conexão com uma query simples na tabela users
    const response = await fetch(`${url}/rest/v1/users?limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });

    // 200 = tabela existe e RLS permite acesso
    // 404 = tabela não existe ainda (schema não foi executado)
    // 401 = credenciais inválidas
    expect(
      response.status,
      `Supabase retornou status ${response.status} — verifique as credenciais ou execute o schema.sql`
    ).not.toBe(401);

    console.log(`[Supabase] Status: ${response.status} — ${response.status === 200 ? 'tabela users existe' : 'tabela users ainda não criada (execute schema.sql)'}`);
  });
});
