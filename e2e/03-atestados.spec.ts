import { expect, test } from '@playwright/test';
import { CONTAS, PIN, entrar, identificar, relogio, semear } from './util';

const PDF = { name: 'atestado.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 ${'conteudo '.repeat(20)}`) };

async function enviarAtestado(page: import('@playwright/test').Page, busca: string, pin: string) {
  await identificar(page, 'silva-ribeiro', busca, pin);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: /Enviar atestado/ }).click();
  await page.getByTestId('anexo-input').setInputFiles(PDF);
  await expect(page.getByText('atestado.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar para análise' }).click();
  await expect(page.getByText(/Atestado enviado/)).toBeVisible();
}

test.describe('atestados: envio pelo funcionário e decisão do administrador', () => {
  test('aceito paga o dia; recusado desconta; cada abertura do arquivo fica registrada', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await enviarAtestado(page, 'rafael', PIN.rafael);
    await enviarAtestado(page, 'juliana', '902716');

    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/ocorrencias');
    const fila = page.getByRole('region', { name: 'Aguardando análise' });
    const atestado = (nome: string) => fila.locator('article', { hasText: nome }).filter({ hasText: 'Falta com justificativa' });
    await expect(atestado('Rafael')).toBeVisible();
    await expect(atestado('Juliana')).toBeVisible();

    // abre o anexo (fica registrado)
    const download = page.waitForEvent('download');
    await atestado('Rafael').locator('.anexo-chip').click();
    expect((await download).suggestedFilename()).toBe('atestado.pdf');

    await atestado('Rafael').getByRole('button', { name: 'Aceitar' }).click();
    await atestado('Juliana').getByRole('button', { name: 'Recusar' }).click();
    await page.getByRole('dialog').getByLabel(/Motivo da recusa/).fill('Atestado sem data');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar recusa' }).click();

    const linhaR = page.locator('table.tbl tr', { hasText: 'Rafael Costa Ribeiro' }).filter({ hasText: 'enviado pelo funcionário' });
    const linhaJ = page.locator('table.tbl tr', { hasText: 'Juliana Ferreira Nunes' }).filter({ hasText: 'enviado pelo funcionário' });
    await expect(linhaR).toContainText('Aceita');
    await expect(linhaR).toContainText('Sem desconto');
    await expect(linhaJ).toContainText('Recusada');
    await expect(linhaJ).toContainText('Descontado');
    await expect(linhaJ).toContainText('Recusa: Atestado sem data');

    // rastro: quem abriu o atestado
    await page.goto('/painel/configuracoes?aba=privacidade');
    await expect(page.getByText('Acessos a documentos sensíveis')).toBeVisible();
    await expect(page.locator('table.tbl').getByText(CONTAS.adminA.email)).toBeVisible();
    await expect(page.locator('table.tbl').getByText('Rafael Costa Ribeiro')).toBeVisible();
  });

  test('a gerência vê a fila mas não decide nem abre anexos', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await enviarAtestado(page, 'rafael', PIN.rafael);
    await entrar(page, CONTAS.gerenteA);
    await page.goto('/painel/ocorrencias');
    const fila = page.getByRole('region', { name: 'Aguardando análise' });
    await expect(fila.getByText('Decisão do administrador').first()).toBeVisible();
    await expect(fila.getByRole('button', { name: 'Aceitar' })).toHaveCount(0);
    await expect(fila.getByText('Anexos visíveis ao administrador').first()).toBeVisible();
  });
});
