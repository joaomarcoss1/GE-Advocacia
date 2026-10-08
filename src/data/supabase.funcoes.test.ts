import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarDbSupabase } from './supabase';
import { ErroNegocio } from '@/lib/erros';

const db = () => criarDbSupabase('https://exemplo.supabase.co', 'chave-publica-de-teste');
beforeEach(() => vi.stubGlobal('location', { origin: 'https://ge.exemplo' }));
afterEach(() => vi.unstubAllGlobals());

describe('chamada às Edge Functions', () => {
  it('função não publicada (falha de conexão/CORS) vira um erro explicável, não o texto do navegador', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const e = await db().google.conectar().then(() => null, x => x as ErroNegocio);
    expect(e).toBeInstanceOf(ErroNegocio);
    expect(e?.codigo).toBe('FUNCAO_NAO_PUBLICADA');
    expect(e?.message).not.toMatch(/failed to send/i);
  });

  it('função inexistente (404) também é "não publicada"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Requested function was not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })));
    const e = await db().google.conectar().then(() => null, x => x as ErroNegocio);
    expect(e?.codigo).toBe('FUNCAO_NAO_PUBLICADA');
  });

  it('função publicada sem credenciais do Google devolve GOOGLE_INDISPONIVEL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ erro: 'GOOGLE_INDISPONIVEL' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    const e = await db().google.conectar().then(() => null, x => x as ErroNegocio);
    expect(e?.codigo).toBe('GOOGLE_INDISPONIVEL');
    expect(e?.message).toMatch(/Google Agenda/);
  });
});
