import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CONTAS, PIN, baterPonto, entrar, irPara, relogio, semear } from './util';

const JULIANA = { email: 'juliana@silvaribeiro.adv.br', senha: 'silva2026juliana', pin: '902716' };
const sair = async (page: Page) => { await page.evaluate(() => localStorage.removeItem('ge.v1.sessao')); await page.goto('/entrar'); };

test.describe('níveis de acesso e porta do ponto', () => {
  test.beforeEach(async ({ page }) => { await relogio(page, '07:30'); await semear(page); });

  test('advogada: o login é barrado até bater o ponto, o menu respeita o nível e a saída encerra o acesso', async ({ page }) => {
    await entrar(page, JULIANA);
    const porta = page.getByTestId('acesso-bloqueado');
    await expect(porta).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bata o ponto para entrar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Processos' })).toHaveCount(0);                    // nenhum dado nem menu enquanto a porta está fechada
    const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(ax.violations.map(v => v.id)).toEqual([]);

    await page.getByRole('button', { name: 'Já bati o ponto, verificar' }).click();
    await expect(page.getByText('Ainda não encontrei a sua entrada de hoje')).toBeVisible();

    await irPara(page, '08:02');
    await baterPonto(page, 'juliana', JULIANA.pin, /^Entrada$/);
    await expect(page.getByRole('status').filter({ hasText: 'Entrada registrada às 08:02' })).toBeVisible();
    await expect(page.getByTestId('entrando-no-sistema')).toBeVisible();                            // ponto confirmado: a entrada no sistema é automática
    await expect(page.getByRole('heading', { name: 'Meu espaço' })).toBeVisible();                  // o painel abre sozinho, sem digitar a senha

    const menu = page.getByRole('navigation').first();
    await expect(menu.getByRole('link', { name: 'Processos' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Honorários' })).toBeVisible();
    for (const proibido of ['Folha de pagamento', 'Funcionários', 'Configurações', 'Registros de ponto', 'Acessos e níveis']) await expect(menu.getByRole('link', { name: proibido })).toHaveCount(0);
    await page.goto('/painel/folha');
    await expect(page.getByRole('heading', { name: 'Meu espaço' })).toBeVisible();                  // rota fora do nível volta ao início
    const ax2 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(ax2.violations.map(v => v.id)).toEqual([]);

    await irPara(page, '18:00');
    await baterPonto(page, 'juliana', JULIANA.pin, /^Encerrar expediente$/);
    await expect(page.getByText('Jornada encerrada: o seu acesso ao sistema também foi encerrado por hoje.')).toBeVisible();
    await page.goto('/painel');
    await expect(page.getByRole('heading', { name: 'Jornada encerrada' })).toBeVisible();
  });

  test('gerência libera o acesso por um tempo, sem poder criar ou alterar acessos', async ({ page }) => {
    await entrar(page, CONTAS.gerenteA);
    await page.goto('/painel/acessos');
    await expect(page.getByRole('heading', { name: 'Acessos e níveis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo acesso' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Editar o acesso de/ })).toHaveCount(0);
    const linha = page.locator('tr', { hasText: 'Juliana Ferreira Nunes' });
    await expect(linha.getByText('Aguardando o ponto')).toBeVisible();
    await linha.getByRole('button', { name: /Liberar o acesso de Juliana/ }).click();
    const dlg = page.getByRole('dialog', { name: /Liberar o acesso de Juliana/ });
    await expect(dlg.getByRole('button', { name: 'Liberar' })).toBeDisabled();                     // o motivo é obrigatório
    await dlg.getByLabel('Motivo').fill('Audiência externa');
    await dlg.getByRole('button', { name: 'Liberar' }).click();
    await expect(page.getByText(/Acesso de Juliana Ferreira Nunes liberado por 60 min/)).toBeVisible();
    await expect(linha.getByText('Liberado')).toBeVisible();

    await sair(page);
    await entrar(page, JULIANA);
    await expect(page.getByRole('heading', { name: 'Meu espaço' })).toBeVisible();                  // entrou sem bater o ponto, por liberação da gerência
    await expect(page.getByText(/Acesso liberado pela gerência até/)).toBeVisible();
  });

  test('administrador cria o acesso de um funcionário: senha provisória, troca obrigatória e porta do ponto', async ({ page }) => {
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/acessos');
    await page.getByRole('button', { name: 'Novo acesso' }).click();
    const dlg = page.getByRole('dialog', { name: 'Novo acesso' });
    await dlg.getByLabel('Funcionário', { exact: true }).selectOption({ label: 'Lucas Oliveira Rocha' });
    await expect(dlg.getByLabel('Nome', { exact: true })).toHaveValue('Lucas Oliveira Rocha');                       // o nome vem do cadastro
    await dlg.getByLabel(/E-mail/).fill('lucas@silvaribeiro.adv.br');
    await dlg.getByLabel('Nível de acesso').selectOption({ label: 'Financeiro' });
    const senha = await dlg.getByLabel(/Senha provisória/).inputValue();
    expect(senha.length).toBeGreaterThanOrEqual(10);
    await dlg.getByRole('button', { name: 'Criar acesso' }).click();
    const entrega = page.getByRole('dialog', { name: 'Dados de acesso' });
    await expect(entrega.getByText('lucas@silvaribeiro.adv.br')).toBeVisible();
    await entrega.getByRole('button', { name: 'Concluir' }).click();
    await expect(page.locator('tr', { hasText: 'Lucas Oliveira Rocha' }).getByText('senha provisória')).toBeVisible();

    await sair(page);
    await entrar(page, { email: 'lucas@silvaribeiro.adv.br', senha });
    await expect(page.getByRole('heading', { name: 'Crie a sua senha' })).toBeVisible();
    await page.getByLabel('Nova senha', { exact: true }).fill('SenhaNova2026x');
    await page.getByLabel('Repita a nova senha').fill('SenhaNova2026x');
    await page.getByRole('button', { name: 'Salvar e entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Bata o ponto para entrar' })).toBeVisible();   // sem entrada hoje, o financeiro aguarda o ponto
  });

  test('estagiário não vê o que não é do nível e a matriz de níveis mostra o padrão', async ({ page }) => {
    await irPara(page, '08:03');
    await baterPonto(page, 'pedro', PIN.pedro, /^Entrada$/);
    await expect(page.getByRole('heading', { name: 'Meu espaço' })).toBeVisible();                  // entrou sozinho, com o nível de estágio
    const menu = page.getByRole('navigation').first();
    await expect(menu.getByRole('link', { name: 'Processos' })).toBeVisible();
    for (const proibido of ['Honorários', 'Folha de pagamento', 'Acessos e níveis']) await expect(menu.getByRole('link', { name: proibido })).toHaveCount(0);
    await page.goto('/painel/honorarios');
    await expect(page.getByRole('heading', { name: 'Meu espaço' })).toBeVisible();

    await sair(page);
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/acessos');
    await page.getByRole('tab', { name: 'Níveis e permissões' }).click();
    await expect(page.getByRole('columnheader', { name: /Advogado/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Folha de pagamento/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Registro de acessos' }).click();
    await expect(page.getByText('Entrou no sistema').first()).toBeVisible();
  });
});
