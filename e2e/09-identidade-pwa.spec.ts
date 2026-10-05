import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

test.describe('identidade visual e aplicativo instalável', () => {
  test('tela de entrada mostra a marca e o crédito discreto, sem frases de apresentação', async ({ page }) => {
    await page.goto('/entrar');
    const painel = page.locator('.stage');
    await expect(painel.locator('.stage-mark svg')).toBeVisible();
    await expect(painel.locator('.arte-ge')).toBeAttached();                       // arte de fundo do painel azul
    await expect(painel.getByText('Desenvolvido por')).toBeVisible();
    await expect(painel.getByText('Nexutec', { exact: true })).toBeVisible();
    // o painel azul não tem parágrafos de texto além do crédito
    expect(await painel.locator('p').allTextContents()).toEqual(['Desenvolvido porNexutec']);
  });

  test('no celular o crédito vai para o rodapé da página e a marca fica no topo', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('/entrar');
    await expect(page.locator('.stage-mark svg')).toBeVisible();
    await expect(page.locator('.credito-pagina')).toBeVisible();
    await expect(page.locator('.stage-credito')).toBeHidden();
    await ctx.close();
  });

  test('manifest completo, ícones existentes e arquivos do modo offline publicados', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    const m = await (await request.get(href!)).json();
    expect(m).toMatchObject({ name: 'GE Advocacia', display: 'standalone', scope: '/', lang: 'pt-BR', theme_color: '#0f1c2e' });
    const propositos = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`);
    expect(propositos).toEqual(expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']));
    for (const i of m.icons.filter((x: { type: string }) => x.type === 'image/png')) {
      const r = await request.get(i.src);
      expect(r.status(), i.src).toBe(200);
      expect(r.headers()['content-type']).toContain('image/png');
    }
    for (const arquivo of ['/sw.js', '/offline.html', '/icons/apple-touch-icon.png']) expect((await request.get(arquivo)).status(), arquivo).toBe(200);
    expect(await page.locator('link[rel=apple-touch-icon]').getAttribute('href')).toBe('/icons/apple-touch-icon.png');
    expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('viewport-fit=cover');
  });

  test('o botão de instalar só aparece quando o aparelho permite (nunca em branco)', async ({ page }) => {
    await page.goto('/entrar');
    await expect(page.getByRole('button', { name: 'Instalar aplicativo' })).toHaveCount(0);
    // simula o pedido de instalação do Chrome/Edge/Android
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    const botao = page.getByRole('button', { name: 'Instalar aplicativo' });
    await expect(botao).toBeVisible();
    await botao.click();
    await expect(page.getByText('Aplicativo instalado.')).toBeVisible();
    await expect(botao).toHaveCount(0);                                            // depois de instalar, some
  });

  test('sem conexão aparece o aviso e some ao voltar', async ({ page, context }) => {
    await page.goto('/entrar');
    await expect(page.getByText('Sem conexão.')).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByText(/Sem conexão\. Salvar e bater o ponto/)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText('Sem conexão.')).toHaveCount(0);
  });

  test('celular de 320 px: nenhuma tela pública nem do painel rola para o lado', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await relogio(page, '09:00');
    await semear(page);
    const sobra = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const rota of ['/', '/entrar', '/ponto/silva-ribeiro', '/verificar']) {
      await page.goto(rota); await page.waitForLoadState('networkidle');
      expect(await sobra(), rota).toBeLessThanOrEqual(1);
    }
    await entrar(page, CONTAS.adminA);
    for (const rota of ['/painel', '/painel/tarefas', '/painel/processos', '/painel/feriados', '/painel/folha']) {
      await page.goto(rota); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
      expect(await sobra(), rota).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });
});
