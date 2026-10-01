const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load(retrieve) {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../netlify/functions/get-checkout-session'), 'utf8'), {
    exports, process: { env: { STRIPE_SECRET_KEY: 'test-only' } },
    require: name => name === 'stripe' ? () => ({ checkout: { sessions: { retrieve } } }) : require(name),
  });
  return exports.handler;
}
const request = { httpMethod: 'GET', queryStringParameters: { session_id: 'cs_test_verified' } };
for (const trial of [true, false]) {
  test(`Stripe verifies ${trial ? 'StartTrial' : 'Subscribe'} independently of browser plan`, async () => {
    const handler = load(async () => ({ id: 'cs_test_verified', mode: 'subscription', status: 'complete', payment_status: trial ? 'no_payment_required' : 'paid', subscription: { trial_start: trial ? 1790856000 : null }, amount_total: trial ? 0 : 6000, currency: 'cad' }));
    const r = await handler(request);
    const d = JSON.parse(r.body);
    assert.equal(d.completed, true);
    assert.equal(d.conversionEvent, trial ? 'StartTrial' : 'Subscribe');
    assert.match(d.eventId, /^svp_checkout_[a-f0-9]{64}$/);
    assert.equal(JSON.parse((await handler(request)).body).eventId, d.eventId);
    assert.equal(r.headers['Cache-Control'], 'no-store');
  });
}
for (const change of [{ status: 'open' }, { status: 'expired' }, { payment_status: 'unpaid' }, { mode: 'payment' }, { subscription: null }]) {
  test(`incomplete or ineligible checkout cannot report conversion: ${JSON.stringify(change)}`, async () => {
    const handler = load(async () => ({ id: 'cs_test_verified', mode: 'subscription', status: 'complete', payment_status: 'paid', subscription: { trial_start: null }, ...change }));
    const d = JSON.parse((await handler(request)).body);
    assert.equal(d.completed, false);
    assert.equal(d.conversionEvent, null);
    assert.equal(d.eventId, null);
  });
}
test('invalid checkout input and provider failures cannot report a conversion or leak provider details', async () => {
  let calls = 0;
  const handler = load(async () => { calls++; throw new Error('Sensitive provider detail'); });
  assert.equal((await handler({ httpMethod: 'GET', queryStringParameters: {} })).statusCode, 400);
  assert.equal(calls, 0);
  const r = await handler(request);
  assert.equal(r.statusCode, 502);
  assert.equal(r.body.includes('Sensitive'), false);
});
