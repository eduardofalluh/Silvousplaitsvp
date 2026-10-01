// Retry only reads. Repeating a form submission could send confirmation twice.
async function newsletterApi(baseUrl, apiKey, path, options = {}) {
  const canRetry = !options.method || options.method === 'GET';
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/3/${path}`, {
        ...options,
        signal: AbortSignal.timeout(8000),
        headers: { 'Api-Token': apiKey, 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
      });
    } catch {
      if (!canRetry || attempt > 0) throw new Error('Newsletter provider request timed out or could not connect');
    }
    if (canRetry && attempt === 0 && (!response || response.status === 429 || response.status >= 500)) {
      await new Promise(resolve => setTimeout(resolve, 250));
      continue;
    }
    let data = {};
    try { data = await response.json(); } catch { /* The caller checks the response shape. */ }
    return { ok: response.ok, status: response.status, data };
  }
}
module.exports = { newsletterApi };
