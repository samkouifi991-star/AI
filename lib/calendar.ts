import { google } from 'googleapis';

export function googleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  const client = googleOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ]
  });
}

/** Returns busy time ranges for a calendar between two ISO timestamps. */
export async function getFreeBusy(
  accessToken: string,
  refreshToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
) {
  const client = googleOAuthClient();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: client });

  const res = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items: [{ id: calendarId }] }
  });

  return res.data.calendars?.[calendarId]?.busy ?? [];
}

/** Books an appointment as a real Google Calendar event. */
export async function createCalendarEvent(params: {
  accessToken: string;
  refreshToken: string;
  calendarId: string;
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timezone: string;
}) {
  const client = googleOAuthClient();
  client.setCredentials({
    access_token: params.accessToken,
    refresh_token: params.refreshToken
  });
  const calendar = google.calendar({ version: 'v3', auth: client });

  const res = await calendar.events.insert({
    calendarId: params.calendarId,
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.startIso, timeZone: params.timezone },
      end: { dateTime: params.endIso, timeZone: params.timezone }
    }
  });

  return res.data;
}
