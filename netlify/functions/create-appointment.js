// Creates a real appointment directly in Supabase. Replaces Cal.com's
// booking creation entirely.
//
// The double-booking protection here isn't application logic checking
// "is this slot free?" before writing (which always has a small timing
// gap two requests could slip through at the same instant) — it's a real
// database constraint on the appointments table itself. If two requests
// for an overlapping time arrive at the same moment, Postgres guarantees
// exactly one of them succeeds and the other gets rejected outright.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server is missing Supabase environment variables' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const {
    startTime, durationMinutes,
    serviceSlug, serviceName, totalPrice, depositAmount,
    firstName, lastName, email, phone
  } = payload;

  if (!startTime || !durationMinutes || !serviceSlug || !serviceName ||
      totalPrice == null || depositAmount == null ||
      !firstName || !lastName || !email) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing required fields: startTime, durationMinutes, serviceSlug, serviceName, totalPrice, depositAmount, firstName, lastName, email' })
    };
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const headers = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/appointments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        service_slug: serviceSlug,
        service_name: serviceName,
        total_price: totalPrice,
        deposit_amount: depositAmount,
        client_first_name: firstName,
        client_last_name: lastName,
        client_email: email,
        client_phone: phone || null,
        status: 'confirmed'
      })
    });

    const data = await res.json();

    if (!res.ok) {
      // Postgres error code 23P01 = exclusion constraint violation.
      // This is the database itself telling us: that slot just got taken.
      const isConflict = (data.code === '23P01') || (typeof data.message === 'string' && data.message.includes('appointments'));
      if (isConflict) {
        return {
          statusCode: 409,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'That time was just booked by someone else. Please pick a different time.' })
        };
      }
      return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify({ error: data.message || 'Failed to create appointment', details: data }) };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, appointment: data[0] }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
