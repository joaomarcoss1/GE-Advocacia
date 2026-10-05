import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

/** WCAG 2.1 AA com axe-core nas telas principais: tema claro e escuro, computador e celular. */
const PUBLICAS = ['/', '/entrar', '/ponto/silva-ribeiro', '/verificar', '/privacidade/silva-ribeiro', '/diagnostico'];
const ADMIN = ['/painel', '/painel/gerencia', '/painel/funcionarios', '/painel/cargos', '/painel/escalas', '/painel/ponto', '/painel/ocorrencias',
  '/painel/feriados', '/painel/folha', '/painel/relatorios', '/painel/configuracoes', '/painel/configuracoes?aba=privacidade', '/painel/configuracoes?aba=acessos', '/painel/tarefas', '/painel/agenda',
  '/painel/processos', '/painel/documentos', '/painel/configuracoes?aba=integracoes', '/painel/configuracoes?aba=backup'];
const TELAS = [
  { nome: 'computador', largura: 1366, altura: 800 },
  { nome: 'celular', largura: 390, altura: 844 },
];

async function analisar(page: Page, rotulo: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map(v => `${rotulo} · ${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
}

async function varrer(page: Page, rotas: string[]) {
  const problemas: string[] = [];
  for (const rota of rotas) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of r.violations) problemas.push(`${rota} · ${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
  }
  expect(problemas, problemas.join('\n')).toEqual([]);
}

for (const tema of ['light', 'dark'] as const) {
  for (const tela of TELAS) {
    test.describe(`axe · tema ${tema === 'light' ? 'claro' : 'escuro'} · ${tela.nome}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: tela.largura, height: tela.altura });
        await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
        await page.addInitScript(t => { try { localStorage.setItem('ge.tema', t === 'dark' ? 'escuro' : 'claro'); } catch { /* sem armazenamento */ } }, tema);
        await relogio(page, '09:00');
        await semear(page);
      });
      test('telas públicas', async ({ page }) => { await varrer(page, PUBLICAS); });
      test('painel do administrador', async ({ page }) => { test.slow(); await entrar(page, CONTAS.adminA); await varrer(page, ADMIN); });      // 19 telas, cada uma com análise axe
      test('painel da gerência', async ({ page }) => { await entrar(page, CONTAS.gerenteA); await varrer(page, ['/painel/gerencia', '/painel/ponto', '/painel/ocorrencias']); });
      test('delegação: coordenação, formulário e ficha da tarefa', async ({ page }) => {
        await entrar(page, CONTAS.coordA);
        await varrer(page, ['/painel/tarefas', '/painel/agenda']);
        await page.goto('/painel/tarefas');
        await page.getByRole('button', { name: 'Delegar' }).click();
        await expect(page.getByRole('dialog', { name: 'Delegar' })).toBeVisible();
        const problemas = await analisar(page, 'formulário de delegação');
        await page.keyboard.press('Escape');
        await page.locator('.kcard').first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        problemas.push(...(await analisar(page, 'ficha da tarefa')));
        await page.keyboard.press('Escape');
        await page.getByRole('tab', { name: 'Lista' }).click();
        problemas.push(...(await analisar(page, 'lista de tarefas')));
        expect(problemas, problemas.join('\n')).toEqual([]);
      });
      test('processos e documentos: ficha, dossiê, link do cliente e página pública de envio', async ({ page }) => {
        await entrar(page, CONTAS.adminA);
        const problemas: string[] = [];
        await page.goto('/painel/processos');
        problemas.push(...(await analisar(page, 'novidades dos processos')));
        await page.getByRole('tab', { name: 'Processos' }).click();
        await page.getByRole('button', { name: 'Beta x Delta Comercial' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Beta x Delta Comercial' })).toBeVisible();
        problemas.push(...(await analisar(page, 'ficha do processo')));
        for (const aba of ['Tarefas e prazos', 'Documentos', 'Dados']) {
          await page.getByRole('tab', { name: aba }).click();
          problemas.push(...(await analisar(page, `ficha do processo · ${aba}`)));
        }
        await page.keyboard.press('Escape');
        await page.getByRole('tab', { name: 'Clientes' }).click();
        problemas.push(...(await analisar(page, 'clientes')));
        await page.goto('/painel/documentos');
        await page.locator('tr', { hasText: 'Beta x Delta Comercial' }).getByRole('button', { name: 'Abrir' }).click();
        const dossie = page.getByRole('dialog', { name: 'Indústria Beta Ltda' });
        await expect(dossie).toBeVisible();
        problemas.push(...(await analisar(page, 'dossiê de documentos')));
        await dossie.getByRole('button', { name: 'Link para o cliente' }).click();
        const modal = page.getByRole('dialog', { name: 'Link para o cliente' });
        const url = await modal.getByLabel('Endereço do link').inputValue();
        problemas.push(...(await analisar(page, 'link para o cliente')));
        await page.goto(new URL(url).pathname);
        await expect(page.getByRole('heading', { name: 'Envio de documentos' })).toBeVisible();
        problemas.push(...(await analisar(page, 'página pública de envio')));
        await page.goto(`/enviar/${'0'.repeat(48)}`);
        await expect(page.getByText(/Link inválido/)).toBeVisible();
        problemas.push(...(await analisar(page, 'link inválido')));
        expect(problemas, problemas.join('\n')).toEqual([]);
      });
      test('área da plataforma', async ({ page }) => { await entrar(page, CONTAS.plataforma); await varrer(page, ['/plataforma', '/plataforma/diagnostico']); });
    });
  }
}
