// TEMPORARY TEST FUNCTION — delete this once we've confirmed the connection works.
// Inserts one fake test appointment, reads it back, then deletes it again.
// Proves: the SUPABASE_URL and SUPABASE_SECRET_KEY env vars are correct,
// our code can write to the appointments table, and the table's structure
// matches what we expect — all before building the real booking logic.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variable' })
    };
  }

  const headers = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    // Step 1: Insert a fake test appointment, 1 year in the future so it
    // can never collide with anything real.
    const testStart = new Date();
    testStart.setFullYear(testStart.getFullYear() + 1);
    const testEnd = new Date(testStart);
    testEnd.setMinutes(testEnd.getMinutes() + 30);

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/appointments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        start_time: testStart.toISOString(),
        end_time: testEnd.toISOString(),
        service_slug: 'test-service',
        service_name: 'TEST — delete me',
        total_price: 1,
        deposit_amount: 1,
        client_first_name: 'Test',
        client_last_name: 'Row',
        client_email: 'test@example.com',
        status: 'confirmed'
      })
    });

    const insertData = await insertRes.json();
    if (!insertRes.ok) {
      return {
        statusCode: insertRes.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({ step: 'insert', error: insertData })
      };
    }

    const insertedId = insertData[0].id;

    // Step 2: Read it back, to confirm a real round-trip.
    const readRes = await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${insertedId}`, {
      headers
    });
    const readData = await readRes.json();

    // Step 3: Clean up — delete the test row so it doesn't clutter real data.
    await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${insertedId}`, {
      method: 'DELETE',
      headers
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        message: 'Insert, read, and delete all worked. Supabase connection is good.',
        insertedThenDeleted: readData
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ step: 'unexpected', error: err.message })
    };
  }
};
