// Pulls real successful Stripe charges within a date range, formatted to match
// our internal payment record shape so they can be merged with manually-logged
// cash/Payment App records in the admin panel.
//
// NOTE: this cannot be tested until STRIPE_SECRET_KEY is actually set in
// Netlify's environment variables, which depends on her finishing Stripe's
// account verification. Until then, this returns an empty list with a note
// rather than an error, so the admin panel doesn't break while waiting on that.

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
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Server is missing ADMIN_PASSWORD environment variable' })
    };
  }
  if (!suppliedPassword || suppliedPassword !== realPassword) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // Stripe isn't connected yet — return an empty, non-error result so the
    // admin panel just shows $0 from Stripe rather than breaking.
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ records: [], note: 'Stripe is not connected yet (no STRIPE_SECRET_KEY set).' })
    };
  }

  const { from, to } = event.queryStringParameters || {};
  const params = new URLSearchParams({ limit: '100' });
  if (from) params.append('created[gte]', String(Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000)));
  if (to) params.append('created[lte]', String(Math.floor(new Date(to + 'T23:59:59Z').getTime() / 1000)));

  try {
    const res = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64')
      }
    });
    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: (data.error && data.error.message) || 'Stripe request failed' })
      };
    }

    const records = (data.data || [])
      .filter(charge => charge.paid && !charge.refunded)
      .map(charge => {
        const name = (charge.billing_details && charge.billing_details.name) || '';
        const [firstName, ...rest] = name.split(' ');
        return {
          id: 'stripe_' + charge.id,
          date: new Date(charge.created * 1000).toISOString().slice(0, 10),
          firstName: firstName || '',
          lastName: rest.join(' ') || '',
          services: [charge.description || 'Card payment'],
          amount: charge.amount / 100,
          method: 'card',
          source: 'stripe'
        };
      });

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ records }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
