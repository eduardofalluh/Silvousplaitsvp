const { test, expect } = require('@playwright/test');
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname.includes('/.netlify/functions/')) return route.fulfill({ json: { offers: [], archivedOffers: [], regions: [], offerTypes: [], freeSignupLocations: [], showcaseItems: [], accessLogs: [] } });
    return route.continue();
  });
});
async function funnelOffer(page) {
  await page.goto('/tunnel.html');
  await page.locator('[data-svp="prenom"]').fill('Alex');
  await page.locator('[data-svp="funnel-email"]').fill('member@example.test');
  await page.locator('[data-funnel-next="2"]').click();
  await page.locator('[data-premium-choice="no"]').click();
  await expect(page.locator('.svp-trial-card')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCSS('opacity', '1');
}
test('premium popup waits at least 30 seconds and shows once per session', async ({ page }) => {
  await page.clock.install();
  await page.goto('/premium.html');
  await page.clock.fastForward(29000);
  await expect(page.locator('[data-svp-dialog]')).toHaveCount(0);
  await page.clock.fastForward(1100);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Plus tard', exact: true }).click();
  await page.clock.fastForward(500);
  await page.reload();
  await page.clock.fastForward(31000);
  await expect(page.locator('[data-svp-dialog]')).toHaveCount(0);
});
test('funnel trial layout fits, traps focus, and preserves the free signup', async ({ page }, testInfo) => {
  await funnelOffer(page);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('14 jours gratuits, puis 60 $ par année');
  const bounds = await page.locator('.svp-trial-card').boundingBox();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({ path: testInfo.outputPath('trial-popup.png'), fullPage: false });
  const secondary = dialog.getByRole('button', { name: 'Non merci, je reste au forfait gratuit' });
  await secondary.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: "Commencer l'essai gratuit" })).toBeFocused();
  await secondary.click();
  await expect(page.locator('[data-funnel-step="3"]')).toBeVisible();
  let submitted;
  await page.route('**/submit-enriched', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { subscribed: true, confirmationPending: true } });
  });
  await page.locator('[data-svp="funnel-submit"]').click();
  await expect(page.locator('[data-funnel-step="4"]')).toBeVisible();
  await expect(page.locator('[data-funnel-step="4"]')).toContainText('clique sur le lien de confirmation');
  expect(submitted.premiumInterest).toBe('no');
  expect(submitted.email).toBe('member@example.test');
});
test('Escape dismisses the trial and continues to the free step', async ({ page }) => {
  await funnelOffer(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-funnel-step="3"]')).toBeVisible();
});
test('trial acceptance carries the email into checkout', async ({ page }) => {
  await funnelOffer(page);
  await page.locator('.svp-trial-card').getByRole('button', { name: "Commencer l'essai gratuit" }).click();
  await expect(page.getByRole('alertdialog', { name: 'Confirme ton courriel' })).toBeVisible();
  await expect(page.getByRole('alertdialog').locator('input')).toHaveValue('member@example.test');
});
test('partnership phone survives the complete form and validates', async ({ page }, testInfo) => {
  let submitted;
  await page.route('**/send-partenariat', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { sent: true } });
  });
  await page.goto('/partenariat.html');
  const next = page.locator('[data-svp="partner-submit"]');
  await page.locator('[data-partner-type="edito"]').click();
  await next.click();
  await page.locator('[name="organisation"]').fill('Théâtre Test');
  await page.locator('[name="name"]').fill('Alex');
  await page.locator('[name="email"]').fill('member@example.test');
  await page.getByLabel('Numéro de téléphone').fill('123');
  await next.click();
  await expect(page.locator('[data-svp="partner-msg"]')).toContainText('numéro de téléphone valide');
  await page.getByLabel('Numéro de téléphone').fill('+1 (514) 555-0123');
  await page.screenshot({ path: testInfo.outputPath('partner-phone.png'), fullPage: true });
  await next.click();
  await page.locator('[data-partner-city]').first().click();
  await next.click();
  await page.locator('.partner-day:not(:disabled)').first().click();
  await next.click();
  await next.click();
  await expect(page.locator('[data-partner-sent]')).toBeVisible();
  expect(submitted.phone).toBe('+1 (514) 555-0123');
  expect(submitted.email).toBe('member@example.test');
});
test('admin displays, searches, refreshes token history and escapes stored content', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.route('**/admin-login', route => route.fulfill({ json: { accessToken: 'admin-test-token' } }));
  let fail = false;
  await page.route('**/list-free-token-redemptions-admin', route => {
    expect(route.request().headers().authorization).toBe('Bearer admin-test-token');
    return route.fulfill(fail ? { status: 503, json: {} } : { json: { redemptions: [
      { email: 'alex@example.test', offer_title: 'Spectacle Montréal', offer_id: 'one', redeemed_at: '2026-09-09T12:00:00Z', token_number: 1, token_limit: 3 },
      { email: 'sam@example.test', offer_title: '<img src=x onerror=alert(1)>', offer_id: 'two', redeemed_at: '2026-09-08T12:00:00Z', token_number: 2, token_limit: 3 },
    ] } });
  });
  await page.goto('/premium-offers-admin.html');
  await expect(page.locator('#token-history')).toBeHidden();
  await page.locator('#admin-password').fill('test');
  await page.locator('#admin-login-form button').click();
  await expect(page.locator('#token-list article')).toHaveCount(2);
  await expect(page.locator('#token-list article').first()).toContainText('Jeton 1/3');
  await expect(page.locator('#token-list img')).toHaveCount(0);
  await page.locator('#token-history').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('token-history.png'), fullPage: false });
  await page.locator('#token-search').fill('MONTRÉAL');
  await expect(page.locator('#token-list article')).toHaveCount(1);
  await page.locator('#token-search').fill('missing');
  await expect(page.locator('#token-status')).toContainText('Aucune utilisation');
  fail = true;
  await page.locator('#token-refresh').click();
  await expect(page.locator('#token-status')).toContainText('Impossible de charger');
  fail = false;
  await page.locator('#token-search').fill('');
  await page.locator('#token-refresh').click();
  await expect(page.locator('#token-list article')).toHaveCount(2);
  expect(errors).toEqual([]);
});
