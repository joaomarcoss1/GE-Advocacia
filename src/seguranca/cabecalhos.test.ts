import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ler = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const vercel = JSON.parse(ler('vercel.json')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
const cab = Object.fromEntries(vercel.headers.find(h => h.source === '/(.*)')!.headers.map(h => [h.key.toLowerCase(), h.value]));
const csp = Object.fromEntries(cab['content-security-policy'].split(';').map(d => d.trim()).filter(Boolean).map(d => { const [k, ...v] = d.split(/\s+/); return [k, v]; })) as Record<string, string[]>;

describe('cabeçalhos de segurança (vercel.json)', () => {
  it('CSP restritiva: sem eval, sem script inline, sem frames, sem plugins', () => {
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['script-src']).toEqual(["'self'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
    expect(cab['content-security-policy']).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(cab['content-security-policy']).toMatch(/upgrade-insecure-requests/);
  });
  it('conexões só com o próprio site, o Supabase e o monitoramento (sem curinga solto)', () => {
    for (const o of csp['connect-src']) expect(o).toMatch(/^('self'|https:\/\/\*\.supabase\.co|wss:\/\/\*\.supabase\.co|https:\/\/\*\.ingest(\.us)?\.sentry\.io)$/);
    for (const o of csp['img-src']) expect(o).not.toBe('*');
  });
  it('clickjacking, sniffing, referrer, HTTPS e permissões', () => {
    expect(cab['x-frame-options']).toBe('DENY');
    expect(cab['x-content-type-options']).toBe('nosniff');
    expect(cab['referrer-policy']).toMatch(/strict-origin/);
    expect(cab['strict-transport-security']).toMatch(/max-age=(\d+)/);
    expect(Number(cab['strict-transport-security'].match(/max-age=(\d+)/)![1])).toBeGreaterThanOrEqual(31_536_000);
    expect(cab['strict-transport-security']).toMatch(/includeSubDomains/);
    expect(cab['permissions-policy']).toMatch(/camera=\(\)/); expect(cab['permissions-policy']).toMatch(/microphone=\(\)/);
    expect(cab['permissions-policy']).toMatch(/geolocation=\(self\)/);
    expect(cab['cross-origin-opener-policy']).toBe('same-origin');
  });
  it('o service worker nunca fica em cache, para correções chegarem na hora', () => {
    const sw = vercel.headers.find(h => h.source === '/sw.js')!;
    expect(sw.headers.find(h => h.key === 'Cache-Control')!.value).toMatch(/no-store|no-cache/);
  });
  it('index.html só carrega scripts do próprio site (compatível com a CSP)', () => {
    const html = ler('index.html');
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) expect(m[1], m[0]).toMatch(/\bsrc="\/(tema\.js|src\/main\.tsx)"/);
    expect(html).not.toMatch(/\son\w+\s*=/i);          // sem manipuladores inline (onclick…)
  });
  it('o mapa do código (sourcemap) não vai para produção', () => {
    expect(ler('vite.config.ts')).not.toMatch(/sourcemap:\s*(true|'inline'|'hidden')/);
  });
  it('a configuração do Supabase limita login e exige senha forte', () => {
    const t = ler('supabase/config.toml');
    expect(t).toMatch(/enable_signup = false/); expect(t).toMatch(/enable_anonymous_sign_ins = false/);
    expect(t).toMatch(/minimum_password_length = (1\d|[2-9]\d)/); expect(t).toMatch(/\[auth\.rate_limit\]/); expect(t).toMatch(/sign_in_sign_ups = \d+/);
  });
});
