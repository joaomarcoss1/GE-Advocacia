import { expect, test } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

test.describe('PDF e Excel da folha e verificação pública do documento', () => {
  test('PDF recebe selo registrado e /verificar confirma a autenticidade', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/folha');
    await page.locator('input[type=month]').fill('2026-05');
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    const arquivo = await dl;
    expect(arquivo.suggestedFilename()).toMatch(/\.pdf$/i);
    const docs = await page.evaluate(() => JSON.parse(localStorage.getItem('ge.v1.documentos') || '[]') as { codigo: string; tipo: string; escritorio?: string }[]);
    expect(docs).toHaveLength(1);
    expect(docs[0].tipo).toBe('folha');
    expect(docs[0].escritorio).toBe('Silva & Ribeiro Advogados');
    // qualquer pessoa, sem login, confere o código
    await page.evaluate(() => localStorage.removeItem('ge.v1.sessao'));
    await page.goto(`/verificar/${docs[0].codigo}`);
    await expect(page.getByText('Documento autêntico')).toBeVisible();
    await expect(page.getByText('Silva & Ribeiro Advogados').first()).toBeVisible();
    await page.goto('/verificar/0000-0000-0000');
    await expect(page.getByText('Código não encontrado')).toBeVisible();
  });

  test('Excel avisa da confidencialidade e o download fica na auditoria', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/folha');
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    const aviso = page.getByRole('dialog');
    await expect(aviso).toContainText('CPF');
    await expect(aviso).toContainText('auditoria');
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await aviso.getByRole('button', { name: 'Baixar Excel' }).click();
    expect((await dl).suggestedFilename()).toMatch(/\.xlsx$/i);
    await page.goto('/painel/configuracoes?aba=auditoria');
    await expect(page.getByText('Folha exportada em Excel').first()).toBeVisible();
  });
});
