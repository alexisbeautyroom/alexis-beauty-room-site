// Fetches real availability from Cal.com for a given service (event type)
// Keeps the API key on the server — never exposed to the browser.

const CAL_USERNAME = "alexisbeautyroom"; // her Cal.com username — update if different

exports.handler = async (event) => {
  // CORS preflight support
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
      },
      body: ""
    };
  }

  const { eventTypeSlug, start, end, timeZone } = event.queryStringParameters || {};

  if (!eventTypeSlug || !start || !end) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing required params: eventTypeSlug, start, end" })
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

  const url = `https://api.cal.com/v2/slots?` + new URLSearchParams({
    username: CAL_USERNAME,
    eventTypeSlug,
    start,
    end,
    timeZone: timeZone || "America/Chicago"
  }).toString();

  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "cal-api-version": "2024-09-04"
      }
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
