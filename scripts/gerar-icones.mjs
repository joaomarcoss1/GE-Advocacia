// Gera favicon.svg e os ícones PNG do aplicativo (PWA/iOS) a partir dos contornos de src/components/logoPaths.ts.
// Uso: PW_CHROMIUM=/caminho/do/chromium node scripts/gerar-icones.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const fonte = readFileSync('src/components/logoPaths.ts', 'utf8');
const c = k => fonte.match(new RegExp(`${k} = '([^']+)'`))[1];
const P = { g: c('LETRA_G'), e: c('LETRA_E'), ext: c('ARCO_EXTERNO'), int: c('ARCO_INTERNO'), base: c('LINHA_BASE') };

const defs = `<defs><linearGradient id="b" gradientUnits="userSpaceOnUse" x1="14" y1="14" x2="50" y2="52"><stop offset="0" stop-color="#f6e7bf"/><stop offset=".5" stop-color="#d9b97e"/><stop offset="1" stop-color="#b08d57"/></linearGradient><radialGradient id="f" cx=".3" cy=".15" r="1"><stop offset="0" stop-color="#1b2f4d"/><stop offset=".6" stop-color="#0f1c2e"/><stop offset="1" stop-color="#0a1422"/></radialGradient></defs>`;
const emblema = (fino) => `<g fill="none" stroke="url(#b)"><path d="${P.ext}" stroke-width="${fino ? .9 : 1.3}"/>${fino ? `<path d="${P.int}" stroke-width=".4" stroke-opacity=".7"/>` : ''}<path d="${P.base}" stroke-width="${fino ? .9 : 1.3}"/></g><g fill="url(#b)"><path d="${P.g}"/><path d="${P.e}"/></g>`;
const svg = (corpo, rx = 15) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}<rect width="64" height="64" rx="${rx}" fill="url(#f)"/>${corpo}</svg>`;
// ícone "mascarável" (Android): fundo cheio e emblema dentro da zona segura (~66% central)
const mascaravel = svg(`<g transform="translate(32 32) scale(.72) translate(-32 -32)">${emblema(false)}</g>`, 0);

writeFileSync('public/favicon.svg', svg(emblema(false)));
mkdirSync('public/icons', { recursive: true });
const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
async function png(conteudo, tamanho, destino, fundo = false) {
  const p = await navegador.newPage({ viewport: { width: tamanho, height: tamanho } });
  await p.setContent(`<body style="margin:0;background:${fundo ? '#0f1c2e' : 'transparent'}">${conteudo.replace('<svg ', `<svg width="${tamanho}" height="${tamanho}" `)}</body>`);
  await p.screenshot({ path: destino, omitBackground: !fundo });
  await p.close();
}
await png(svg(emblema(false)), 192, 'public/icons/icon-192.png');
await png(svg(emblema(false)), 512, 'public/icons/icon-512.png');
await png(mascaravel, 512, 'public/icons/maskable-512.png', true);
await png(svg(emblema(false), 0), 180, 'public/icons/apple-touch-icon.png', true);   // o iOS arredonda sozinho
await png(svg(emblema(false)), 32, 'public/icons/favicon-32.png');
await navegador.close();
console.log('ícones gerados');
