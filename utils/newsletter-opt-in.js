// A list membership write does not submit a form or send its confirmation.
// Attribute the contact sync to the form so ActiveCampaign runs double opt-in.
// https://developers.activecampaign.com/reference/sync-a-contacts-data
const DEFAULT_CITY_FORMS = { montreal: '1', quebec: '9', 'trois-rivieres': '11', sherbrooke: '13' };

function cityForms() {
  return { ...DEFAULT_CITY_FORMS, ...JSON.parse(process.env.AC_CITY_FORM_MAP || '{}') };
}

async function submitDoubleOptIn(acApi, contact, formId, expectedListId) {
  if (!/^\d+$/.test(String(formId || '')) || !Object.values(cityForms()).map(String).includes(String(formId))) {
    throw new Error('Unknown newsletter form');
  }
  const config = await acApi(`forms/${formId}`);
  const form = config.data && config.data.form;
  const actions = form && form.actiondata && form.actiondata.actions;
  const lists = (Array.isArray(actions) ? actions : [])
    .filter((a) => a.type === 'subscribe-to-list').map((a) => String(a.list));
  if (!config.ok || !form || ![true, 1, '1'].includes((form.options || {}).sendoptin) || !lists.length ||
      (expectedListId && (lists.length !== 1 || lists[0] !== String(expectedListId)))) {
    // Fail before creating a contact if the form cannot send confirmation to
    // the intended list. Never silently activate it or route it to another city.
    throw new Error('Newsletter double opt-in form is misconfigured');
  }
  const sync = await acApi('contact/sync', {
    method: 'POST',
    body: JSON.stringify({ contact: { ...contact, form: Number(formId) } }),
  });
  const contactId = sync.data && sync.data.contact && sync.data.contact.id;
  if (!sync.ok || !contactId) throw new Error('Newsletter form submission failed');
  return { contactId, listId: lists[0], confirmationPending: true };
}

module.exports = { cityForms, submitDoubleOptIn };
