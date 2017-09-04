

var fs = require('fs');
var readline = require('readline');
var moment = require('moment');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/calendar-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/calendar'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
  process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'calendar-nodejs-quickstart.json';
var TIME_ZONE = 'America/Argentina/Buenos_Aires';

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the
  // Google Calendar API.
  authorize(JSON.parse(content), consoleInteraction);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function (err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function (code) {
    rl.close();
    oauth2Client.getToken(code, function (err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

/**
 * Lists the next 10 events on the user's primary calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth) {
  var calendar = google.calendar('v3');
  calendar.events.list({
    auth: auth,
    calendarId: 'primary',
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime'
  }, function (err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var events = response.items;
    if (events.length == 0) {
      console.log('No upcoming events found.');
    } else {
      console.log('Upcoming 10 events:');
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        var start = event.start.dateTime || event.start.date;
        console.log('%s - %s', start, event.summary);
      }
    }
  });
}

/**
 * Create an event on the user's primary calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {google.event} event An event with just a summary, start_date and end_date
 */
function createEvent(auth, event) {
  var calendar = google.calendar('v3');
  calendar.events.insert({
    auth: auth,
    calendarId: 'primary',
    resource: event,
  }, function (err, event) {
    if (err) {
      console.log('There was an error contacting the Calendar service: ' + err);
      return;
    }
    console.log('Event created: %s', event.htmlLink);
    listEvents(auth);
  });
}

/**
 * Show the menu for creating an event
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function showEventCreation(auth) {
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  var event = {
    'location': 'Buenos, Aires',
  };
  rl.question('Enter summary ', function (summary) {
    event['summary'] = summary;
    rl.question('Enter hour (hh:mm): ', function (time) {
      var hours_minutes = time.split(':');
      event['start'] = {
        'dateTime': moment().startOf('day').hour(hours_minutes[0]).minute(hours_minutes[1]),
        'timeZone': TIME_ZONE
      }
      rl.question('Enter duration in minutes: ', function (duration) {
        var startEvent = event['start'].dateTime;
        event['end'] = {
          'dateTime': startEvent.clone().add(duration, 'minutes'),
          'timeZone': TIME_ZONE
        }
        createEvent(auth, event);
        rl.close();
      });
    });
  });
}

/**
 * Search the first spot between today's event to fit in given an hour and duration
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function createAutoEvent(auth) {
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter hour (hh:mm): ', function (time) {
    var hours_minutes = time.split(':');
    var timeMin = moment().startOf('day').hour(hours_minutes[0]).minute(hours_minutes[1]);
    rl.question('Enter duration in minutes (remember it is for fast meetings ~15 min): ', function (minutes) {
      var timeMax = timeMin.clone().add(minutes, 'minutes');
      var calendar = google.calendar('v3');
      calendar.freebusy.query({
        auth: auth,
        headers: { "content-type": "application/json" },
        resource: {
          timeMin: timeMin,
          timeMax: timeMax,
          items: [
            {
              "id": "primary"
            }
          ]
        }
      }, function (err, response) {
        if (err) {
          console.log('There was an error while retrieving information from calendar', err);
          return;
        }
        var eventsBusy = response.calendars.primary.busy;
        if (eventsBusy.length) {
          console.log("There are events between %s - %s", moment(eventsBusy.start).toString(), moment(eventsBusy.end).toString())
        } else {
          console.log("The room is free... Making reservation");
          var event = {
            summary: "Fast reservation",
            start: {
              dateTime: timeMin,
              timeZone: TIME_ZONE
            },
            end: {
              dateTime: timeMax,
              timeZone: TIME_ZONE
            }
          }
          createEvent(auth, event);
        }
      });
      rl.close();
    });
  });

}

/**
 * Show the menu for possible events
 */
function showMenu() {
  console.log("**********************************");
  console.log("1- View your current events list");
  console.log("2- Create an event manually");
  console.log("3- Create an event automatically");
  console.log("**********************************");
}

/**
 * Show the menu and read the input option
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function consoleInteraction(auth) {
  showMenu();
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the option: ', function (option) {
    rl.close();
    switch (option) {
      case '1':
        listEvents(auth);
        break;
      case '2':
        showEventCreation(auth);
        break;
      default:
        createAutoEvent(auth);
        break;
    }
  });
}

