// Gera favicon.svg e os ícones PNG do aplicativo (PWA/iOS) a partir dos contornos de src/components/logoPaths.ts.
// Uso: PW_CHROMIUM=/caminho/do/chromium node scripts/gerar-icones.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const fonte = readFileSync('src/components/logoPaths.ts', 'utf8');
const miolo = fonte.match(/LOGO_MIOLO = `([^`]+)`/)[1].replaceAll('GEID', 'ge');
const logo = (extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${extra}${miolo}</svg>`;
// ícone "mascarável" (Android/iOS): fundo cheio, sem cantos, e a logo dentro da zona segura
const plena = fonte.match(/LOGO_PLENA = `([^`]+)`/)[1].replaceAll('GEID', 'ge');
const mascaravel = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${plena}</svg>`;

writeFileSync('public/favicon.svg', logo());
// marca-d'água em linha (usada como máscara no CSS; a cor vem do tema)
const traco = k => fonte.match(new RegExp(`${k} = '([^']+)'`))[1];
mkdirSync('public/arte', { recursive: true });
writeFileSync('public/arte/marca-linha.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#000" stroke-width=".5" stroke-linecap="round" stroke-linejoin="round"><path d="${traco('ARCO_EXTERNO')}"/><path d="${traco('ARCO_INTERNO')}" stroke-width=".25"/><path d="${traco('LINHA_BASE')}"/><path d="${traco('LETRA_G')}"/><path d="${traco('LETRA_E')}"/></g></svg>`);
mkdirSync('public/icons', { recursive: true });
const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
async function png(conteudo, tamanho, destino, fundo = false) {
  const p = await navegador.newPage({ viewport: { width: tamanho, height: tamanho } });
  await p.setContent(`<body style="margin:0;background:${fundo ? '#0f1c2e' : 'transparent'}">${conteudo.replace('<svg ', `<svg width="${tamanho}" height="${tamanho}" `)}</body>`);
  await p.screenshot({ path: destino, omitBackground: !fundo });
  await p.close();
}
await png(logo(), 192, 'public/icons/icon-192.png');
await png(logo(), 512, 'public/icons/icon-512.png');
await png(mascaravel, 512, 'public/icons/maskable-512.png', true);
await png(mascaravel.replace('scale(.72)', 'scale(.84)'), 180, 'public/icons/apple-touch-icon.png', true);   // o iOS arredonda sozinho
await png(logo(), 32, 'public/icons/favicon-32.png');
await navegador.close();
console.log('ícones gerados');
