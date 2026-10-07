// Pulls real bookings from Cal.com within a date range — this is the data
// source for the admin panel's "Schedule" view, which mirrors her actual
// calendar so she can see every appointment (card, cash, or Payment App)
// in one place and log cash/Payment App payments right there.

const CAL_USERNAME = "alexisbeautyroom"; // update if different

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

  const apiKey = process.env.CAL_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server is missing CAL_API_KEY environment variable' }) };
  }

  const { from, to } = event.queryStringParameters || {};
  if (!from || !to) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required params: from, to' }) };
  }

  const params = new URLSearchParams({
    afterStart: new Date(from + 'T00:00:00Z').toISOString(),
    beforeEnd: new Date(to + 'T23:59:59Z').toISOString(),
    take: '100'
  });

  try {
    const res = await fetch(`https://api.cal.com/v2/bookings?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13'
      }
    });
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify({ error: (data.error && data.error.message) || 'Cal.com request failed', raw: data }) };
    }

    const bookings = (data.data || []).map(b => ({
      uid: b.uid,
      title: b.title,
      eventType: (b.eventType && b.eventType.slug) || '',
      start: b.start,
      end: b.end,
      status: b.status,
      attendeeName: (b.attendees && b.attendees[0] && b.attendees[0].name) || '',
      attendeeEmail: (b.attendees && b.attendees[0] && b.attendees[0].email) || '',
      noShow: !!(b.attendees && b.attendees[0] && b.attendees[0].noShow)
    }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bookings }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
