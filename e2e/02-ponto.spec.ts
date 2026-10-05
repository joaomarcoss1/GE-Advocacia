import { expect, test, type Page } from '@playwright/test';
import { PIN, digitarPin, identificar, irPara, relogio, semear } from './util';

const marcacoesDe = (page: Page, nome: string, tipo: string) => page.evaluate(([n, t]) => {
  const fs = JSON.parse(localStorage.getItem('ge.v1.e.silva-ribeiro.funcionarios') || '[]') as { id: string; nome: string }[];
  const f = fs.find(x => x.nome.includes(n))!;
  const rs = JSON.parse(localStorage.getItem('ge.v1.e.silva-ribeiro.registros') || '[]') as { funcionario_id: string; data: string; tipo: string; status_aprovacao: string }[];
  return rs.filter(r => r.funcionario_id === f.id && r.data === '2026-06-10' && r.tipo === t && r.status_aprovacao !== 'rejeitado').length;
}, [nome, tipo]);

test.describe('ponto por PIN', () => {
  test.beforeEach(async ({ page }) => { await relogio(page, '07:30'); });

  test('registra a entrada no horário e mostra o comprovante na tela', async ({ page }) => {
    await semear(page);                                // dados de demonstração nascem com o relógio das 07:30
    await irPara(page, '08:02');
    await identificar(page, 'silva-ribeiro', 'pedro', PIN.pedro);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Pedro Henrique Araújo')).toBeVisible();
    await page.getByRole('button', { name: /Entrada/ }).click();
    await page.getByRole('button', { name: 'Confirmar registro' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Entrada registrada às 08:02' })).toBeVisible();
    expect(await marcacoesDe(page, 'Pedro', 'entrada')).toBe(1);
  });

  test('PIN errado é recusado e após 5 erros a pessoa fica bloqueada', async ({ page }) => {
    await semear(page);
    await irPara(page, '08:02');
    for (let i = 0; i < 5; i++) {
      await identificar(page, 'silva-ribeiro', 'carlos', '000001');
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByRole('alert')).toContainText('PIN incorreto');
    }
    await identificar(page, 'silva-ribeiro', 'carlos', PIN.carlos);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('alert')).toContainText('Muitas tentativas');
    // outra pessoa do mesmo escritório não é afetada
    await identificar(page, 'silva-ribeiro', 'mariana', PIN.mariana);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Mariana Sousa Lima')).toBeVisible();
  });

  test('duplo toque em "Confirmar" gera UMA só marcação', async ({ page }) => {
    await semear(page);
    await irPara(page, '08:01');
    await identificar(page, 'silva-ribeiro', 'rafael', PIN.rafael);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: /Entrada/ }).click();
    await page.getByRole('button', { name: 'Confirmar registro' }).dblclick();
    await expect(page.getByRole('status').filter({ hasText: 'Entrada registrada' })).toBeVisible();
    expect(await marcacoesDe(page, 'Rafael', 'entrada')).toBe(1);
  });

  test('atraso exige justificativa e vai para análise do administrador', async ({ page }) => {
    await semear(page);
    await irPara(page, '09:10');
    await identificar(page, 'silva-ribeiro', 'carlos', PIN.carlos);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: /Entrada/ }).click();
    await expect(page.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled();
    await page.getByLabel(/Justificativa/).fill('Audiência no fórum');
    await page.getByRole('button', { name: 'Confirmar registro' }).click();
    await expect(page.getByText(/análise do administrador/).first()).toBeVisible();
  });

  test('não há como digitar o PIN de outro escritório', async ({ page }) => {
    await semear(page);
    await page.goto('/ponto/monteiro-costa');
    await irPara(page, '08:02');
    await page.getByLabel('Digite seu nome').fill('carlos');
    await expect(page.getByText('Nenhum resultado')).toBeVisible();   // Carlos é do escritório Silva & Ribeiro
    await page.getByLabel('Digite seu nome').fill('helena');
    await page.getByRole('button', { name: /Selecionar/ }).first().click();
    await digitarPin(page, PIN.carlos);                                // PIN de outro escritório
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('alert')).toContainText('PIN incorreto');
  });
});
