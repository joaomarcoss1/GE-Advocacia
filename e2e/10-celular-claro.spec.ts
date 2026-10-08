import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

/**
 * O Chrome do Android tem o "modo escuro automático para sites": inverte as cores de páginas que não declaram cuidar do próprio tema.
 * Aqui o navegador roda com esse recurso LIGADO e o aparelho em tema escuro; o sistema precisa continuar claro.
 */
test.use({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark',
  launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--enable-features=WebContentsForceDark', '--force-dark-mode'] },
});

/** Cor de fundo efetiva do elemento (a lisa ou, se for degradê, a primeira cor), já como o navegador a pintou. */
const luminosidade = (el: Element) => {
  const cs = getComputedStyle(el);
  const fonte = /rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(cs.backgroundColor) ? cs.backgroundImage : cs.backgroundColor;
  const m = fonte.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return Number.NaN;                 // ainda em transição (cor ainda não resolvida): quem chama espera
  const c = m.slice(1).map(Number);
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
};

test.describe('celular com escurecimento automático de sites ligado', () => {
  test('a página declara que cuida do próprio tema (não é invertida pelo navegador)', async ({ page }) => {
    await page.goto('/entrar');
    expect(await page.locator('meta[name=color-scheme]').getAttribute('content')).toBe('only light');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light only');   // o navegador normaliza a ordem
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // faixa de marca escura e papel do formulário claro: se o navegador invertesse a página, o papel ficaria escuro
    await expect.poll(() => page.locator('.stage').evaluate(luminosidade)).toBeLessThan(0.5);
    await expect.poll(() => page.locator('.auth-side').evaluate(luminosidade)).toBeGreaterThan(0.85);
  });

  test('conteúdo continua claro e as faixas azul-noite; tema escuro só quando a pessoa escolhe', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await expect.poll(() => page.locator('.mobilebar').evaluate(luminosidade)).toBeLessThan(0.5);
    await expect.poll(() => page.locator('.bottomnav').evaluate(luminosidade)).toBeLessThan(0.5);
    await expect.poll(() => page.locator('body').evaluate(luminosidade)).toBeGreaterThan(0.8);             // o conteúdo continua claro
    await expect.poll(() => page.locator('.card').first().evaluate(luminosidade)).toBeGreaterThan(0.9);
    await page.getByRole('button', { name: 'Abrir menu' }).first().click();
    await expect.poll(() => page.locator('.side.open').evaluate(luminosidade)).toBeLessThan(0.5);
    // escolha explícita do escuro: o sistema passa a declarar suporte a escuro
    await page.evaluate(() => localStorage.setItem('ge.tema', 'escuro'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.locator('meta[name=color-scheme]').getAttribute('content')).toBe('dark light');
  });

  test('janelas (modais) cobrem a tela inteira do aparelho, mesmo com a página longa', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/documentos');
    await page.getByRole('button', { name: 'Enviar documentos' }).click();
    const vp = page.viewportSize()!;
    await expect.poll(async () => { const r = await page.locator('.overlay').boundingBox(); return r ? [r.x, r.y, r.width, r.height] : null; }).toEqual([0, 0, vp.width, vp.height]);
    // a janela está à vista (depois de entrar com a animação), não lá embaixo na página
    await expect.poll(async () => { const m = (await page.locator('.modal').boundingBox())!; return m.y >= 0 && m.y + m.height <= vp.height + 1; }).toBe(true);
  });
});
