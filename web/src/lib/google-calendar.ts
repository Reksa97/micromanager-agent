import { google, calendar_v3 } from 'googleapis';

export async function fetchEvents(googleAccessToken: string, timeMin: string = new Date().toISOString(), maxResults: number = 10, calendarId: string = 'primary') {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: googleAccessToken });

  const calendar = google.calendar({version: 'v3', auth});
  const result = await calendar.events.list({
    calendarId,
    timeMin,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return result.data.items;
}

export async function createEvent(googleAccessToken: string, event: calendar_v3.Schema$Event) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: googleAccessToken });

  const calendar = google.calendar({version: 'v3', auth});

  const result = await calendar.events.insert({
    auth: auth,
    calendarId: 'primary',
    requestBody: event
  });
  console.log('Event created: %s', result.data.htmlLink);
  return result.data.htmlLink
}