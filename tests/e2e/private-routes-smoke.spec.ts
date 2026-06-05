import { expect, test } from '@playwright/test'

test('rotas privadas redirecionam para login quando nao ha sessao', async ({ page }) => {
  await page.goto('/dashboard/operacao')

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
})

test('login renderiza sem erro de runtime', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
})
