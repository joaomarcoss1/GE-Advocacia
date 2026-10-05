import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio } from './util';

test.describe('login, perfis e isolamento entre escritórios', () => {
  test.beforeEach(async ({ page }) => relogio(page, '09:00'));

  test('administrador vê salários e folha; o painel mostra SÓ o escritório dele', async ({ page }) => {
    await entrar(page, CONTAS.adminA);
    await expect(page.locator('.escritorio-card')).toContainText('Silva & Ribeiro Advogados');
    await expect(page.getByRole('link', { name: 'Folha de pagamento' })).toBeVisible();
    await page.goto('/painel/funcionarios');
    const tabela = page.locator('table.tbl');
    await expect(tabela.getByText('Carlos Eduardo Silva')).toBeVisible();
    await expect(page.getByText('Helena Monteiro Costa')).toHaveCount(0);
    await expect(tabela.getByText('R$ 9.000,00')).toBeVisible();
  });

  test('o outro escritório tem outra equipe e não enxerga a primeira', async ({ page }) => {
    await entrar(page, CONTAS.adminB);
    await expect(page.locator('.escritorio-card')).toContainText('Monteiro Costa Advocacia');
    await page.goto('/painel/funcionarios');
    await expect(page.locator('table.tbl').getByText('Helena Monteiro Costa')).toBeVisible();
    await expect(page.getByText('Carlos Eduardo Silva')).toHaveCount(0);
    await page.goto('/painel/folha');
    await page.locator('input[type=month]').fill('2026-05');
    await expect(page.locator('.tbl').getByText('Fechada')).toHaveCount(0);   // só o escritório A tem mês fechado
  });

  test('gerência não vê salário nem folha e é redirecionada ao tentar abrir', async ({ page }) => {
    await entrar(page, CONTAS.gerenteA);
    await expect(page.getByRole('link', { name: 'Folha de pagamento' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Funcionários' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Configurações' })).toHaveCount(0);
    await page.goto('/painel/folha');
    await expect(page).toHaveURL(/\/painel\/gerencia/);
    await page.goto('/painel/funcionarios');
    await expect(page).toHaveURL(/\/painel\/gerencia/);
  });

  test('a plataforma cria um escritório novo, que nasce vazio e independente', async ({ page }) => {
    await entrar(page, CONTAS.plataforma);
    await expect(page.getByRole('heading', { name: 'Escritórios' })).toBeVisible();
    await page.getByRole('button', { name: /Novo escritório/ }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Nome do escritório').fill('Teixeira & Lopes Advocacia');
    await expect(modal.getByLabel(/Endereço do ponto/)).toHaveValue('teixeira-e-lopes-advocacia');
    await modal.getByLabel('Nome', { exact: true }).fill('Tânia Teixeira');
    await modal.getByLabel('E-mail').fill('tania@teixeiralopes.adv.br');
    await modal.getByLabel('Senha inicial').fill('senhaSegura2026');
    await modal.getByRole('button', { name: 'Criar escritório' }).click();
    await expect(page.locator('.tenant', { hasText: 'Teixeira & Lopes Advocacia' })).toBeVisible();
    // a plataforma não tem rota para os dados do escritório
    await page.goto('/painel');
    await expect(page).toHaveURL(/\/plataforma/);
    await page.getByRole('button', { name: 'Sair' }).click();
    // o administrador novo entra só no escritório dele, vazio
    await entrar(page, { email: 'tania@teixeiralopes.adv.br', senha: 'senhaSegura2026' });
    await expect(page.locator('.escritorio-card')).toContainText('Teixeira & Lopes');
    await page.goto('/painel/funcionarios');
    await expect(page.getByText('Sua equipe começa aqui')).toBeVisible();
    // e a tela de ponto dele não acha ninguém dos outros escritórios
    await page.goto('/ponto/teixeira-e-lopes-advocacia');
    await page.getByLabel('Digite seu nome').fill('carlos');
    await expect(page.getByText('Nenhum resultado')).toBeVisible();
  });

  test('escritório suspenso: ponto bloqueado e login recusado', async ({ page }) => {
    await entrar(page, CONTAS.plataforma);
    const cartao = page.locator('.tenant', { hasText: 'Monteiro Costa Advocacia' });
    await cartao.getByRole('button', { name: 'Suspender' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Suspender' }).click();
    await expect(cartao.getByText('Suspenso')).toBeVisible();
    await page.goto('/ponto/monteiro-costa');
    await expect(page.getByRole('heading', { name: 'Acesso suspenso' })).toBeVisible();
    await page.goto('/entrar');
    await page.getByRole('button', { name: 'Sair' }).click().catch(() => undefined);
    await page.evaluate(() => localStorage.removeItem('ge.v1.sessao'));
    await page.goto('/entrar');
    await page.locator('#email').fill(CONTAS.adminB.email);
    await page.locator('#senha').fill(CONTAS.adminB.senha);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/suspenso/i);
  });

  test('endereço de ponto inexistente mostra mensagem clara', async ({ page }) => {
    await page.goto('/ponto/nao-existe-aqui');
    await expect(page.getByRole('heading', { name: 'Escritório não encontrado' })).toBeVisible();
  });
});
