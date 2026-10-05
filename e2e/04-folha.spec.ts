import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

test.describe('folha: fechamento congela o período; reabrir exige motivo', () => {
  test('marcação de mês fechado não pode ser editada; reabrir com motivo libera', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);

    // maio/2026 já nasce fechado no escritório de demonstração
    await page.goto('/painel/ponto');
    await page.getByLabel('De', { exact: true }).fill('2026-05-01');
    await page.getByLabel('Até', { exact: true }).fill('2026-05-31');
    const lapis = page.getByRole('button', { name: /Corrigir marcação de Carlos/ }).first();
    await expect(lapis).toBeDisabled();
    await expect(lapis).toHaveAttribute('title', /Período com folha fechada/);
    await expect(page.getByRole('button', { name: 'Excluir marcação' }).first()).toBeDisabled();

    await page.goto('/painel/folha');
    await page.locator('input[type=month]').fill('2026-05');
    const linha = page.locator('table.tbl tr', { hasText: 'Carlos Eduardo Silva' });
    await expect(linha).toContainText('Fechada');
    await linha.getByRole('button', { name: 'Detalhes' }).click();
    const detalhe = page.getByRole('dialog');
    await expect(detalhe.getByRole('button', { name: /Ajuste/ })).toBeDisabled();
    await detalhe.getByRole('button', { name: 'Reabrir folha' }).click();

    const pergunta = page.getByRole('dialog').last();
    const confirmar = pergunta.getByRole('button', { name: 'Reabrir folha' });
    await expect(confirmar).toBeDisabled();                       // motivo é obrigatório
    await pergunta.getByLabel('Motivo da reabertura').fill('abc');
    await expect(confirmar).toBeDisabled();                       // mínimo de 5 caracteres
    await pergunta.getByLabel('Motivo da reabertura').fill('Atestado entregue depois do fechamento');
    await confirmar.click();
    await expect(linha).not.toContainText('Fechada');

    // a edição volta a ser possível e o motivo ficou na auditoria
    await page.goto('/painel/ponto');
    await page.getByLabel('De', { exact: true }).fill('2026-05-01');
    await page.getByLabel('Até', { exact: true }).fill('2026-05-31');
    await expect(page.getByRole('button', { name: /Corrigir marcação de Carlos/ }).first()).toBeEnabled();
    await page.goto('/painel/configuracoes?aba=auditoria');
    await expect(page.getByText('Folha reaberta').first()).toBeVisible();
    await expect(page.getByText(/Atestado entregue depois do fechamento/).first()).toBeVisible();
  });

  test('o mês em andamento não pode ser fechado', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/folha');
    await expect(page.getByRole('button', { name: 'Fechar folha' })).toBeDisabled();
  });
});
