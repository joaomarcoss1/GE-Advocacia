import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

test.describe('identidade visual e aplicativo instalável', () => {
  test('tela de entrada mostra a marca e o crédito discreto, sem frases de apresentação', async ({ page }) => {
    await page.goto('/entrar');
    const painel = page.locator('.stage');
    await expect(painel.locator('.stage-emblema svg')).toBeVisible();              // selo da marca no painel azul
    await expect(painel.getByText('Sistema desenvolvido pela Nexutec')).toBeVisible();
    expect(await painel.locator('svg').evaluateAll(els => els.filter(e => e.closest('.stage-credito')).length)).toBe(0);   // crédito só em texto, sem logo
    // o painel azul não tem parágrafos de texto além do crédito
    expect(await painel.locator('p').allTextContents()).toEqual(['Sistema desenvolvido pela Nexutec']);
    // pórtico de fórum em linha fina (seis colunas) e selo da marca; arte só visual
    const arte = page.locator('.stage-arte');
    await expect(arte).toHaveAttribute('aria-hidden', 'true');
    await expect(arte.locator('svg.forum > g')).toHaveCount(6);
    await expect(arte.locator('.stage-emblema svg')).toBeAttached();
    expect((await arte.textContent())?.trim()).toBe('');
    // lado do formulário: papel timbrado com selo (sem ícones decorativos soltos)
    await expect(page.locator('.auth-side .aa-selos')).toHaveCount(0);
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
    expect(m).toMatchObject({ name: 'GE Advocacia', display: 'standalone', scope: '/', lang: 'pt-BR', theme_color: '#0f2a52' });
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
    await expect(page.locator('.stage svg.forum')).toBeAttached();                   // pórtico discreto ao fundo
    await expect(page.locator('.auth-card')).toBeVisible();
  });

  test('o sistema abre em tema claro mesmo com o aparelho no escuro; escuro só por escolha', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto('/entrar');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.evaluate(() => localStorage.setItem('ge.tema', 'escuro'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await ctx.close();
  });

  test('celular: dois tons, faixas azul-noite emoldurando o conteúdo claro', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });   // aparelho no tema escuro
    const page = await ctx.newPage();
    await relogio(page, '09:00');
    await semear(page);
    // luminosidade do fundo: usa a cor lisa ou, se o fundo é degradê, a primeira cor dele
    const luminosidade = (el: Element) => {
      const cs = getComputedStyle(el);
      const fonte = /rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(cs.backgroundColor) ? cs.backgroundImage : cs.backgroundColor;
      const c = fonte.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)!.slice(1).map(Number);
      return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    };
    await page.goto('/entrar');
    expect(await page.locator('.stage').evaluate(luminosidade)).toBeLessThan(0.5);        // faixa de marca escura
    expect(await page.locator('.auth-side').evaluate(luminosidade)).toBeGreaterThan(0.85); // formulário em papel claro
    await entrar(page, CONTAS.adminA);
    expect(await page.locator('.mobilebar').evaluate(luminosidade)).toBeLessThan(0.5);    // cabeçalho escuro
    expect(await page.locator('.bottomnav').evaluate(luminosidade)).toBeLessThan(0.5);    // atalhos escuros
    // bloco de título escuro: o título é branco (o fundo é um degradê azul-noite com brilho dourado no canto)
    expect(await page.locator('.page-title').evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('body').evaluate(luminosidade)).toBeGreaterThan(0.8);       // conteúdo claro
    expect(await page.locator('.card').first().evaluate(luminosidade)).toBeGreaterThan(0.9);   // cartões brancos
    await page.getByRole('button', { name: 'Abrir menu' }).first().click();
    expect(await page.locator('.side.open').evaluate(luminosidade)).toBeLessThan(0.5);    // menu lateral escuro
    await ctx.close();
  });

  test('botão de instalar tem o estilo de link da página, não o de botão do navegador', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(e);
    });
    const estilo = await page.getByRole('button', { name: 'Instalar aplicativo' }).evaluate(el => { const c = getComputedStyle(el); return { fundo: c.backgroundColor, borda: c.borderTopWidth }; });
    expect(estilo).toEqual({ fundo: 'rgba(0, 0, 0, 0)', borda: '0px' });
  });
});
