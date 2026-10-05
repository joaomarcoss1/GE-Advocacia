import { expect, test } from '@playwright/test';
import { CONTAS, PIN, entrar, identificar, relogio, semear } from './util';

test.describe('delegação: tarefas, prazos, agenda e Google Agenda', () => {
  test('administrador delega um prazo com processo CNJ; funcionário atualiza pelo PIN; fica no histórico', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/tarefas');
    await expect(page.getByRole('heading', { name: 'Tarefas' })).toBeVisible();

    await page.getByRole('button', { name: 'Delegar' }).click();
    const form = page.getByRole('dialog', { name: 'Delegar' });
    await form.getByLabel('Tipo').selectOption('prazo');
    await form.getByLabel('Título').fill('Embargos de declaração');
    // número com dígito verificador errado é recusado; o certo é aceito
    await form.getByLabel('Número do processo').fill('0001234-78.2024.8.26.0001');
    await expect(form.getByText('Número ou dígito verificador inválido.')).toBeVisible();
    await form.getByLabel('Número do processo').fill('00012347720248260001');
    await expect(form.getByLabel('Número do processo')).toHaveValue('0001234-77.2024.8.26.0001');
    await form.getByLabel('Responsável').selectOption({ label: 'Rafael Costa Ribeiro' });
    await form.getByLabel('Início').fill('2026-06-12');
    await form.getByRole('button', { name: 'Delegar' }).click();
    await expect(page.getByText('Delegado com sucesso.')).toBeVisible();
    const card = page.locator('.kcard', { hasText: 'Embargos de declaração' });
    await expect(card).toBeVisible();

    // ficha: links da agenda
    await card.click();
    const ficha = page.getByRole('dialog', { name: 'Embargos de declaração' });
    const href = await ficha.getByRole('link', { name: /Adicionar ao Google Agenda/ }).getAttribute('href');
    const u = new URL(href!);
    expect(u.hostname).toBe('calendar.google.com');
    expect(u.searchParams.get('text')).toContain('Embargos de declaração');
    expect(u.searchParams.get('dates')).toBe('20260612/20260613');          // prazo = dia inteiro, término exclusivo
    const baixar = page.waitForEvent('download');
    await ficha.getByRole('button', { name: 'Baixar .ics' }).click();
    expect((await baixar).suggestedFilename()).toBe('compromisso.ics');
    await ficha.getByLabel('Novo andamento').fill('Minuta iniciada');
    await ficha.getByRole('button', { name: 'Registrar andamento' }).click();
    await expect(ficha.getByText('Minuta iniciada')).toBeVisible();
    await page.keyboard.press('Escape');

    // aparece na agenda da semana
    await page.goto('/painel/agenda');
    await expect(page.locator('.evento', { hasText: 'Embargos de declaração' })).toBeVisible();
    await expect(page.getByText('Indisponível nesta instalação')).toBeVisible();      // Google real só com Supabase + função publicada

    // funcionário vê e envia para revisão
    await identificar(page, 'silva-ribeiro', 'rafael', PIN.rafael);
    await page.getByRole('button', { name: 'Continuar' }).click();
    const minha = page.locator('.mt', { hasText: 'Embargos de declaração' });
    await expect(minha).toBeVisible();
    await expect(minha.getByRole('link', { name: /Google Agenda/ })).toHaveAttribute('href', /calendar\.google\.com/);
    await minha.getByRole('button', { name: 'Iniciar' }).click();
    await expect(minha.getByText('Em andamento')).toBeVisible();
    page.once('dialog', d => d.accept('Pronto para revisão'));
    await minha.getByRole('button', { name: 'Enviar para revisão' }).click();
    await expect(minha.getByText('Em revisão')).toBeVisible();

    // o administrador (sessão ainda aberta) vê a nova situação e o andamento do funcionário
    await page.goto('/painel/tarefas');
    await expect(page.getByRole('region', { name: 'Em revisão' }).locator('.kcard', { hasText: 'Embargos de declaração' })).toBeVisible();
    await page.locator('.kcard', { hasText: 'Embargos de declaração' }).click();
    await expect(page.getByRole('dialog').getByText(/Pronto para revisão/)).toBeVisible();
  });

  test('coordenação delega mas não vê ponto, folha nem cadastro; outro escritório não vê as tarefas', async ({ page }) => {
    await relogio(page, '09:00');
    await semear(page);
    await entrar(page, CONTAS.coordA);
    await expect(page).toHaveURL(/\/painel\/tarefas/);
    const menu = page.getByRole('navigation', { name: 'Seções' });
    await expect(menu.getByRole('link', { name: 'Tarefas' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Agenda' })).toBeVisible();
    for (const proibido of ['Funcionários', 'Registros de ponto', 'Folha de pagamento', 'Configurações']) await expect(menu.getByRole('link', { name: proibido })).toHaveCount(0);
    for (const rota of ['/painel/ponto', '/painel/folha', '/painel/funcionarios', '/painel/ocorrencias']) {
      await page.goto(rota);
      await expect(page).toHaveURL(/\/painel\/tarefas/);
    }
    await expect(page.locator('.kcard', { hasText: 'Contestação — ação de cobrança' })).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).click();
    await entrar(page, CONTAS.adminB);
    await page.goto('/painel/tarefas');
    await expect(page.locator('.kcard', { hasText: 'Réplica à contestação' })).toBeVisible();
    await expect(page.locator('.kcard', { hasText: 'Contestação — ação de cobrança' })).toHaveCount(0);
    await expect(page.locator('.kcard', { hasText: 'Audiência de instrução' })).toHaveCount(0);
  });
});
