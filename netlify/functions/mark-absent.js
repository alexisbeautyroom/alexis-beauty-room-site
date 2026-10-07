// Marks (or unmarks) an attendee as a no-show on a real Cal.com booking,
// using Cal.com's actual mark-absent endpoint. This is a genuine Cal.com
// feature (attendance tracking) — separate from payment logging, which
// Cal.com has no equivalent feature for at all.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const suppliedPassword = event.headers['x-admin-password'];
  const realPassword = process.env.ADMIN_PASSWORD;
  if (!realPassword) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server is missing ADMIN_PASSWORD environment variable' }) };
  }
  if (!suppliedPassword || suppliedPassword !== realPassword) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const apiKey = process.env.CAL_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server is missing CAL_API_KEY environment variable' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { bookingUid, attendeeEmail, absent } = payload;
  if (!bookingUid || !attendeeEmail || typeof absent !== 'boolean') {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields: bookingUid, attendeeEmail, absent' }) };
  }

  try {
    const res = await fetch(`https://api.cal.com/v2/bookings/${bookingUid}/mark-absent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        attendees: [{ email: attendeeEmail, absent }]
      })
    });
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify({ error: (data.error && data.error.message) || 'Cal.com request failed', raw: data }) };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, booking: data.data }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
