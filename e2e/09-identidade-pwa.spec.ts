import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

test.describe('identidade visual e aplicativo instalável', () => {
  test('tela de entrada mostra a marca e o crédito discreto, sem frases de apresentação', async ({ page }) => {
    await page.goto('/entrar');
    const painel = page.locator('.stage');
    await expect(painel.locator('.stage-mark svg')).toBeVisible();
    await expect(painel.locator('.arte-ge')).toBeAttached();                       // arte de fundo do painel azul
    await expect(painel.getByText('Sistema desenvolvido pela Nexutec')).toBeVisible();
    expect(await painel.locator('svg').evaluateAll(els => els.filter(e => e.closest('.stage-credito')).length)).toBe(0);   // crédito só em texto, sem logo
    // o painel azul não tem parágrafos de texto além do crédito
    expect(await painel.locator('p').allTextContents()).toEqual(['Sistema desenvolvido pela Nexutec']);
    // lado do formulário: arte discreta e selos, sem texto
    const arte = page.locator('.auth-arte');
    await expect(arte).toBeAttached();
    await expect(arte).toHaveAttribute('aria-hidden', 'true');
    expect((await arte.textContent())?.trim()).toBe('');
    await expect(page.locator('.aa-selos .s')).toHaveCount(3);
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

  test('tela de ponto: mostrador com semana, hoje em destaque e régua do dia', async ({ page }) => {
    await relogio(page, '07:30');                                                    // quarta-feira, 10/06/2026
    await page.goto('/ponto/silva-ribeiro');
    const semana = page.getByRole('list', { name: 'Semana atual' });
    await expect(semana.getByRole('listitem')).toHaveCount(7);
    await expect(semana.locator('li.hoje')).toHaveText('Qua10');
    await expect(semana.locator('li').first()).toHaveText('Seg08');
    await expect(page.getByRole('img', { name: '7 horas e 30 minutos do dia' })).toBeVisible();
    await expect(page.locator('.stage .arte-bezel')).toBeAttached();                 // bisel do relógio atrás da hora
    await expect(page.locator('.auth-card')).toBeVisible();
  });

  test('painel azul tem arte e peças temáticas e nenhum texto de apresentação', async ({ page }) => {
    await page.goto('/entrar');
    const arte = page.locator('.stage-arte');
    await expect(arte.locator('.arte-bezel line')).toHaveCount(120);
    await expect(arte.locator('.arte-sat')).toHaveCount(4);
    await expect(arte.locator('.arte-particulas i')).toHaveCount(15);
    expect((await arte.textContent())?.trim()).toBe('');                              // arte puramente visual
    await expect(arte).toHaveAttribute('aria-hidden', 'true');
  });
});
