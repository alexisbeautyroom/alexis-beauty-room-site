// Creates a Stripe PaymentIntent for the deposit, collected directly by us
// (not through Cal.com's payment integration, which doesn't save the card).
// Explicitly sets setup_future_usage so the card can be charged again later
// for the remaining balance, without the client needing to be present.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
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

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server is missing STRIPE_SECRET_KEY environment variable' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { amount, email, name } = payload;
  if (!amount || !email) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields: amount, email' }) };
  }

  const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

  try {
    // Find an existing Stripe Customer by email, or create a new one.
    // Reusing the same Customer record is what lets us find "the saved card"
    // later when charging the remainder.
    const searchRes = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`, {
      headers: { 'Authorization': authHeader }
    });
    const searchData = await searchRes.json();
    let customerId = (searchData.data && searchData.data[0] && searchData.data[0].id) || null;

    if (!customerId){
      const createParams = new URLSearchParams({ email });
      if (name) createParams.append('name', name);
      const custRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: createParams.toString()
      });
      const custData = await custRes.json();
      if (!custRes.ok) throw new Error((custData.error && custData.error.message) || 'Failed to create customer');
      customerId = custData.id;
    }

    // Create the PaymentIntent for the deposit, saving the card for later.
    const piParams = new URLSearchParams({
      amount: String(Math.round(amount * 100)),
      currency: 'usd',
      customer: customerId,
      'automatic_payment_methods[enabled]': 'true',
      setup_future_usage: 'off_session'
    });
    const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: piParams.toString()
    });
    const piData = await piRes.json();
    if (!piRes.ok) throw new Error((piData.error && piData.error.message) || 'Failed to create payment intent');

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ clientSecret: piData.client_secret, customerId })
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
