// Auditoria de layout: percorre as telas em vários tamanhos e aponta estouro de largura, alvos de toque pequenos e campos que causam zoom no iPhone.
// Uso: PW_CHROMIUM=... BASE=http://127.0.0.1:5173 node scripts/auditar-layout.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const TELAS = (process.env.TELAS ? process.env.TELAS.split(',').map(t => t.split('x').map(Number)) : [[320, 568], [375, 667], [390, 844], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]]);
const PUBLICAS = ['/', '/entrar', '/ponto/silva-ribeiro', '/verificar', '/privacidade/silva-ribeiro', '/diagnostico'];
const PAINEL = ['/painel', '/painel/tarefas', '/painel/agenda', '/painel/processos', '/painel/intimacoes', '/painel/documentos', '/painel/modelos', '/painel/honorarios', '/painel/gerencia', '/painel/funcionarios', '/painel/cargos', '/painel/escalas',
  '/painel/ponto', '/painel/ocorrencias', '/painel/feriados', '/painel/folha', '/painel/relatorios', '/painel/configuracoes', '/painel/configuracoes?aba=integracoes', '/painel/configuracoes?aba=backup', '/painel/configuracoes?aba=acessos', '/painel/configuracoes?aba=privacidade'];

const medir = () => {
  const vw = document.documentElement.clientWidth;
  const visivel = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const rolavel = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  const nome = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : '') + ((el.textContent || '').trim().slice(0, 24) ? ` “${(el.textContent || '').trim().slice(0, 24)}”` : ''));
  const achados = [];
  if (document.documentElement.scrollWidth > vw + 1) achados.push(`ROLAGEM HORIZONTAL na página (${document.documentElement.scrollWidth} > ${vw})`);
  const fora = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visivel(el) || rolavel(el) || el.closest('.side:not(.open)') || el.closest('.stage-arte')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 || r.left < -2) fora.add(el);
  }
  for (const el of [...fora]) if (![...fora].some(o => o !== el && el.contains(o))) { /* só o elemento mais interno */ } else fora.delete(el);
  for (const el of [...fora].slice(0, 6)) achados.push(`ESTOURA a largura: ${nome(el)} (${Math.round(el.getBoundingClientRect().left)}→${Math.round(el.getBoundingClientRect().right)} de ${vw})`);
  if (vw <= 820) {
    const pequenos = [];
    for (const el of document.querySelectorAll('a[href], button, [role="tab"], input:not([type=hidden]):not([type=file]), select, textarea, summary, label.btn')) {
      if (!visivel(el) || el.closest('.side:not(.open)') || el.closest('.skip')) continue;
      if (el.matches('a') && getComputedStyle(el).display === 'inline' && el.closest('p, li, td, span, small')) continue;       // link dentro de texto
      const caixa = el.matches('input[type=checkbox], input[type=radio]') ? (el.closest('label') ?? el) : el;      // caixinha: vale a área do rótulo
      const r = caixa.getBoundingClientRect();
      if (r.height < 40 || r.width < 40) pequenos.push(`${nome(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    if (pequenos.length) achados.push(`ALVO DE TOQUE pequeno (${pequenos.length}): ${pequenos.slice(0, 5).join(' | ')}`);
    const zoom = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')].filter(e => visivel(e) && parseFloat(getComputedStyle(e).fontSize) < 16).map(nome);
    if (zoom.length) achados.push(`ZOOM no iPhone (fonte < 16px) em ${zoom.length}: ${zoom.slice(0, 4).join(' | ')}`);
  }
  return achados;
};

const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const resumo = new Map();
async function varrer(page, rotas, rotulo) {
  for (const rota of rotas) {
    await page.goto(BASE + rota); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
    for (const a of await page.evaluate(medir)) { const k = `${a.replace(/\(\d+ > \d+\)|\d+→\d+ de \d+|\d+×\d+/g, '')}`; const e = resumo.get(k) ?? { ex: a, onde: new Set() }; e.onde.add(`${rotulo}${rota} @${page.viewportSize().width}`); resumo.set(k, e); }
  }
}
for (const [w, h] of TELAS) {
  const ctx = await navegador.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 });
  const page = await ctx.newPage();
  await varrer(page, PUBLICAS, '');
  await page.goto(BASE + '/entrar'); await page.locator('#email').fill('admin@silvaribeiro.adv.br'); await page.locator('#senha').fill('silva2026admin');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.waitForURL(/\/painel/);
  await varrer(page, PAINEL, '');
  await ctx.close();
}
await navegador.close();
let n = 0;
for (const [, e] of resumo) { n++; const lista = [...e.onde]; console.log(`\n• ${e.ex}\n  em ${lista.length} telas: ${lista.slice(0, 8).join(', ')}${lista.length > 8 ? '…' : ''}`); }
console.log(`\n${n} tipos de problema encontrados.`);
