#!/usr/bin/env node
/**
 * Simulates a "dumb bot" that fills ALL form fields (including the hidden honeypot).
 * Run: node test-bot-signup.js
 *
 * Expected: Server detects honeypot is filled → does NOT add email to ActiveCampaign.
 * Check your ActiveCampaign list: bot-test-honeypot-XXXX@example.com should NOT appear.
 */

const BOT_EMAIL = 'bot-test-honeypot-' + Date.now() + '@example.com';
const URL = 'https://silvousplaitsvp.com/.netlify/functions/submit-signup';

// Same shape as the real form (first signup form in index.html)
const dumbBotPayload = {
  u: '6977F0A7D22BB',
  f: '1',
  s: '',
  c: '0',
  m: '0',
  act: 'sub',
  v: '2',
  or: 'd17851e3-abb9-4062-996d-69272ffc75e9',
  website: 'https://spam-bot.com',   // Honeypot filled = bot
  email: BOT_EMAIL,
};

async function run() {
  console.log('Sending dumb bot signup (honeypot filled)...');
  console.log('Email used:', BOT_EMAIL);

  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dumbBotPayload),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  console.log('Status:', res.status);
  console.log('Response:', data);

  if (res.ok) {
    console.log('\n→ Server returned success (fake success for bots).');
    console.log('→ Check ActiveCampaign: the address', BOT_EMAIL, 'should NOT be in your list.');
  } else {
    console.log('\n→ Request failed. Check the response above.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
