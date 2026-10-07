// Computes real available time slots for a given service on a given date,
// using her fixed weekly hours (in America/Chicago time) and checking
// against real existing appointments in Supabase.
//
// IMPORTANT: the server this runs on operates in UTC, not Central Time.
// Every time comparison here is done as a real UTC instant under the hood,
// but her stated hours (e.g. "opens at 8am") are always interpreted as
// 8am *Chicago time*, converted correctly for whatever time of year it is
// (since the UTC offset shifts with Daylight Saving Time).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

const TIMEZONE = 'America/Chicago';

// Her fixed weekly hours. Keys are day-of-week numbers (0=Sun...6=Sat),
// values are her LOCAL (Chicago) open/close times.
const WEEKLY_HOURS = {
  0: { open: "08:00", close: "12:00" }, // Sunday
  4: { open: "12:00", close: "16:30" }, // Thursday
  5: { open: "08:00", close: "16:30" }, // Friday
  6: { open: "08:00", close: "16:30" }  // Saturday
  // Mon(1), Tue(2), Wed(3) intentionally absent = closed
};

const SLOT_INTERVAL_MINUTES = 30;

// Returns how many minutes Chicago is behind UTC on a given date
// (handles DST automatically since the offset is computed for that date).
function getChicagoOffsetMinutes(utcDate) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'shortOffset'
  });
  const parts = dtf.formatToParts(utcDate);
  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  const match = offsetPart.value.match(/GMT([+-]\d+)/);
  const offsetHours = match ? parseInt(match[1], 10) : 0;
  return -offsetHours * 60;
}

// Converts a date ("YYYY-MM-DD") + local Chicago time ("HH:MM") into a
// real UTC Date object, correctly handling whatever DST offset applies.
function chicagoWallTimeToUtc(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = (timeStr || "00:00").split(':').map(Number);
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = getChicagoOffsetMinutes(guessUtc);
  return new Date(guessUtc.getTime() + offsetMinutes * 60000);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server is missing Supabase environment variables' }) };
  }

  const { date, durationMinutes } = event.queryStringParameters || {};
  if (!date || !durationMinutes) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required params: date (YYYY-MM-DD), durationMinutes' }) };
  }

  const duration = parseInt(durationMinutes, 10);

  // Day-of-week from the pure calendar date only — never combined with a
  // time-of-day, so this can't be shifted by server timezone.
  const [y, m, d] = date.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const hours = WEEKLY_HOURS[dayOfWeek];

  if (!hours) {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ slots: [] }) };
  }

  const openUtc = chicagoWallTimeToUtc(date, hours.open);
  const closeUtc = chicagoWallTimeToUtc(date, hours.close);

  const candidateStarts = [];
  for (
    let t = new Date(openUtc);
    t.getTime() + duration * 60000 <= closeUtc.getTime();
    t = new Date(t.getTime() + SLOT_INTERVAL_MINUTES * 60000)
  ) {
    candidateStarts.push(new Date(t));
  }

  try {
    const dayStartUtc = chicagoWallTimeToUtc(date, "00:00");
    const dayEndUtc = chicagoWallTimeToUtc(date, "23:59");

    const headers = {
      'apikey': SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
    };

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/appointments?status=eq.confirmed&start_time=gte.${encodeURIComponent(dayStartUtc.toISOString())}&start_time=lte.${encodeURIComponent(dayEndUtc.toISOString())}&select=start_time,end_time`,
      { headers }
    );
    if (!res.ok) {
      const errData = await res.json();
      return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to read existing appointments', details: errData }) };
    }
    const existingAppointments = await res.json();

    const busyRanges = existingAppointments.map(appt => ({
      start: new Date(appt.start_time).getTime(),
      end: new Date(appt.end_time).getTime()
    }));

    const openSlots = candidateStarts.filter(slotStart => {
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotStartMs + duration * 60000;
      return !busyRanges.some(({ start, end }) => slotStartMs < end && slotEndMs > start);
    });

    const slots = openSlots.map(s => s.toISOString());

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ slots }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
