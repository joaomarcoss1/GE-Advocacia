import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CONTAS, baterPonto, entrar, irPara, relogio, semear } from './util';

const JULIANA = { email: 'juliana@silvaribeiro.adv.br', senha: 'silva2026juliana', pin: '902716' };

test.describe('aviso de cookies e política', () => {
  test.use({ storageState: { cookies: [], origins: [] } });                       // contexto limpo: o aviso ainda não foi lido
  test('aparece na primeira visita, some depois de "Entendi" e a política lista o que é guardado', async ({ page }) => {
    await page.goto('/entrar');
    const aviso = page.getByTestId('aviso-cookies');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('Não usamos cookies de publicidade');
    const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(ax.violations.map(v => v.id)).toEqual([]);                              // o aviso também é acessível
    await aviso.getByRole('button', { name: 'Entendi' }).click();
    await expect(aviso).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('aviso-cookies')).toHaveCount(0);
    await page.goto('/cookies');
    await expect(page.getByRole('heading', { name: 'Cookies e armazenamento no seu aparelho' })).toBeVisible();
    await expect(page.getByRole('table', { name: /Itens guardados no aparelho/ })).toContainText('ge.tema');
    expect(await page.evaluate(() => document.cookie)).toBe('');                    // o sistema não grava cookies próprios
  });
});

test.describe('ataques pela tela', () => {
  test.beforeEach(async ({ page }) => { await relogio(page, '07:30'); await semear(page); });

  test('conteúdo malicioso digitado vira texto: nenhum script roda', async ({ page }) => {
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/processos');
    await page.evaluate(() => { (window as unknown as { __xss?: number }).__xss = 0; });      // depois da navegação: a página não recarrega mais
    await page.getByRole('tab', { name: /Clientes/ }).click();
    await page.getByRole('button', { name: /Novo cliente/ }).click();
    const dlg = page.getByRole('dialog');
    const veneno = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    await dlg.getByLabel(/^Nome/).first().fill(veneno);
    await dlg.getByRole('button', { name: /Salvar|Cadastrar|Criar/ }).click();
    await expect(page.getByText(veneno, { exact: false }).first()).toBeVisible();   // aparece como texto
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBe(0);
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });

  test('força bruta no login: depois de 5 erros, nem a senha certa entra', async ({ page }) => {
    await page.goto('/entrar');
    for (let i = 0; i < 5; i++) {
      await page.locator('#email').fill(CONTAS.adminA.email);
      await page.locator('#senha').fill(`errada-${i}-xyz`);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(/incorretos|Muitas tentativas/);
    }
    await page.locator('#senha').fill(CONTAS.adminA.senha);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Muitas tentativas incorretas');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('sem login, o painel e as rotas internas mandam para a entrada', async ({ page }) => {
    for (const rota of ['/painel', '/painel/folha', '/painel/acessos', '/painel/processos', '/plataforma']) {
      await page.goto(rota);
      await expect(page).toHaveURL(/\/entrar/);
    }
  });

  test('trocar o papel guardado no navegador não eleva o acesso', async ({ page }) => {
    await irPara(page, '08:02');
    await baterPonto(page, 'juliana', JULIANA.pin, /^Entrada$/);
    await expect(page.getByRole('heading', { name: 'Meu espaço' })).toBeVisible();
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ge.v1.sessao')!); s.papel = 'admin'; localStorage.setItem('ge.v1.sessao', JSON.stringify(s)); });
    await page.goto('/painel/folha');
    await expect(page.getByRole('heading', { name: 'Meu espaço' })).toBeVisible();
    await page.goto('/painel/acessos');
    await expect(page.getByRole('heading', { name: 'Meu espaço' })).toBeVisible();
  });

  test('tablet compartilhado (quiosque) nunca abre o sistema; gerência não entra só por PIN', async ({ page }) => {
    await irPara(page, '08:02');
    await baterPonto(page, 'juliana', JULIANA.pin, /^Entrada$/, 'silva-ribeiro', '?quiosque=1');
    await expect(page.getByRole('status').filter({ hasText: 'Entrada registrada' })).toBeVisible();
    await expect(page.getByTestId('entrando-no-sistema')).toHaveCount(0);
    await expect(page).toHaveURL(/\/ponto\//);
    expect(await page.evaluate(() => localStorage.getItem('ge.v1.sessao'))).toBeNull();

    await page.evaluate(() => localStorage.removeItem('ge.quiosque'));
    await baterPonto(page, 'mariana', '739105', /^Entrada$/);
    await expect(page.getByRole('status').filter({ hasText: 'Entrada registrada' })).toBeVisible();
    await expect(page.getByText('O seu nível entra no sistema com e-mail e senha.')).toBeVisible();
    await expect(page).toHaveURL(/\/ponto\//);
    expect(await page.evaluate(() => localStorage.getItem('ge.v1.sessao'))).toBeNull();
  });
});
