// TEMPORARY: seed a few past offers into the archive tab so the archive isn't
// empty at launch. Guarded by a key. Delete/neutralize after one call.
const { saveArchivedOffer } = require('../../utils/premium-offers-store');

const KEY = 'svp-seed-2026-x7k';
const SEED = [
  { id: 'arch_seed_1', title: 'Lou-Adriane Cassidy aux Francos', region: 'Montréal', filtre_offre: 'Billet gratuit', offer_type: 'Billet gratuit', venue: 'Place des Arts', event_date: '2026-07-24T20:00', is_active: 'true' },
  { id: 'arch_seed_2', title: 'Waahli + invités', region: 'Montréal', filtre_offre: 'Rabais 40%', offer_type: 'Rabais', venue: 'Club Soda', event_date: '2026-07-18T20:30', is_active: 'true' },
  { id: 'arch_seed_3', title: 'Jeudi Comédie Club', region: 'Montréal', filtre_offre: '2 pour 1', offer_type: '2 pour 1', venue: 'Cabaret Longueuil', event_date: '2026-07-17T20:00', is_active: 'true' },
  { id: 'arch_seed_4', title: "Festival d'été — soirée découverte", region: 'Québec', filtre_offre: 'Rabais 25%', offer_type: 'Rabais', venue: "Plaines d'Abraham", event_date: '2026-07-13T19:30', is_active: 'true' },
  { id: 'arch_seed_5', title: 'Cirque hors piste — Printemps', region: 'Québec', filtre_offre: 'Billet gratuit', offer_type: 'Billet gratuit', venue: 'Espace 400e', event_date: '2026-07-05T19:00', is_active: 'true' },
  { id: 'arch_seed_6', title: 'Les Grands Ballets — soirée', region: 'Montréal', filtre_offre: 'Rabais 30%', offer_type: 'Rabais', venue: 'Salle Wilfrid-Pelletier', event_date: '2026-07-10T19:30', is_active: 'true' },
];

exports.handler = async (event) => {
  const key = (event.queryStringParameters || {}).key || '';
  if (key !== KEY) return { statusCode: 403, body: 'forbidden' };
  const results = [];
  for (const o of SEED) {
    try { const r = await saveArchivedOffer(o); results.push({ id: o.id, ...r }); }
    catch (e) { results.push({ id: o.id, error: e.message }); }
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results, null, 1) };
};
