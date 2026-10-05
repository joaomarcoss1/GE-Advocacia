import { expect, type Page } from '@playwright/test';

export const CONTAS = {
  plataforma: { email: 'plataforma@geadvocacia.com.br', senha: 'GEplataforma2026' },
  adminA: { email: 'admin@silvaribeiro.adv.br', senha: 'silva2026admin' },
  gerenteA: { email: 'gerencia@silvaribeiro.adv.br', senha: 'silva2026gerencia' },
  coordA: { email: 'coordenacao@silvaribeiro.adv.br', senha: 'silva2026coord' },
  adminB: { email: 'admin@monteirocosta.adv.br', senha: 'monteiro2026admin' },
};
/** Funcionários de demonstração (PIN em src/data/seed.ts). */
export const PIN = { pedro: '357951', carlos: '482913', rafael: '561847', mariana: '739105' };

/** Relógio controlado: o app inteiro (e os dados de demonstração) usa esta data. 10/06/2026 é quarta-feira; UTC−3 (Fortaleza). */
export async function relogio(page: Page, hora = '07:30') {
  await page.clock.install({ time: new Date(`2026-06-10T${hora}:00-03:00`) });
}
export async function irPara(page: Page, hora: string) { await page.clock.setFixedTime(new Date(`2026-06-10T${hora}:00-03:00`)); }

export async function entrar(page: Page, conta: { email: string; senha: string }) {
  await page.goto('/entrar');
  await page.locator('#email').fill(conta.email);
  await page.locator('#senha').fill(conta.senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/(painel|plataforma)/);
}

/** Identifica-se na tela de ponto: busca o nome e digita o PIN no teclado da tela. */
export async function identificar(page: Page, slug: string, busca: string, pin: string) {
  await page.goto(`/ponto/${slug}`);
  await page.getByLabel('Digite seu nome').fill(busca);
  await page.getByRole('button', { name: /Selecionar/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Digite seu PIN' })).toBeVisible();
  await digitarPin(page, pin);
}
export async function digitarPin(page: Page, pin: string) {
  for (const d of pin) await page.locator('.keypad').getByRole('button', { name: d, exact: true }).click();
}

/** Abre o app e espera os dados de demonstração nascerem (com o relógio atual) antes de o teste mexer na hora. */
export async function semear(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => localStorage.getItem('ge.v1.seeded') === 'v3');
}
