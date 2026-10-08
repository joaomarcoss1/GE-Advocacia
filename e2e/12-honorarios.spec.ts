import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

test.describe('precificação de honorários', () => {
  test('o administrador cadastra os custos, simula um caso de 4 meses e salva a proposta', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/honorarios');
    await expect(page.getByRole('heading', { name: 'Honorários' })).toBeVisible();
    await expect(page.getByText(/Nenhum custo fixo cadastrado/)).toBeVisible();

    await page.getByRole('tab', { name: 'Parâmetros do escritório' }).click();
    await page.getByRole('button', { name: 'Adicionar contas comuns' }).click();
    await page.getByRole('button', { name: 'Importar folha do sistema' }).click();
    await expect(page.getByText(/Folha importada/)).toBeVisible();
    await page.getByLabel('Valor mensal de Aluguel e condomínio').fill('3.500,00');
    await page.getByLabel('Valor mensal de Energia elétrica').fill('600');
    await page.getByRole('button', { name: 'Salvar parâmetros' }).click();
    await expect(page.getByText('Parâmetros salvos.')).toBeVisible();

    await page.getByRole('tab', { name: 'Simulador' }).click();
    await expect(page.getByText(/Nenhum custo fixo cadastrado/)).toHaveCount(0);
    await page.getByLabel('Duração em meses').fill('4');
    const antes = await page.locator('.preco-grande').innerText();
    expect(antes).toMatch(/R\$/);
    await page.getByLabel('Chance de êxito').fill('70');
    await page.getByLabel('Valor da causa').fill('50.000');
    await expect(page.getByText(/Custas iniciais TJMA/)).toBeVisible();

    await page.getByRole('button', { name: 'Salvar proposta' }).click();
    const dlg = page.getByRole('dialog', { name: 'Salvar proposta' });
    await dlg.getByLabel('Cliente').selectOption({ label: 'Maria Souza' });
    await dlg.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Proposta salva.')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Propostas \(1\)/ })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'Maria Souza' })).toBeVisible();
  });

  test('só o administrador vê honorários: gerência e coordenação não têm o menu nem a rota', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.gerenteA);
    await expect(page.getByRole('link', { name: 'Honorários' })).toHaveCount(0);
    await page.goto('/painel/honorarios');
    await expect(page.getByRole('heading', { name: 'Honorários' })).toHaveCount(0);
  });
});
