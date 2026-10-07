// Real persistent storage for manually-logged payments (cash / Payment App).
// Protected by a shared password (ADMIN_PASSWORD env var) — every request,
// read or write, must include it. This is real financial data, so unlike
// the earlier cosmetic client-side gates in this project, this check is
// genuinely enforced server-side.

const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const suppliedPassword = event.headers['x-admin-password'];
  const realPassword = process.env.ADMIN_PASSWORD;

  if (!realPassword) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Server is missing ADMIN_PASSWORD environment variable' })
    };
  }
  if (!suppliedPassword || suppliedPassword !== realPassword) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const store = getStore('payments');

  try {
    if (event.httpMethod === 'GET') {
      const records = (await store.get('records', { type: 'json' })) || [];
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ records }) };
    }

    if (event.httpMethod === 'POST') {
      const newRecord = JSON.parse(event.body);
      if (!newRecord.date || !newRecord.amount || !newRecord.method) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields: date, amount, method' }) };
      }
      const existing = (await store.get('records', { type: 'json' })) || [];
      newRecord.id = Date.now() + Math.floor(Math.random() * 1000);
      existing.push(newRecord);
      await store.setJSON('records', existing);
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ record: newRecord }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { ids } = JSON.parse(event.body || '{}');
      if (!Array.isArray(ids) || ids.length === 0) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing ids array' }) };
      }
      let existing = (await store.get('records', { type: 'json' })) || [];
      existing = existing.filter(r => !ids.includes(r.id));
      await store.setJSON('records', existing);
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
