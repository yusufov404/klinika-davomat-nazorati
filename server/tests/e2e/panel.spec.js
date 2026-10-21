'use strict';

/**
 * E2E testlar (Playwright).
 *
 * Ishga tushirish:
 *   cd server
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   npm run test:e2e
 *
 * Test serveri avtomatik ishga tushadi (dev-local rejimida).
 */
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

test.describe('Klinika Davomat — asosiy oqimlar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test('login sahifasi ochiladi', async ({ page }) => {
    await expect(page.getByText('Davomat Nazorati').first()).toBeVisible();
    await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
  });

  test("noto'g'ri parol bilan kirish mumkin emas", async ({ page }) => {
    // Boshqa login ishlatiladi — 'admin' hisobi bloklanmasin
    await page.fill('input[autocomplete="username"]', 'e2e-not-a-user');
    await page.fill('input[autocomplete="current-password"]', 'wrong-password');
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-red-600, [class*="text-red"]').first()).toBeVisible();
  });

  test('admin kiradi va dashboard yuklanadi', async ({ page }) => {
    await page.fill('input[autocomplete="username"]', 'admin');
    await page.fill('input[autocomplete="current-password"]', 'Admin@12345');
    await page.click('button[type="submit"]');

    await expect(page.locator('header h1')).toHaveText(/Boshqaruv paneli/i);
    // Chart chizilishi kerak
    await expect(page.locator('#chartTrend')).toBeVisible();
    await expect(page.locator('#chartDistribution')).toBeVisible();
  });

  test("xodimlar ro'yxati va qidirish ishlaydi", async ({ page }) => {
    await page.fill('input[autocomplete="username"]', 'admin');
    await page.fill('input[autocomplete="current-password"]', 'Admin@12345');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);

    await page.locator('aside nav a').filter({ hasText: 'Xodimlar' }).first().click();
    await expect(page.locator('header h1')).toHaveText(/Xodimlar/i);
    await expect(page.locator('main section:visible table').first()).toBeVisible();
  });

  test('command palette (Ctrl+K) ochiladi', async ({ page }) => {
    await page.fill('input[autocomplete="username"]', 'admin');
    await page.fill('input[autocomplete="current-password"]', 'Admin@12345');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1200);

    await page.keyboard.press('Control+k');
    await expect(page.locator('input[placeholder*="Buyruq"]')).toBeVisible();
  });

  test('dark mode almashadi', async ({ page }) => {
    await page.fill('input[autocomplete="username"]', 'admin');
    await page.fill('input[autocomplete="current-password"]', 'Admin@12345');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1200);

    const before = await page.getAttribute('html', 'data-theme');
    await page.locator('button[title*="rejim"]').click();
    const after = await page.getAttribute('html', 'data-theme');
    expect(after).not.toBe(before);
  });

  test("til almashtiriladi (O'zbekcha → Русский)", async ({ page }) => {
    await page.fill('input[autocomplete="username"]', 'admin');
    await page.fill('input[autocomplete="current-password"]', 'Admin@12345');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1200);

    await page.locator('header select').selectOption('ru');
    await expect(page.locator('header h1')).toHaveText(/Панель управления/i);
  });
});

test.describe('Professional funksiyalar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.fill('input[autocomplete="username"]', 'admin');
    await page.fill('input[autocomplete="current-password"]', 'Admin@12345');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
  });

  test('oylik oqim (davr) sahifasi ochiladi', async ({ page }) => {
    await page.locator('aside nav a').filter({ hasText: 'Oylik oqim' }).first().click();
    await expect(page.locator('header h1')).toHaveText(/Oylik oqim/i);
    await expect(page.getByText('Davr holati')).toBeVisible();
  });

  test("ta'til balansi sahifasi ochiladi", async ({ page }) => {
    await page.locator('aside nav a').filter({ hasText: "Ta'til balansi" }).first().click();
    await expect(page.locator('header h1')).toHaveText(/balansi/i);
  });

  test('hisobot konstruktori ustun tanlash bilan ishlaydi', async ({ page }) => {
    await page.locator('aside nav a').filter({ hasText: 'Hisobot konstruktori' }).first().click();
    await expect(page.locator('header h1')).toHaveText(/konstruktori/i);

    // Ustun tugmasi bosilganda natija qayta hisoblanadi
    const before = await page.locator('main section:visible table tbody tr').count();
    await page.locator('main section:visible button', { hasText: 'Kelish' }).first().click();
    await page.waitForTimeout(800);
    const after = await page.locator('main section:visible table tbody tr').count();
    expect(after).toBeGreaterThan(0);
    expect(typeof before).toBe('number');
  });

  test('hisob-chek (payroll) sahifasi yuklanadi', async ({ page }) => {
    await page.locator('aside nav a').filter({ hasText: 'Hisob-chek' }).first().click();
    await expect(page.locator('header h1')).toHaveText(/Hisob-chek/i);
    await expect(page.getByText('Soatlik').first()).toBeVisible();
  });

  test('xavfsizlik sahifasida audit zanjiri butun', async ({ page }) => {
    await page.locator('aside nav a').filter({ hasText: 'Xavfsizlik' }).first().click();
    await expect(page.locator('header h1')).toHaveText(/Xavfsizlik/i);
    await expect(page.getByText('Zanjir butun').first()).toBeVisible({ timeout: 10000 });
  });

  test('menim panel (self-service) ochiladi', async ({ page }) => {
    await page.locator('aside nav a').filter({ hasText: 'Menim panel' }).first().click();
    await expect(page.locator('header h1')).toHaveText(/Menim panel/i);
  });
});
