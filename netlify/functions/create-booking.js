// Creates a real booking on Cal.com. Keeps the API key on the server —
// never exposed to the browser.

const CAL_USERNAME = "alexisbeautyroom"; // her Cal.com username — update if different

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON body" })
    };
  }

  const { eventTypeSlug, start, name, email, phone, timeZone } = payload;

  if (!eventTypeSlug || !start || !name || !email) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing required fields: eventTypeSlug, start, name, email" })
    };
  }

  const apiKey = process.env.CAL_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Server is missing CAL_API_KEY environment variable" })
    };
  }

  const bookingBody = {
    start,
    eventTypeSlug,
    username: CAL_USERNAME,
    attendee: {
      name,
      email,
      timeZone: timeZone || "America/Chicago",
      ...(phone ? { phoneNumber: phone } : {})
    }
  };

  try {
    const res = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "cal-api-version": "2024-08-13",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bookingBody)
    });
    const data = await res.json();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to reach Cal.com", details: err.message })
    };
  }
};
