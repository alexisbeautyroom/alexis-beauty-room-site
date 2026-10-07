// Pulls real appointments from Supabase within a date range, for the
// admin panel's Schedule view. Replaces cal-bookings.js entirely — this
// reads from our own database, not Cal.com.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  const { from, to } = event.queryStringParameters || {};
  if (!from || !to) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required params: from, to' }) };
  }

  const headers = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
  };

  try {
    const fromIso = new Date(from + 'T00:00:00Z').toISOString();
    const toIso = new Date(to + 'T23:59:59Z').toISOString();

    // 'expired' holds are abandoned checkouts, not real appointments —
    // excluded entirely rather than shown as clutter.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/appointments?start_time=gte.${encodeURIComponent(fromIso)}&start_time=lte.${encodeURIComponent(toIso)}&status=neq.expired&order=start_time.asc`,
      { headers }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to read appointments');

    // Shaped to closely match what the admin panel already expects, to
    // keep the front-end rendering logic largely unchanged.
    const appointments = data.map(appt => ({
      uid: appt.id,
      eventType: appt.service_slug,
      title: appt.service_name,
      start: appt.start_time,
      end: appt.end_time,
      status: appt.status, // 'confirmed' | 'pending' | 'cancelled' | 'no_show'
      attendeeName: `${appt.client_first_name || ''} ${appt.client_last_name || ''}`.trim(),
      attendeeEmail: appt.client_email,
      noShow: appt.status === 'no_show',
      totalPrice: appt.total_price,
      depositAmount: appt.deposit_amount
    }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bookings: appointments }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
