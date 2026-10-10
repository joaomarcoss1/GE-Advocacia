import { expect, test, type Page } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

const PDF = { name: 'procuracao.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') };
const EXE = { name: 'virus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00 isto nao e um pdf de verdade') };

/** Abre o dossiê pela linha do processo na tela Documentos (o título do diálogo é o nome do cliente). */
async function abrirDossieDoProcesso(page: Page, apelido: string, cliente: string) {
  await page.goto('/painel/documentos');
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await page.locator('tr', { hasText: apelido }).getByRole('button', { name: 'Abrir' }).click();
  return page.getByRole('dialog', { name: cliente });
}

test.describe('processos, documentos e backup', () => {
  test('cadastra processo com CNJ validado, consulta andamentos (simulados) e vê o histórico', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/processos');
    await expect(page.getByRole('heading', { name: 'Processos' })).toBeVisible();

    await page.getByRole('button', { name: 'Novo processo' }).click();
    const form = page.getByRole('dialog', { name: 'Novo processo' });
    await form.getByLabel('Número do processo').fill('0001234-78.2024.8.26.0001');             // dígito errado
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('dialog', { name: 'Novo processo' })).toBeVisible();            // não salvou
    await form.getByLabel('Número do processo').fill('00012347720248260001');
    await expect(form.getByLabel('Número do processo')).toHaveValue('0001234-77.2024.8.26.0001');
    await expect(form.getByText('Tribunal de Justiça de São Paulo (TJSP)')).toBeVisible();
    await form.getByLabel('Apelido do processo').fill('Teste x Exemplo');
    await form.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Maria Souza' });
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('dialog', { name: 'Novo processo' })).toHaveCount(0);
    const det = page.getByRole('dialog', { name: 'Teste x Exemplo' });                         // ao salvar, a ficha do processo abre sozinha
    await expect(det).toBeVisible();
    await expect(det.getByText('Consulta simulada (demonstração)')).toBeVisible();
    await page.keyboard.press('Escape');

    // mesmo número no mesmo escritório não duplica
    await page.getByRole('button', { name: 'Novo processo' }).click();
    const dup = page.getByRole('dialog', { name: 'Novo processo' });
    await dup.getByLabel('Número do processo').fill('00012347720248260001');
    await dup.getByRole('button', { name: 'Salvar' }).click();                                  // sem cliente: não salva
    await expect(page.getByText(/cliente/i).first()).toBeVisible();
    await dup.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Maria Souza' });
    await dup.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText(/já está cadastrado/i).first()).toBeVisible();
    await dup.getByRole('button', { name: 'Cancelar' }).click();

    await page.getByRole('button', { name: 'Teste x Exemplo' }).click();
    await expect(det).toBeVisible();
    await det.getByRole('button', { name: 'Atualizar andamentos' }).click();
    await expect(page.getByText(/andamentos? novos?/).first()).toBeVisible();
    await det.getByRole('button', { name: 'Registrar andamento' }).click();
    await det.getByLabel('O que aconteceu').fill('Intimação para réplica');
    await det.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(page.getByText('Andamento registrado.')).toBeVisible();
    await expect(det.getByText('Intimação para réplica')).toBeVisible();
  });

  test('envio em lote: categoria e item sugeridos, repetido desmarcado, reclassificar e biblioteca', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    const dossie = await abrirDossieDoProcesso(page, 'Beta x Delta Comercial', 'Indústria Beta Ltda');
    await dossie.getByLabel('Modelo de lista de documentos').selectOption({ label: 'Cível' });
    await dossie.getByRole('button', { name: 'Aplicar modelo' }).click();
    await expect(page.getByText(/itens adicionados|já estão na lista/)).toBeVisible();

    const peticao = { name: 'peticao inicial.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<< /Peca 1 >>endobj\ntrailer<<>>\n%%EOF\n') };
    await dossie.getByLabel('Escolher documentos para enviar').setInputFiles([{ ...PDF, name: 'procuracao.pdf' }, peticao, { ...peticao, name: 'peticao inicial - copia.pdf' }]);
    const lote = page.getByRole('dialog', { name: 'Enviar documentos' });
    await expect(lote.getByLabel('Categoria de procuracao.pdf')).toHaveValue('contrato');
    await expect(lote.getByLabel('Item da lista para procuracao.pdf').locator('option:checked')).toHaveText('Procuração assinada');
    await expect(lote.getByLabel('Categoria de peticao inicial.pdf')).toHaveValue('peticoes');
    await expect(lote.getByText('Repetido neste lote')).toBeVisible();
    await expect(lote.getByLabel('Enviar peticao inicial - copia.pdf')).not.toBeChecked();
    await lote.getByRole('button', { name: 'Salvar 2 documentos' }).click();
    await expect(page.getByText('2 documentos salvos.')).toBeVisible();

    // organizado por categoria; o documento do item já nasce na categoria certa
    await expect(dossie.getByText('03 · Petições e peças')).toBeVisible();
    await expect(dossie.getByLabel('Categoria de procuracao.pdf')).toHaveValue('contrato');

    // trocar a categoria muda o grupo
    await dossie.getByLabel('Categoria de peticao inicial.pdf').selectOption('provas');
    await expect(page.getByText('Movido para "Provas e anexos".')).toBeVisible();
    await expect(dossie.getByText('06 · Provas e anexos')).toBeVisible();

    // o mesmo arquivo de novo: avisa que já existe (e não envia sem querer)
    await dossie.getByLabel('Escolher documentos para enviar').setInputFiles(peticao);
    await expect(page.getByRole('dialog', { name: 'Enviar documentos' }).getByText('Já enviado antes')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Enviar documentos' }).getByLabel('Enviar peticao inicial.pdf')).not.toBeChecked();
    await page.getByRole('dialog', { name: 'Enviar documentos' }).locator('button.btn', { hasText: 'Fechar' }).click();

    // biblioteca: busca e filtro por categoria
    await page.goto('/painel/documentos');
    await page.getByRole('tab', { name: /Biblioteca/ }).click();
    await page.getByLabel('Buscar documentos').fill('peticao');
    await expect(page.locator('tbody tr', { hasText: 'peticao inicial.pdf' })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'procuracao.pdf' })).toHaveCount(0);
    await page.getByLabel('Buscar documentos').fill('');
    await page.getByLabel('Categoria', { exact: true }).selectOption('contrato');
    await expect(page.locator('tbody tr', { hasText: 'procuracao.pdf' })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'peticao inicial.pdf' })).toHaveCount(0);
  });

  test('checklist: envia arquivo ao item, recusa arquivo falso, gera link do cliente e o cliente envia pelo link', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    const dossie = await abrirDossieDoProcesso(page, 'Beta x Delta Comercial', 'Indústria Beta Ltda');

    await dossie.getByLabel('Modelo de lista de documentos').selectOption({ label: 'Cível' });
    await dossie.getByRole('button', { name: 'Aplicar modelo' }).click();
    await expect(page.getByText(/itens adicionados|já estão na lista/)).toBeVisible();

    const entrada = dossie.getByLabel('Enviar arquivo para Procuração assinada').first();
    await entrada.setInputFiles(EXE);                                                            // extensão .pdf, conteúdo falso
    await expect(page.getByText(/não é um PDF|conteúdo/i).first()).toBeVisible();
    await entrada.setInputFiles(PDF);
    await expect(page.getByText('Documento salvo.')).toBeVisible();
    await expect(dossie.getByText('procuracao.pdf').first()).toBeVisible();
    await dossie.getByRole('button', { name: 'Conferir' }).first().click();
    await expect(dossie.getByRole('button', { name: 'Conferido' }).first()).toBeVisible();

    // link para o cliente: o endereço aparece uma vez
    await dossie.getByRole('button', { name: 'Link para o cliente' }).click();
    const modalLink = page.getByRole('dialog', { name: 'Link para o cliente' });
    const url = await modalLink.getByLabel('Endereço do link').inputValue();
    expect(url).toMatch(/\/enviar\/[a-f0-9]{48}$/);
    await modalLink.locator('button.btn', { hasText: 'Fechar' }).click();

    // o cliente abre o link (sem login) e envia um documento
    const cliente = await page.context().newPage();
    await cliente.goto(new URL(url).pathname);
    await expect(cliente.getByRole('heading', { name: 'Envio de documentos' })).toBeVisible();
    await expect(cliente.getByText('Comprovante de residência').first()).toBeVisible();
    await expect(cliente.getByText('Procuração assinada').first()).toBeVisible();
    await cliente.getByLabel('Enviar arquivo: Comprovante de residência').setInputFiles({ ...PDF, name: 'conta-de-luz.pdf' });
    await expect(cliente.getByText(/enviado|recebemos|recebido/i).first()).toBeVisible();
    await cliente.close();

    // link inválido não revela nada
    const ruim = await page.context().newPage();
    await ruim.goto(`/enviar/${'0'.repeat(48)}`);
    await expect(ruim.getByText(/Link inválido|expirou/)).toBeVisible();
    await ruim.close();

    // o arquivo do cliente chegou ao painel, marcado como enviado pelo cliente
    await page.reload();
    const de = await abrirDossieDoProcesso(page, 'Beta x Delta Comercial', 'Indústria Beta Ltda');
    await expect(de.getByText('conta-de-luz.pdf').first()).toBeVisible();
    await expect(de.getByText(/enviado pelo cliente/).first()).toBeVisible();
  });

  test('backup: o administrador baixa o arquivo do escritório', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/configuracoes?aba=backup');
    const baixar = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar backup agora' }).click();
    expect((await baixar).suggestedFilename()).toMatch(/\.json$/);
    await expect(page.getByText('Backup baixado.')).toBeVisible();
  });

  test('sem login não se alcança nada; outro escritório não vê processos nem documentos deste', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    for (const rota of ['/painel/processos', '/painel/documentos']) {
      await page.goto(rota);
      await expect(page).toHaveURL(/\/entrar/);
    }
    await entrar(page, CONTAS.adminB);
    await page.goto('/painel/processos');
    await expect(page.getByRole('heading', { name: 'Processos' })).toBeVisible();
    await expect(page.getByText('Amazônia Log — execução').first()).toBeVisible();
    await expect(page.getByText('Beta x Delta Comercial')).toHaveCount(0);
    await expect(page.getByText('Indústria Beta Ltda')).toHaveCount(0);
    await page.goto('/painel/documentos');
    await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
    await expect(page.getByText('Beta x Delta Comercial')).toHaveCount(0);
  });

  test('calcular prazo: marco no Diário, atalhos, prazo em dobro e passo a passo', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/processos');
    await page.getByRole('tab', { name: 'Processos' }).click();
    await page.getByRole('button', { name: 'Beta x Delta Comercial' }).first().click();
    const ficha = page.getByRole('dialog', { name: 'Beta x Delta Comercial' });
    await ficha.getByRole('button', { name: /Calcular prazo/ }).first().click();
    const m = page.getByRole('dialog', { name: 'Calcular prazo' });
    await m.getByLabel('A data informada é').selectOption('disponibilizacao');
    await m.getByLabel('Data', { exact: true }).fill('2026-06-12');                       // sexta-feira
    await m.getByRole('button', { name: 'CPC · 15' }).click();
    await expect(m.getByRole('status')).toContainText('06/07/2026');                      // publicação 15/06 → contagem 16/06 → 15 dias úteis
    const passos = m.getByRole('list', { name: 'Como o prazo foi contado' });
    await expect(passos).toContainText('Publicação (1º dia útil seguinte): segunda-feira, 15/06/2026');
    await expect(passos).toContainText('Início da contagem: terça-feira, 16/06/2026');
    await m.getByLabel('Prazo em dobro').check();
    await expect(passos).toContainText('30 dias úteis (em dobro)');
    await m.getByLabel('Prazo em dobro').uncheck();
    await m.getByRole('button', { name: 'CLT · 8' }).click();
    await expect(m.getByRole('status')).toContainText('25/06/2026');                      // 8 dias úteis: 16, 17, 18, 19, 22, 23, 24 e 25/06
    await m.getByRole('button', { name: 'Criar prazo na agenda' }).click();
    await expect(page.getByRole('dialog', { name: 'Delegar' }).or(page.getByRole('dialog', { name: /prazo/i })).first()).toBeVisible();
  });
});

