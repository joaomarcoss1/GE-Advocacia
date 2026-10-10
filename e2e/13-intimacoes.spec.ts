import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

test.describe('caixa de intimações (DJEN)', () => {
  test('busca, abre a intimação, lança o prazo em Tarefas e ela sai das pendentes', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/intimacoes');
    await expect(page.getByRole('heading', { name: 'Intimações' })).toBeVisible();
    await expect(page.getByText('Nenhuma intimação ainda')).toBeVisible();

    await page.getByRole('button', { name: 'Buscar no DJEN' }).click();
    await expect(page.getByText(/intimações? novas?/).first()).toBeVisible();
    const linhas = page.locator('tbody tr');
    await expect(linhas.first()).toBeVisible();
    const total = await linhas.count();
    expect(total).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Buscar no DJEN' }).click();                       // idempotente: nada repete
    await expect(page.getByText(/Nenhuma intimação nova/).first()).toBeVisible();
    await expect(linhas).toHaveCount(total);

    await linhas.first().click();
    const dlg = page.getByRole('dialog', { name: 'Intimação' });
    await expect(dlg.getByText('Texto da comunicação')).toBeVisible();
    await expect(dlg.getByText(/Vencimento:/)).toBeVisible();
    await dlg.getByRole('button', { name: 'Lançar prazo em Tarefas' }).click();
    await expect(page.getByText('Prazo lançado em Tarefas e na Agenda.')).toBeVisible();
    await expect(linhas).toHaveCount(total - 1);                                              // saiu das pendentes

    await page.getByRole('tab', { name: 'Tratadas' }).click();
    await expect(linhas).toHaveCount(1);
    await page.goto('/painel/tarefas');
    await expect(page.getByText(/Intimação:/).first()).toBeVisible();
  });

  test('coordenação vê e trata; o conteúdo do tribunal não pode ser alterado', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.coordA);
    await page.goto('/painel/intimacoes');
    await page.getByRole('button', { name: 'Buscar no DJEN' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.locator('tbody tr').first().click();
    const dlg = page.getByRole('dialog', { name: 'Intimação' });
    await dlg.getByRole('button', { name: 'Marcar como lida' }).click();
    await expect(page.getByRole('dialog', { name: 'Intimação' }).getByText('Lida')).toBeVisible();
  });
});
