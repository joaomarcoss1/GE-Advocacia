import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CONTAS, entrar, relogio, semear } from './util';

/** WCAG 2.1 AA com axe-core nas telas principais: tema claro e escuro, computador e celular. */
const PUBLICAS = ['/', '/entrar', '/ponto/silva-ribeiro', '/verificar', '/privacidade/silva-ribeiro', '/diagnostico'];
const ADMIN = ['/painel', '/painel/gerencia', '/painel/funcionarios', '/painel/cargos', '/painel/escalas', '/painel/ponto', '/painel/ocorrencias',
  '/painel/feriados', '/painel/folha', '/painel/relatorios', '/painel/configuracoes', '/painel/configuracoes?aba=privacidade', '/painel/configuracoes?aba=acessos', '/painel/tarefas', '/painel/agenda'];
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
        await relogio(page, '09:00');
        await semear(page);
      });
      test('telas públicas', async ({ page }) => { await varrer(page, PUBLICAS); });
      test('painel do administrador', async ({ page }) => { await entrar(page, CONTAS.adminA); await varrer(page, ADMIN); });
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
      test('área da plataforma', async ({ page }) => { await entrar(page, CONTAS.plataforma); await varrer(page, ['/plataforma', '/plataforma/diagnostico']); });
    });
  }
}
