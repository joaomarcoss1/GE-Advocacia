import { expect, test } from '@playwright/test';
import { CONTAS, PIN, entrar, identificar, irPara, relogio, semear } from './util';

// Centro do escritório de demonstração usado neste teste (qualquer ponto serve).
const LAT = -2.5307, LNG = -44.3068;
const M = 1 / 111195;                                  // ~1 m em graus de latitude

test.describe('GPS do ponto: configuração fácil e leitura mais justa', () => {
  test.beforeEach(async ({ page }) => { await relogio(page, '07:30'); await semear(page); });

  async function configurar(page: import('@playwright/test').Page, texto: string, raio = 100) {
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/configuracoes?aba=ponto');
    await page.getByLabel('Colar coordenadas ou link do Google Maps').fill(texto);
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await page.getByRole('button', { name: 'Definir e salvar' }).click();
    await expect(page.getByText('Nova localização do escritório salva.')).toBeVisible();
    await page.getByRole('button', { name: `${raio} m`, exact: true }).click();
    await page.getByLabel(/Tolerância do GPS/).fill('30');
    await expect(page.getByTestId('limite-gps')).toContainText(`${raio + 30} m`);           // raio + tolerância
    await page.getByRole('button', { name: 'Salvar' }).first().click();
    await expect(page.getByText('Configurações salvas.')).toBeVisible();
  }

  test('o administrador cola o link do Maps; dentro do raio + tolerância o ponto é liberado, fora é bloqueado', async ({ page, context }) => {
    await configurar(page, `https://www.google.com/maps/@${LAT},${LNG},17z`);
    await context.grantPermissions(['geolocation']);

    await irPara(page, '08:03');
    await context.setGeolocation({ latitude: LAT - 120 * M, longitude: LNG, accuracy: 8 });   // 120 m: fora do raio de 100 m, dentro da tolerância
    await identificar(page, 'silva-ribeiro', 'pedro', PIN.pedro);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Você está no escritório')).toBeVisible();

    await context.setGeolocation({ latitude: LAT - 600 * M, longitude: LNG, accuracy: 8 });   // 600 m: fora
    await page.getByRole('button', { name: 'Verificar de novo' }).first().click();
    await expect(page.getByText('Fora da área permitida')).toBeVisible();

    await context.setGeolocation({ latitude: LAT - 190 * M, longitude: LNG, accuracy: 90 });   // GPS ruim: pode estar dentro
    await page.getByRole('button', { name: 'Verificar de novo' }).first().click();
    await expect(page.getByText('Não foi possível confirmar sua localização')).toBeVisible({ timeout: 20000 });   // GPS fraco: o sistema espera ~10 s o sinal melhorar
  });

  test('texto sem coordenadas é recusado com orientação', async ({ page }) => {
    await entrar(page, CONTAS.adminA);
    await page.goto('/painel/configuracoes?aba=ponto');
    await page.getByLabel('Colar coordenadas ou link do Google Maps').fill('Rua das Flores, 12');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/Não encontrei coordenadas/)).toBeVisible();
  });
});
