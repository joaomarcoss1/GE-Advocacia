import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARMAZENAMENTO } from '@/pages/Cookies';

/** Varredura estática do código: o que nunca pode aparecer no navegador ou nas funções. */
const RAIZ = new URL('../../', import.meta.url).pathname;
function arquivos(dir: string, ext: RegExp, saida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) arquivos(p, ext, saida); else if (ext.test(n)) saida.push(p);
  }
  return saida;
}
const lerTudo = (dir: string, ext: RegExp, ignorarTeste = true) => arquivos(join(RAIZ, dir), ext)
  .filter(p => !(ignorarTeste && /\.test\.tsx?$/.test(p)) && !p.includes('/seguranca/'))
  .map(p => ({ arq: relative(RAIZ, p), txt: readFileSync(p, 'utf8') }));
const SRC = lerTudo('src', /\.(ts|tsx)$/);
const onde = (re: RegExp, base = SRC) => base.filter(f => re.test(f.txt)).map(f => f.arq);

describe('navegador: nada perigoso no código', () => {
  it('a service_role e segredos de servidor nunca aparecem no front-end', () => {
    expect(onde(/SERVICE_ROLE_KEY|Deno\.env|process\.env\.\w*(SECRET|SERVICE)/)).toEqual([]);
  });
  it('nenhuma chave ou token embutido no código', () => {
    expect(onde(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./)).toEqual([]);          // JWT (inclusive service_role)
    expect(onde(/sb_secret_|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}/)).toEqual([]);
  });
  it('só as variáveis públicas do Vite são lidas', () => {
    const usadas = new Set(SRC.flatMap(f => [...f.txt.matchAll(/import\.meta\.env\.(\w+)/g)].map(m => m[1])));
    for (const v of usadas) expect(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SENTRY_DSN', 'DEV', 'PROD', 'MODE', 'BASE_URL'], v).toContain(v);
  });
  it('sem eval, new Function, document.write nem atribuição a innerHTML', () => {
    expect(onde(/\beval\s*\(|new Function\s*\(|document\.write\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/)).toEqual([]);
  });
  it('dangerouslySetInnerHTML só no logotipo, com conteúdo fixo', () => {
    expect(onde(/dangerouslySetInnerHTML/)).toEqual(['src/components/Logo.tsx']);
    expect(SRC.find(f => f.arq.endsWith('Logo.tsx'))!.txt).toMatch(/__html: LOGO_MIOLO\.replaceAll\('GEID', id\)/);
  });
  it('links para fora abrem com noopener noreferrer', () => {
    const ruins = SRC.flatMap(f => [...f.txt.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].filter(m => !/rel="[^"]*noopener[^"]*noreferrer/.test(m[0])).map(() => f.arq));
    expect(ruins).toEqual([]);
  });
  it('senha, PIN e token nunca vão para o armazenamento do navegador', () => {
    const grava = SRC.flatMap(f => [...f.txt.matchAll(/(?:localStorage|sessionStorage)\.setItem\(\s*([^,)]+)/g)].map(m => ({ arq: f.arq, chave: m[1] })));
    for (const g of grava) expect(g.chave, `${g.arq}: ${g.chave}`).not.toMatch(/senha|password|pin\b|token|secret/i);
  });
  it('não há console.log de dados no código de produção', () => {
    expect(onde(/console\.log\(/)).toEqual([]);
  });
  it('os itens guardados no aparelho estão todos descritos na política de cookies', () => {
    const chaves = new Set(SRC.flatMap(f => [...f.txt.matchAll(/['"`](ge\.[a-z][\w.-]*)/g)].map(m => m[1].replace(/\.$/, ''))));
    const doc = ARMAZENAMENTO.map(i => i.nome);
    for (const c of chaves) {
      if (c.startsWith('ge.v1')) continue;             // espaço do modo demonstração (só no navegador, dados fictícios)
      expect(doc.some(d => d === c || d.startsWith(`${c}.`) || c.startsWith(d.replace(/<.*$/, '').replace(/\.$/, ''))), `"${c}" não está em ARMAZENAMENTO (Cookies.tsx)`).toBe(true);
    }
  });
});

describe('servidor: funções e migrações', () => {
  const FUNCOES = lerTudo('supabase/functions', /\.ts$/);
  const MIGRACOES = lerTudo('supabase/migrations', /\.sql$/);
  it('a service_role fica só nas Edge Functions', () => {
    for (const f of FUNCOES) if (/SUPABASE_SERVICE_ROLE_KEY/.test(f.txt)) expect(f.arq).toMatch(/^supabase\/functions\//);
  });
  it('as funções públicas limitam o tamanho do corpo ou validam o formato do que recebem', () => {
    const ponto = FUNCOES.find(f => f.arq.endsWith('ponto-entrar/index.ts'))!.txt;
    expect(ponto).toMatch(/UUID\.test\(fid\)/); expect(ponto).toMatch(/\\d\{6,8\}/); expect(ponto).toMatch(/limite\.tenta\(ip\)/); expect(ponto).toMatch(/no-store/);
  });
  it('toda função SECURITY DEFINER fixa o search_path', () => {
    const sem: string[] = [];
    for (const m of MIGRACOES) for (const c of m.txt.matchAll(/create or replace function ([\w.]+)\([^$]*?security definer([^$]*?)\$\$/gis)) if (!/search_path/i.test(c[2])) sem.push(`${m.arq}: ${c[1]}`);
    expect(sem).toEqual([]);
  });
  it('nenhuma migração dá acesso de tabela ou de escrita ao visitante anônimo', () => {
    const ruins = MIGRACOES.flatMap(m => [...m.txt.matchAll(/grant\s+(?!execute)[^;]*\bto\b[^;]*\banon\b/gi)].map(x => `${m.arq}: ${x[0].slice(0, 80)}`));
    expect(ruins).toEqual([]);
  });
  it('a service_role é a única a executar funções de serviço', () => {
    const m14 = MIGRACOES.find(m => m.arq.endsWith('0014_seguranca_entrada_automatica.sql'))!.txt;
    expect(m14).toMatch(/revoke all on function public\.ponto_acesso\(uuid, text, text\) from public, anon, authenticated;/);
    expect(m14).toMatch(/grant execute on function public\.ponto_acesso\(uuid, text, text\) to service_role;/);
  });
});
