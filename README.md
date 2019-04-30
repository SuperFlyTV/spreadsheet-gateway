# Spreadsheet Gateway


An application for piping data between [**Sofie Server Core**](https://github.com/nrkno/tv-automation-server-core) and Spreadsheets on Gogle Drive.

This application is a part of the [**Sofie** TV News Studio Automation System](https://github.com/nrkno/Sofie-TV-automation/).

## Usage
```
// Development:
npm run start -host 127.0.0.1 -port 3000 -log "log.log"
// Production:
npm run start
```

To set up, follow the instructions in your Sofie Core interface (in the settings for the device).

**CLI arguments:**

| Argument  | Description | Environment variable |
| ------------- | ------------- | --- |
| -host  | Hostname or IP of Core  | CORE_HOST  |
| -port  | Port of Core   |  CORE_PORT |
| -log  | Path to output log |  CORE_LOG |

## Installation for dev

yarn

yarn build

### Dev dependencies:

* yarn
	https://yarnpkg.com

* jest
	yarn global add jest
