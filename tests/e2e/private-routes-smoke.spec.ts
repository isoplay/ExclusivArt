import { expect, test } from '@playwright/test'

test('rotas privadas redirecionam para login quando nao ha sessao', async ({ page }) => {
  for (const route of [
    '/dashboard/pedidos',
    '/dashboard/orcamentos',
    '/dashboard/operacao',
    '/dashboard/historico-vendas',
  ]) {
    await page.goto(route)

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
  }
})

test('login renderiza sem erro de runtime', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
})

test('rotas publicas nao exigem login para links invalidos', async ({ page }) => {
  for (const route of [
    '/p/slug-invalido-para-smoke-test',
    '/acompanhar/token-invalido-para-smoke-test-1234567890',
    '/o/slug-invalido-para-smoke-test',
  ]) {
    await page.goto(route)

    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /link indispon/i })).toBeVisible()
  }
})
