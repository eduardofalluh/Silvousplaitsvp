const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {
  ACTIVECAMPAIGN_API_URL: 'https://ac.example.test', ACTIVECAMPAIGN_API_KEY: 'test-only',
  PREMIUM_OFFERS_SECRET: 'test-only-secret', PREMIUM_ACCESS_SECRET: 'test-only-secret',
  SMTP_USER: 'test', SMTP_PASS: 'test', SENDER_EMAIL: 'sender@example.test',
});
const enriched = require('../netlify/functions/submit-enriched').handler;
const signup = require('../netlify/functions/submit-signup').handler;
const partner = require('../netlify/functions/send-partenariat').handler;
const { submitDoubleOptIn } = require('../utils/newsletter-opt-in');
const nodemailer = require('nodemailer');
const originalFetch = global.fetch;
const originalTransport = nodemailer.createTransport;
let calls, existing, status, failure, sent;
const reply = (data, code = 200) => new Response(JSON.stringify(data), { status: code });
const event = (body) => ({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) });
beforeEach(() => {
  calls = []; existing = false; status = '0'; failure = ''; sent = [];
  nodemailer.createTransport = () => ({ sendMail: async (message) => { sent.push(message); } });
  global.fetch = async (url, options = {}) => {
    const path = String(url).split('/api/3/')[1];
    const body = options.body && JSON.parse(options.body);
    calls.push({ path, body, method: options.method || 'GET' });
    if (failure && path.startsWith(failure)) return reply({}, 503);
    if (path.startsWith('contacts?')) return reply({ contacts: existing ? [{ id: '42', email: 'member@example.test' }] : [] });
    if (path.endsWith('/contactLists')) return reply({ contactLists: [{ list: '4', status }] });
    if (path.endsWith('/contactTags')) return reply({ contactTags: [] });
    if (path.startsWith('forms/')) return reply({ form: { options: { sendoptin: true }, actiondata: { actions: [{ type: 'subscribe-to-list', list: { 1: '4', 9: '8', 11: '9', 13: '10' }[path.split('/')[1]] }] } } });
    if (path === 'contact/sync') return reply({ contact: { id: '42' } });
    if (path.startsWith('tags?')) return reply({ tags: [] });
    if (path === 'tags') return reply({ tag: { id: '7' } });
    if (path === 'contactTags' || path === 'notes' || path === 'fieldValues') return reply({});
    throw new Error('Unexpected provider request: ' + path);
  };
});
afterEach(() => { global.fetch = originalFetch; nodemailer.createTransport = originalTransport; });
for (const [city, form] of Object.entries({ montreal: 1, quebec: 9, 'trois-rivieres': 11, sherbrooke: 13 })) {
  test('tunnel submits the double opt-in form for ' + city, async () => {
    const r = await enriched(event({ email: 'member@example.test', firstName: 'Alex', ville: city, interests: ['Musique'], tranche: '2-3' }));
    assert.equal(r.statusCode, 200);
    assert.equal(JSON.parse(r.body).confirmationPending, true);
    assert.deepEqual(calls.find(c => c.path === 'contact/sync').body.contact, { email: 'member@example.test', firstName: 'Alex', form });
    assert.equal(calls.some(c => c.path === 'contactLists'), false);
    assert.equal(calls.filter(c => c.path === 'contactTags').length, 2);
  });
}
for (const handler of [enriched, signup]) {
  test(handler === signup ? 'basic signup resubmits unconfirmed contacts through the form' : 'tunnel resubmits unconfirmed contacts through the form', async () => {
    existing = true;
    const r = await handler(event({ email: 'member@example.test', f: '1', ville: 'montreal' }));
    assert.equal(JSON.parse(r.body).confirmationPending, true);
    assert.equal(calls.filter(c => c.path === 'contact/sync').length, 1);
    assert.equal(calls.some(c => c.path === 'contactLists'), false);
  });
  test('active subscribers are not resubmitted (' + (handler === signup ? 'basic' : 'tunnel') + ')', async () => {
    existing = true; status = '1';
    const r = await handler(event({ email: 'member@example.test', f: '1' }));
    assert.equal(JSON.parse(r.body).alreadySubscribed, true);
    assert.equal(calls.some(c => c.method === 'POST'), false);
  });
  test('honeypots and malformed requests do not reach AC (' + (handler === signup ? 'basic' : 'tunnel') + ')', async () => {
    assert.equal(JSON.parse((await handler(event({ website: 'spam' }))).body).botBlocked, true);
    for (const body of [null, [], { email: 'bad' }, { email: 'a b@example.test' }]) assert.equal((await handler(event(body))).statusCode, 400);
    assert.equal(calls.length, 0);
  });
  test('provider failure never activates or reports a successful signup (' + (handler === signup ? 'basic' : 'tunnel') + ')', async () => {
    failure = 'contact/sync';
    const r = await handler(event({ email: 'member@example.test', f: '1' }));
    assert.equal(r.statusCode, 502);
    assert.equal(JSON.parse(r.body).subscribed, false);
    assert.equal(calls.some(c => c.path === 'contactLists'), false);
  });
}
test('unknown city cannot fall back to a production list', async () => {
  assert.equal((await enriched(event({ email: 'member@example.test', ville: 'test' }))).statusCode, 400);
  assert.equal(calls.length, 0);
});
test('configuration mismatch or missing double opt-in prevents writes', async () => {
  for (const options of [{ sendoptin: false }, { sendoptin: true }]) {
    const api = async (path) => {
      assert.ok(path.startsWith('forms/'));
      return { ok: true, data: { form: { options, actiondata: { actions: [{ type: 'subscribe-to-list', list: '4' }] } } } };
    };
    await assert.rejects(submitDoubleOptIn(api, { email: 'a@example.test' }, '9', '8'), /misconfigured/);
  }
});
test('enrichment failure does not repeat a successful opt-in submission', async () => {
  failure = 'tags';
  const r = await enriched(event({ email: 'member@example.test', interests: ['Musique'] }));
  assert.equal(JSON.parse(r.body).subscribed, true);
  assert.equal(calls.filter(c => c.path === 'contact/sync').length, 1);
});
test('partner phone reaches the contact record, note, and notification', async () => {
  const r = await partner(event({ name: 'Alex Test', email: 'member@example.test', phone: '+1 (514) 555-0123', organisation: 'Théâtre', types: ['premium'] }));
  assert.equal(r.statusCode, 200);
  assert.equal(calls.find(c => c.path === 'contact/sync').body.contact.phone, '+1 (514) 555-0123');
  assert.match(calls.find(c => c.path === 'notes').body.note.note, /Téléphone: \+1 \(514\) 555-0123/);
  assert.match(sent[0].text, /555-0123/);
  assert.match(sent[0].html, /555-0123/);
});
test('partner phone remains optional and rejects invalid values', async () => {
  const body = { name: 'Alex', email: 'member@example.test', types: ['edito'] };
  assert.equal((await partner(event({ ...body, phone: '<script>' }))).statusCode, 400);
  assert.equal(calls.length, 0);
  assert.equal((await partner(event(body))).statusCode, 200);
  assert.equal('phone' in calls.find(c => c.path === 'contact/sync').body.contact, false);
});
test('admin token history rejects visitors, members and expired sessions', async () => {
  const handler = require('../netlify/functions/list-free-token-redemptions-admin').handler;
  const auth = require('../utils/premium-offers-auth');
  const { createSignedToken } = require('../utils/premium-access-token');
  for (const token of ['', 'invalid', auth.createPremiumOffersSessionToken('member@example.test'), createSignedToken({ type: 'premium_offers_admin', exp: 1 }, 'test-only-secret')]) {
    const r = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer ' + token } });
    assert.equal(r.statusCode, 401);
  }
});
test('token history shows only winning claims, newest first, including deleted offers', async () => {
  const store = require('../utils/premium-offers-store');
  const rows = [store.FREE_OFFER_REDEMPTION_HEADERS,
    ['1', 'first@example.test', 'deleted', 'Old show', '2026-09-01T12:00:00Z'],
    [], ['2', 'FIRST@example.test', 'loser', 'Race loser', '2026-09-02T12:00:00Z'],
    ['3', 'second@example.test', 'new', 'New show', '2026-09-03T12:00:00Z']];
  const sheets = { spreadsheets: { get: async () => ({ data: { sheets: [{ properties: { title: store.FREE_OFFER_REDEMPTIONS_TAB, sheetId: 1 } }] } }), values: { get: async () => ({ data: { values: rows } }) } } };
  const result = await store.listFreeOfferRedemptionsAdmin({ sheets });
  assert.deepEqual(result.map(r => r.offer_id), ['new', 'deleted']);
  assert.equal('rowNumber' in result[0], false);
});
