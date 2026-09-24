const { test, expect } = require('@playwright/test');
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname.includes('/.netlify/functions/newsletter-count')) return route.fulfill({ json: { count: 6001 } });
    if (url.pathname.includes('/.netlify/functions/')) return route.fulfill({ json: { offers: [], archivedOffers: [], regions: [], offerTypes: [], freeSignupLocations: [], showcaseItems: [], accessLogs: [] } });
    return route.continue();
  });
});
async function funnelOffer(page) {
  await page.goto('/tunnel.html');
  await page.locator('[data-svp="prenom"]').fill('Alex');
  await page.locator('[data-svp="funnel-email"]').fill('member@example.test');
  await page.locator('[data-svp-ville="montreal"]').click();
  await page.locator('[data-svp-interest="Théâtre"]').click();
  await page.locator('[data-svp-tranche="2-3"]').click();
  await page.locator('[data-funnel-next="2"]').click();
  await page.locator('[data-premium-choice="no"]').click();
  await expect(page.locator('.svp-trial-card')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCSS('opacity', '1');
}


test('home email submit enrolls partial signup, updates count, and waits on Meta Lead', async ({ page }) => {
  const pixelEvents = [];
  await page.exposeFunction('recordFbq', args => { pixelEvents.push(args); });
  await page.addInitScript(() => {
    window.fbq = (...args) => { window.recordFbq(args); };
  });
  let partialSignup;
  await page.route('**/submit-signup', route => {
    partialSignup = route.request().postDataJSON();
    return route.fulfill({ json: { subscribed: true, confirmationPending: true } });
  });
  await page.goto('/accueil.html');
  await expect(page.locator('[data-svp="subscriber-count"]').first()).toHaveText('6 001');
  await page.locator('[data-svp="hero-email"]').first().fill('home@example.test');
  await page.locator('[data-svp="hero-submit"]').first().click();
  await expect.poll(async () => partialSignup && partialSignup.email).toBe('home@example.test');
  expect(partialSignup.f).toBe('1');
  await expect(page).toHaveURL(/tunnel\.html$/);
  expect(pixelEvents).toEqual([]);
});

test('funnel starts with no selected quiz answers and no fake Alex in exit popup', async ({ page }) => {
  await page.goto('/tunnel.html');
  await expect(page.locator('[data-svp-ville][data-selected="1"]')).toHaveCount(0);
  await expect(page.locator('[data-svp-interest][data-selected="1"]')).toHaveCount(0);
  await expect(page.locator('[data-svp-tranche][data-selected="1"]')).toHaveCount(0);
  await page.locator('[data-funnel-open-exit]').click();
  await expect(page.locator('#funnel-exit-title')).toHaveText('Tu y es presque');
});

test('email step creates partial signup without firing Meta Lead until final submit', async ({ page }) => {
  const pixelEvents = [];
  await page.addInitScript(() => {
    window.fbq = (...args) => { window.__pixelEvents = window.__pixelEvents || []; window.__pixelEvents.push(args); };
  });
  let partialSignup;
  await page.route('**/submit-signup', route => {
    partialSignup = route.request().postDataJSON();
    return route.fulfill({ json: { subscribed: true, confirmationPending: true } });
  });
  let finalSignup;
  await page.route('**/submit-enriched', route => {
    finalSignup = route.request().postDataJSON();
    return route.fulfill({ json: { subscribed: true, confirmationPending: true } });
  });
  await page.goto('/tunnel.html');
  await page.locator('[data-svp="prenom"]').fill('Lou');
  await page.locator('[data-svp="funnel-email"]').fill('lou@example.test');
  await page.locator('[data-svp-ville="montreal"]').click();
  await page.locator('[data-svp-interest="Musique"]').click();
  await page.locator('[data-svp-tranche="2-3"]').click();
  await page.locator('[data-funnel-next="2"]').click();
  await expect.poll(async () => partialSignup && partialSignup.email).toBe('lou@example.test');
  expect(await page.evaluate(() => window.__pixelEvents || [])).toEqual([]);
  await page.locator('[data-premium-choice="no"]').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Non merci, je reste au forfait gratuit' }).click();
  await page.locator('[data-svp="funnel-submit"]').click();
  await expect(page.locator('[data-funnel-step="4"]')).toBeVisible();
  expect(finalSignup.email).toBe('lou@example.test');
  pixelEvents.push(...await page.evaluate(() => window.__pixelEvents || []));
  expect(pixelEvents).toEqual([['track', 'Lead']]);
});


test('home shows partner logos and the three free offers copy', async ({ page }) => {
  await page.goto('/accueil.html');
  await expect(page.locator('[data-svp-trust-strip]')).toBeVisible();
  await expect(page.getByAltText('Radio-Canada')).toHaveCount(2);
  await expect(page.getByAltText('Cinéma Public')).toHaveCount(2);
  await expect(page.getByAltText("Centre du Théâtre d'Aujourd'hui")).toHaveCount(2);
  await expect(page.getByAltText('Espace GO')).toHaveCount(2);
  await expect(page.getByAltText('La Vitrine')).toHaveCount(2);
  await expect(page.getByAltText('Le Point de Vente')).toHaveCount(2);
  await expect(page.locator('[data-svp-trust-group]')).toHaveCount(2);
  await expect(page.locator('[data-svp-trust-track]')).toHaveCSS('animation-name', 'marqueeSVP');
  const groupWidths = await page.locator('[data-svp-trust-group]').evaluateAll(groups => groups.map(group => Math.round(group.getBoundingClientRect().width)));
  expect(groupWidths[0]).toBeGreaterThan(0);
  expect(Math.abs(groupWidths[0] - groupWidths[1])).toBeLessThanOrEqual(1);
  await expect(page.locator('#premium')).toContainText('3 offres gratuites');
  await expect(page.locator('#premium')).not.toContainText('Pas de billets gratuits');
});

test('Meta pixel loader stays idle without an id and loads when configured', async ({ page }) => {
  await page.route('https://connect.facebook.net/**', route => route.fulfill({ body: '' }));
  await page.goto('/accueil.html');
  await expect(page.locator('script[src*="connect.facebook.net"][src*="fbevents.js"]')).toHaveCount(0);

  await page.addInitScript(() => { window.SVP_META_PIXEL_ID = '123456789012345'; });
  await page.goto('/accueil.html');
  await expect(page.locator('script[src*="connect.facebook.net"][src*="fbevents.js"]')).toHaveCount(1);
  const calls = await page.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue : []).map(args => Array.from(args)));
  expect(calls).toEqual([['init', '123456789012345'], ['track', 'PageView']]);
});

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
  await next.click();
  await expect(page.locator('[data-svp="partner-msg"]')).toContainText('Numéro de téléphone');
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
  let tokenRequests = 0;
  await page.route('**/list-free-token-redemptions-admin**', route => {
    tokenRequests += 1;
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
  expect(tokenRequests).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test('admin saves the selected premium offer date without shifting the day', async ({ page }) => {
  await page.route('**/admin-login', route => route.fulfill({ json: { accessToken: 'admin-test-token' } }));
  await page.route('**/list-premium-offers-admin**', route => route.fulfill({ json: {
    offers: [],
    archivedOffers: [],
    regions: [{ id: 'montreal', label: 'Montreal' }],
    offerTypes: [],
    freeSignupLocations: [],
  } }));
  let saved;
  await page.route('**/save-premium-offer', route => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { offer: saved } });
  });
  await page.goto('/premium-offers-admin.html');
  await page.locator('#admin-password').fill('test');
  await page.locator('#admin-login-form button').click();
  await page.locator('#offer-title').fill('Phil Roy - RODAGE No 3');
  await page.locator('#offer-region').selectOption('Montreal');
  await page.locator('#offer-venue').fill("Le lion d'or");
  await page.locator('#offer-date').evaluate((el) => { el.value = '2026-09-17T00:00'; });
  await page.locator('#offer-form button[type="submit"]').click();
  await expect(page.locator('#admin-form-message')).toContainText('succès');
  expect(saved.event_date).toBe('2026-09-17T00:00');
});
