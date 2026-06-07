import { expect, test } from '@playwright/test'

test('rotas privadas redirecionam para login quando nao ha sessao', async ({ page }) => {
  for (const route of ['/dashboard/operacao', '/dashboard/historico-vendas']) {
    await page.goto(route)

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
  }
})

test('login renderiza sem erro de runtime', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
})

test('acompanhamento publico nao exige login', async ({ page }) => {
  await page.goto('/acompanhar/token-invalido-para-smoke-test-1234567890')

  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: /link indispon/i })).toBeVisible()
})
