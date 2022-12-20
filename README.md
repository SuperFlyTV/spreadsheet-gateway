# Spreadsheet Gateway

An application for piping data between [**Sofie Server Core**](https://github.com/nrkno/sofie-core) and Spreadsheets on Google Drive.

This application is a part of the [**Sofie** TV News Studio Automation System](https://github.com/nrkno/Sofie-TV-automation/).

## Usage

```
// Development:
npm run start -host 127.0.0.1 -port 3000 -log "log.log"
// Production:
npm run start
```

To set up, follow the instructions in your Sofie Core interface (in the settings for the device).

This gateway app will read all spreadsheet files in specified Google Drive folder that don't start with underscore "\_" and that are version compliant with the app.
Read more about the version specification in the [**Spreadsheet Schema**](./SPREADSHEET-SCHEMA.md).

**CLI arguments:**

| Argument | Description            | Environment variable |
| -------- | ---------------------- | -------------------- |
| -host    | Hostname or IP of Core | CORE_HOST            |
| -port    | Port of Core           | CORE_PORT            |
| -log     | Path to output log     | CORE_LOG             |

## Installation (for developers)

### Build and start

```
yarn
yarn build
yarn start
```

or

```
yarn
yarn buildstart
```

### Dev dependencies:

- yarn
  - https://yarnpkg.com

## Set up Google Drive API

Start Sofie and Spreadsheet gateway. Make sure that Sofie Studio has Sofie Host URL (Settings > Studios > Sofie Host URL). Connect the Spreadsheet gateway to the Studio.

1. Go to Google Cloud Platform ([https://console.cloud.google.com/](https://console.cloud.google.com/)) In the upper left corner choose "Select a project" and then "NEW PROJECT" in the upper right corner of the popup. The project name does not matter.
   If "Select a project" does not exist on the page, go to the menubar on the left > Home > Dashboard.

### Set up the OAuth consent screen

1. Make sure the newly created project is selected. Then go to the menubar on the left > APIs & Services > OAuth consent screen. Select "External" User Type, and enter the App name, support email, and developer email.

2. Under "Authorized domains", add a redirect URL that should look like this: `SOFIE_CORE_URL/devices/SPREADSHEET_GATEWAY_ID/oauthResponse`. Replace `SOFIE_CORE_URL` with the real URL (probably [http://localhost:3000](http://localhost:3000)) and `SPREADSHEET_GATEWAY_ID` with the real ID (copy from the Studio page).

3. Skip scopes, on the "Test users" page enter your Google Account email which you will use for the Spreadsheet Gateway.

### Enable Google Drive API

1. Go to APIs & Services > Library, search for "Google Drive API" and enable it, do the same fot the "Google Sheets API".

### Create credentials

1. Go to APIs & Services > Credentials. Click on "CREATE CREDENTIALS" on the top and choose "OAuth Client ID". Under "Application type" choose "Desktop app". Once created, click on "DOWNLOAD JSON" from the popup.

Now just upload that JSON file into Sofie.

## Credentials expiration after 7 days

Google's access token will be (automatically revoked after 7 days)[https://developers.google.com/identity/protocols/oauth2].
In case the user's token has expired or has been revoked, Spreadsheet Gateway will send status updates to the Sofie a message like "Invalid Credentials, try resetting user credentials" and set the device status to bad. It's Sofie's responsibility to allow a smooth reset of user credentials in the UI.

## API Rate Limitations

Google Sheets API has a limitation of (60 read requests per minute per user per project)[https://developers.google.com/sheets/api/limits].
Spreadsheet Gateway automatically sets intervals for checking and downloading new spreadsheet documents based on the number of spreadsheets found in the drive folder. Assumption is that, aside from standard regular fetching of documents, there will be maximum of 30 additional document edits.
