// Verifica o aplicativo instalável no build de produção: service worker, critérios de instalação do Chrome e abertura sem internet.
// Uso: npm run build && npx vite preview --port 4173 &  →  PW_CHROMIUM=... node scripts/verificar-pwa.mjs [http://127.0.0.1:4173]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await navegador.newContext({ viewport: { width: 1200, height: 800 } });
const p = await ctx.newPage();
const falhas = [];
const conferir = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) falhas.push(msg); };

await p.goto(BASE + '/');
await p.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
await p.waitForTimeout(2500);
conferir(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active), 'service worker ativo');

const cdp = await ctx.newCDPSession(p);
const erros = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.filter(e => e.errorId !== 'in-incognito');   // janela sem perfil = anônima
conferir(erros.length === 0, `critérios de instalação do Chrome atendidos${erros.length ? ': ' + JSON.stringify(erros) : ''}`);
const manifesto = await cdp.send('Page.getAppManifest');
conferir(manifesto.errors.length === 0, `manifest sem erros${manifesto.errors.length ? ': ' + JSON.stringify(manifesto.errors) : ''}`);

await p.reload(); await p.waitForTimeout(1500);
await ctx.setOffline(true);
const falhou = [];
p.on('requestfailed', r => falhou.push(r.url()));
await p.goto(BASE + '/entrar');
await p.waitForTimeout(1500);
conferir(await p.locator('#email').isVisible().catch(() => false), 'tela de entrada abre sem internet');
conferir(await p.getByText('Sem conexão').first().isVisible().catch(() => false), 'aviso de falta de conexão aparece');
conferir(falhou.length === 0, `nenhum arquivo do aplicativo falhou offline${falhou.length ? ': ' + falhou.slice(0, 3).join(', ') : ''}`);

await navegador.close();
if (falhas.length) { console.error(`\n${falhas.length} verificação(ões) falharam.`); process.exit(1); }
console.log('\nAplicativo instalável: tudo certo.');
