// Real persistent storage for manually-logged payments (cash / Payment App).
// Uses Supabase — the same proven, already-working database as the
// appointments table — instead of Netlify Blobs, which turned out to have
// real, unresolved reliability issues even with the documented setup.
//
// Protected by a shared password (ADMIN_PASSWORD env var) — every request,
// read or write, must include it.

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
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server is missing ADMIN_PASSWORD environment variable' }) };
  }
  if (!suppliedPassword || suppliedPassword !== realPassword) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server is missing Supabase environment variables' }) };
  }

  const headers = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    if (event.httpMethod === 'GET') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/payments?select=*&order=date.desc`, { headers });
      const records = await res.json();
      if (!res.ok) throw new Error(records.message || 'Failed to read payments');

      // Map back to the shape the admin panel already expects
      // (firstName/lastName instead of first_name/last_name, etc.)
      const mapped = records.map(r => ({
        id: r.id,
        date: r.date,
        firstName: r.first_name,
        lastName: r.last_name,
        services: r.services || [],
        amount: r.amount,
        method: r.method,
        calBookingUid: r.cal_booking_uid
      }));

      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ records: mapped }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      if (!body.date || !body.amount || !body.method) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields: date, amount, method' }) };
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          date: body.date,
          first_name: body.firstName || null,
          last_name: body.lastName || null,
          services: body.services || [],
          amount: body.amount,
          method: body.method,
          cal_booking_uid: body.calBookingUid || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save payment');

      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ record: data[0] }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { ids } = JSON.parse(event.body || '{}');
      if (!Array.isArray(ids) || ids.length === 0) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing ids array' }) };
      }
      const idList = ids.map(id => `"${id}"`).join(',');
      const res = await fetch(`${SUPABASE_URL}/rest/v1/payments?id=in.(${idList})`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to delete payments');
      }
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
