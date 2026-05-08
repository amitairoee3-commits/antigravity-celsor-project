import { test, expect } from '@playwright/test';

test.describe('CELSOR Nexus Scanner', () => {
  test.beforeEach(async ({ page }) => {
    // Set demo bypass to skip Supabase auth for local testing
    await page.addInitScript(() => {
      window.localStorage.setItem('celsor_demo_bypass', 'true');
    });
  });

  test('user can navigate to dashboard and view live signals feed', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check header
    await expect(page.getByRole('heading', { name: /CELSOR/i })).toBeVisible();
    
    // Check engine status
    await expect(page.getByText(/ENGINE ONLINE/i, { exact: false })).toBeVisible();
    
    // Ensure the feed title exists
    await expect(page.getByText('Live Intelligence Feed', { exact: false })).toBeVisible();
  });

  test('user can perform a manual wallet analysis', async ({ page }) => {
    await page.goto('/dashboard/scanner');
    
    // Check title
    await expect(page.getByRole('heading', { name: /AI Wallet Deep Scanner/i })).toBeVisible();
    
    // Use one of the quick load known whales
    const jumpTradingBtn = page.getByRole('button', { name: 'Jump Trading' });
    await expect(jumpTradingBtn).toBeVisible();
    
    await jumpTradingBtn.click();
    
    // Wait for analysis to complete (look for the "Behavioral Profile" section)
    const profileHeading = page.getByRole('heading', { name: /Behavioral Profile/i });
    await expect(profileHeading).toBeVisible({ timeout: 15000 });
    
    // Ensure conviction score is rendered
    await expect(page.getByText('Conviction Score', { exact: true })).toBeVisible();
  });
});
