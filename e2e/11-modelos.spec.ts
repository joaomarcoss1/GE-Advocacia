import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

test.describe('modelos de documentos e listas por tipo de processo', () => {
  test('o administrador carrega os modelos padrão, preenche um com dados reais e baixa em Word', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/modelos');
    await expect(page.getByRole('heading', { name: 'Modelos' })).toBeVisible();
    await expect(page.getByText('A biblioteca de modelos está vazia')).toBeVisible();

    await page.getByRole('button', { name: 'Carregar modelos padrão' }).first().click();
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(page.getByText(/modelos adicionados/)).toBeVisible();
    await page.getByLabel('Buscar modelo').fill('contrato de honorários');
    await expect(page.locator('tr', { hasText: 'Contrato de honorários advocatícios' })).toBeVisible();

    await page.locator('tr', { hasText: 'Contrato de honorários advocatícios' }).getByRole('button', { name: 'Usar' }).click();
    const dlg = page.getByRole('dialog', { name: 'Contrato de honorários advocatícios' });
    await dlg.getByLabel('Cliente').selectOption({ label: 'Maria Souza' });
    await dlg.getByLabel('Valor dos honorários (R$)').fill('6.000,00');
    await expect(dlg.getByLabel('Prévia do documento')).toContainText('Maria Souza');
    await expect(dlg.getByLabel('Prévia do documento')).toContainText('R$ 6.000,00');
    await expect(dlg.getByLabel('Prévia do documento')).toContainText('seis mil reais');
    const baixa = page.waitForEvent('download');
    await dlg.getByRole('button', { name: 'Baixar em Word' }).click();
    const arq = await baixa;
    expect(arq.suggestedFilename()).toMatch(/Contrato-de-honorarios.*\.docx$/);
  });

  test('a gestão carrega as listas padrão e cria uma lista nova', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/modelos');
    await page.getByRole('tab', { name: /Listas de documentos/ }).click();
    await page.getByRole('button', { name: 'Carregar listas padrão' }).click();
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(page.getByText(/listas adicionadas/)).toBeVisible();
    await expect(page.locator('tr', { hasText: 'Reclamação trabalhista – empregado' })).toBeVisible();
    await page.getByRole('button', { name: 'Nova lista' }).click();
    const nova = page.getByRole('dialog', { name: 'Nova lista de documentos' });
    await nova.getByLabel('Nome da lista').fill('Minha lista de teste');
    await nova.getByLabel('Documento 1').fill('RG e CPF');
    await nova.getByRole('button', { name: 'Salvar lista' }).click();
    await expect(page.locator('tr', { hasText: 'Minha lista de teste' })).toBeVisible();
  });

  test('coordenação vê e usa os modelos, mas não tem botões de gestão', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.coordA);
    await page.goto('/painel/modelos');
    await expect(page.getByRole('heading', { name: 'Modelos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo modelo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Carregar modelos padrão' })).toHaveCount(0);
  });
});
