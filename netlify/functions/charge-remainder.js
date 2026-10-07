// Charges the client's saved card (from the deposit transaction) for the
// remaining balance. This is the "one button" close-out action — finds
// their saved payment method by email and charges it off-session.

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

  const { email, amount } = payload;
  if (!email || !amount) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields: email, amount' }) };
  }

  const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

  try {
    const searchRes = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`, {
      headers: { 'Authorization': authHeader }
    });
    const searchData = await searchRes.json();
    const customer = searchData.data && searchData.data[0];
    if (!customer){
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No Stripe customer found for this email — no saved card to charge.' }) };
    }

    const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods?customer=${customer.id}&type=card`, {
      headers: { 'Authorization': authHeader }
    });
    const pmData = await pmRes.json();
    const paymentMethod = pmData.data && pmData.data[0];
    if (!paymentMethod){
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No saved card found for this client.' }) };
    }

    const piParams = new URLSearchParams({
      amount: String(Math.round(amount * 100)),
      currency: 'usd',
      customer: customer.id,
      payment_method: paymentMethod.id,
      off_session: 'true',
      confirm: 'true'
    });
    const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: piParams.toString()
    });
    const piData = await piRes.json();

    if (!piRes.ok){
      const code = piData.error && piData.error.code;
      if (code === 'authentication_required'){
        return { statusCode: 402, headers: CORS_HEADERS, body: JSON.stringify({ error: 'This card requires the client to re-authenticate — it cannot be charged automatically. Collect another way.' }) };
      }
      throw new Error((piData.error && piData.error.message) || 'Charge failed');
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, paymentIntentId: piData.id, last4: paymentMethod.card && paymentMethod.card.last4 }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
