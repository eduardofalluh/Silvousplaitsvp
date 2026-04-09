const {
  getMissingSheetEnvVars,
  listPremiumShowcaseItems,
} = require('../../utils/premium-offers-store');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const missing = getMissingSheetEnvVars();
  if (missing.length) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Missing env vars: ${missing.join(', ')}` }),
    };
  }

  try {
    const showcaseItems = await listPremiumShowcaseItems({ includeInactive: false });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, showcaseItems }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to load premium showcase' }),
    };
  }
};
