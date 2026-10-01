const { test, expect } = require('@playwright/test');
const sdk = `(() => {
  const q = window.fbq.queue.slice(); window.fbq.queue.length = 0;
  window.fbq.callMethod = function(kind, name, data, options) {
    if (kind !== 'track' && kind !== 'trackCustom') return;
    const img = new Image(); img.src = 'https://www.facebook.com/tr/?id=930964623159302&ev=' + name + '&eid=' + options.eventID;
  };
  q.forEach(args => window.fbq.callMethod.apply(window.fbq, args));
})();`;

async function setup(page, mode = 'blocked') {
  const events = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname.includes('/.netlify/functions/')) return route.fulfill({ json: { offers: [], showcaseItems: [] } });
    return route.continue();
  });
  await page.route('https://www.facebook.com/tr/**', route => {
    const url = new URL(route.request().url());
    events.push({ name: url.searchParams.get('ev'), id: url.searchParams.get('eid') });
    return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64') });
  });
  if (mode !== 'blocked') await page.route('https://connect.facebook.net/**', async route => {
    if (mode === 'late') await new Promise(resolve => setTimeout(resolve, 2300));
    return route.fulfill({ contentType: 'application/javascript', body: sdk });
  });
  return events;
}
async function enterFunnel(page, finishFree = true) {
  await page.goto('/tunnel.html');
  await page.locator('[data-svp="prenom"]').fill('Test');
  await page.locator('[data-svp="funnel-email"]').fill('pixel@example.test');
  await page.locator('[data-svp-ville="quebec"]').click();
  await page.locator('[data-svp-interest="Musique"]').click();
  await page.locator('[data-svp-tranche="2-3"]').click();
  await page.locator('[data-funnel-next="2"]').click();
  if (!finishFree) return;
  await page.locator('[data-premium-choice="no"]').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Non merci, je reste au forfait gratuit' }).click();
}

for (const mode of ['ready', 'late', 'blocked']) {
  test(`Meta ${mode} SDK: each event has one transport, including after fallback`, async ({ page }) => {
    const events = await setup(page, mode);
    await page.goto('/accueil.html');
    await expect.poll(() => events.filter(e => e.name === 'PageView').length).toBe(1);
    await page.evaluate(() => window.SVPTrack('trackCustom', 'PremiumClick'));
    await expect.poll(() => events.filter(e => e.name === 'PremiumClick').length).toBe(1);
    await page.waitForTimeout(2200);
    expect(events.filter(e => e.name === 'PageView')).toHaveLength(1);
    expect(events.filter(e => e.name === 'PremiumClick')).toHaveLength(1);
  });
}

test('failed signup emits no Lead; retry succeeds once even with both completion controls clicked', async ({ page }) => {
  const events = await setup(page);
  let attempts = 0;
  let release;
  await page.route('**/submit-enriched', async route => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 502, json: { subscribed: true, error: 'Provider unavailable' } });
    await new Promise(resolve => { release = resolve; });
    return route.fulfill({ json: { subscribed: true, confirmationPending: true } });
  });
  await enterFunnel(page);
  await page.locator('[data-svp="funnel-submit"]').click();
  await expect(page.locator('[data-svp="funnel-feedback"]')).toContainText('Impossible');
  await page.waitForTimeout(1900);
  expect(events.filter(e => e.name === 'Lead')).toHaveLength(0);
  await page.locator('[data-funnel-submit-skip]').click();
  await expect.poll(() => attempts).toBe(2);
  await page.locator('[data-funnel-submit-skip]').click();
  expect(attempts).toBe(2);
  release();
  await expect(page.locator('[data-funnel-step="4"]')).toBeVisible();
  await expect.poll(() => events.filter(e => e.name === 'Lead').length).toBe(1);
  await page.waitForTimeout(300);
  expect(events.filter(e => e.name === 'Lead')).toHaveLength(1);
});

for (const body of [{ alreadySubscribed: true }, { subscribed: true, botBlocked: true }]) {
  test(`Meta excludes ${body.botBlocked ? 'bots' : 'existing subscribers'} from Lead conversions`, async ({ page }) => {
    const events = await setup(page);
    await page.route('**/submit-enriched', route => route.fulfill({ json: body }));
    await enterFunnel(page);
    await page.locator('[data-svp="funnel-submit"]').click();
    await page.waitForTimeout(2200);
    expect(events.filter(e => e.name === 'Lead')).toHaveLength(0);
  });
}

test('trial checkout preserves PremiumClick and InitiateCheckout through immediate navigation', async ({ page }) => {
  const events = await setup(page);
  await page.route('**/create-checkout-session', route => route.fulfill({ json: { ok: true } }));
  await page.route('https://buy.stripe.com/**', route => route.fulfill({ body: '<h1>Checkout destination</h1>' }));
  await enterFunnel(page, false);
  await page.locator('[data-premium-choice="trial"]').click();
  await page.getByRole('button', { name: 'Continuer avec ce courriel' }).click();
  await expect(page).toHaveURL(/buy.stripe.com/);
  await expect.poll(() => events.filter(e => e.name === 'InitiateCheckout').length).toBe(1);
  expect(events.filter(e => e.name === 'PremiumClick')).toHaveLength(1);
  expect(events.filter(e => e.name === 'Lead')).toHaveLength(0);
});

for (const name of ['StartTrial', 'Subscribe']) {
  test(`${name} requires server confirmation and does not repeat on reload`, async ({ page }) => {
    const events = await setup(page);
    await page.route('**/get-checkout-session**', route => route.fulfill({ json: {
      completed: true, conversionEvent: name, eventId: 'verified-checkout-123'
    } }));
    await page.goto('/premium-confirmation.html?session_id=cs_test_123&plan=trial');
    await expect.poll(() => events.filter(e => e.name === name).length).toBe(1);
    await page.reload();
    await page.waitForTimeout(2000);
    expect(events.filter(e => e.name === name)).toHaveLength(1);
    expect(events.find(e => e.name === name).id).toBe('verified-checkout-123');
  });
}

test('unverified confirmation page cannot create a paid or trial conversion', async ({ page }) => {
  const events = await setup(page);
  await page.route('**/get-checkout-session**', route => route.fulfill({ json: { completed: false } }));
  await page.goto('/premium-confirmation.html?plan=trial');
  await page.waitForTimeout(1900);
  await page.goto('/premium-confirmation.html?session_id=cs_test_open&plan=yearly');
  await page.waitForTimeout(1900);
  expect(events.filter(e => ['StartTrial', 'Subscribe'].includes(e.name))).toHaveLength(0);
});

test('visible live offers emit OfferView and loaded offers do not duplicate PremiumClick handlers', async ({ page }) => {
  const events = await setup(page);
  await page.route('**/list-public-premium-offers', route => route.fulfill({ json: { offers: [
    { id: 'test-show', title: 'Pixel test show', venue: 'Test theatre', event_date: '2026-12-01', region: 'Montréal' }
  ] } }));
  await page.goto('/premium.html');
  await page.locator('[data-offer-id="test-show"]').first().scrollIntoViewIfNeeded();
  await expect.poll(() => events.filter(e => e.name === 'OfferView').length).toBe(1);
  await page.locator('[data-svp="premium-cta"]').first().click();
  await expect.poll(() => events.filter(e => e.name === 'PremiumClick').length).toBe(1);
  await page.waitForTimeout(300);
  expect(events.filter(e => e.name === 'PremiumClick')).toHaveLength(1);
});
