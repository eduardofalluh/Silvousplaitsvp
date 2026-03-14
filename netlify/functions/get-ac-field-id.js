const fetch = require('node-fetch');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  'Content-Type': 'application/json',
};

const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;
const ADMIN_KEY = process.env.PREMIUM_TOKEN_ADMIN_KEY || '';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!AC_API_URL || !AC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ActiveCampaign config missing' }) };
  }

  if (ADMIN_KEY) {
    const provided = String(
      (event.headers && (event.headers['x-admin-key'] || event.headers['X-Admin-Key'])) || ''
    ).trim();
    if (provided !== ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const name = String((event.queryStringParameters && event.queryStringParameters.name) || '').trim();
  if (!name) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'name query param is required' }) };
  }

  try {
    const response = await fetch(`${AC_API_URL}/api/3/fields`, {
      headers: { 'Api-Token': AC_API_KEY },
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Failed to fetch fields (${response.status})`, details: text }),
      };
    }

    const data = await response.json();
    const fields = Array.isArray(data.fields) ? data.fields : [];
    const needle = name.toLowerCase();

    const matches = fields
      .filter((field) => {
        const title = String(field.title || '').toLowerCase();
        const perstag = String(field.perstag || '').toLowerCase();
        return title === needle || perstag === needle || title.includes(needle) || perstag.includes(needle);
      })
      .map((field) => ({
        id: String(field.id || ''),
        title: field.title || '',
        perstag: field.perstag || '',
        type: field.type || '',
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        query: name,
        count: matches.length,
        matches,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Unexpected error' }),
    };
  }
};
