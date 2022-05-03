import { Connector, Config } from './connector'
import * as winston from 'winston'
import _ = require('underscore')

// CLI arguments / Environment variables --------------
let host: string = process.env.CORE_HOST || '127.0.0.1'
let port: number = parseInt(process.env.CORE_PORT + '', 10) || 3000
let logPath: string = process.env.CORE_LOG || ''
let deviceId: string = process.env.DEVICE_ID || ''
let deviceToken: string = process.env.DEVICE_TOKEN || ''
let disableWatchdog: boolean = process.env.DISABLE_WATCHDOG === '1' || false
let unsafeSSL: boolean = process.env.UNSAFE_SSL === '1' || false
const certs: string[] = (process.env.CERTIFICATES || '').split(';') || []
let debug = false
let printHelp = false

let prevProcessArg = ''
process.argv.forEach((val) => {
	val = val + ''

	let nextPrevProcessArg = val
	if (prevProcessArg.match(/-host/i)) {
		host = val
	} else if (prevProcessArg.match(/-port/i)) {
		port = parseInt(val, 10)
	} else if (prevProcessArg.match(/-log/i)) {
		logPath = val
	} else if (prevProcessArg.match(/-id/i)) {
		deviceId = val
	} else if (prevProcessArg.match(/-token/i)) {
		deviceToken = val
	} else if ((val + '').match(/-debug/i)) {
		debug = true
	} else if ((val + ' ').match(/-h(elp)? /i)) {
		printHelp = true
	} else if (prevProcessArg.match(/-certificates/i)) {
		certs.push(val)
		nextPrevProcessArg = prevProcessArg // so that we can get multiple certificates

		// arguments with no options:
	} else if (val.match(/-disableWatchdog/i)) {
		disableWatchdog = true
	} else if (val.match(/-unsafeSSL/i)) {
		// Will cause the Node applocation to blindly accept all certificates. Not recommenced unless in local, controlled networks.
		unsafeSSL = true
	}
	prevProcessArg = nextPrevProcessArg + ''
})

if (printHelp) {
	console.log(`
The Spreadsheet-gateway acts as a gateway between Google-sheets and Core
Options:
CLI                ENV
-host              CORE_HOST         Host of Core  Default: '127.0.0.1'
-port              CORE_PORT         Port of Core  Default: '3000'
-log               CORE_LOG          File path to output log to (if not set, logs are sent to console)
-id                DEVICE_ID         Custom id of this device
-token             DEVICE_TOKEN      Custom token of this device
-disableWatchdog   DISABLE_WATCHDOG  Disable the watchdog (Killing the process if no commands are received after some time)
-certificates      CERTIFICATES      Provide paths to SSL certificates, (for self-signed certificates). '-certificates path1 path2 path3'
-unsafeSSL         UNSAFE_SSL        Will cause the Node applocation to blindly accept all certificates. Not recommenced unless in local, controlled networks.
-debug                               Debug mode
-h, -help                            Displays this help message
`)
	// eslint-disable-next-line no-process-exit
	process.exit(1)
}

// Setup logging --------------------------------------
const logger = winston.createLogger({})

if (logPath) {
	// Log json to file, human-readable to console
	console.log('Logging to', logPath)
	logger.add(
		new winston.transports.Console({
			level: 'verbose',
			handleExceptions: true,
			format: winston.format.simple(),
		})
	)
	logger.add(
		new winston.transports.File({
			level: 'debug',
			handleExceptions: true,
			format: winston.format.json({ circularValue: null }),
			filename: logPath,
		})
	)
	// Hijack console.log:
	const orgConsoleLog = console.log
	console.log = function (...args: any[]) {
		if (args.length >= 1) {
			try {
				logger.debug(args.join(' '))
			} catch (e) {
				orgConsoleLog('CATCH')
				orgConsoleLog(...args)
				throw e
			}
			orgConsoleLog(...args)
		}
	}
} else {
	console.log('Logging to Console')
	// Log json to console
	logger.add(
		new winston.transports.Console({
			// level: 'verbose',
			handleExceptions: true,
			format: winston.format.json({ circularValue: null }),
		})
	)
	// Hijack console.log:
	console.log = function (...args: any[]) {
		if (args.length >= 1) {
			logger.debug(args.join(' '))
		}
	}
}

// Because the default NodeJS-handler sucks and wont display error properly
process.on('unhandledRejection', (e: any) => {
	logger.error('Unhandled Promise rejection:', e, e.reason || e.message, e.stack)
})
process.on('warning', (e: any) => {
	logger.warn('Unhandled warning:', e, e.reason || e.message, e.stack)
})

logger.info('------------------------------------------------------------------')
logger.info('-----------------------------------')
logger.info('Statup options:')

logger.info(`host: "${host}"`)
logger.info(`port: ${port}`)
logger.info(`log: "${logPath}"`)
logger.info(`id: "${deviceId}"`)
logger.info(`token: "${deviceToken}"`)
logger.info(`debug: ${debug}`)
logger.info(`certificates: [${certs.join(',')}]`)
logger.info(`disableWatchdog: ${disableWatchdog}`)
logger.info(`unsafeSSL: ${unsafeSSL}`)

logger.info('-----------------------------------')

// App config -----------------------------------------
const config: Config = {
	process: {
		unsafeSSL: unsafeSSL,
		certificates: _.compact(certs),
	},
	device: {
		deviceId: deviceId,
		deviceToken: deviceToken,
	},
	core: {
		host: host,
		port: port,
		watchdog: !disableWatchdog,
	},
	spreadsheet: {},
}

const c = new Connector(logger, config)

logger.info('Core:          ' + config.core.host + ':' + config.core.port)
// logger.info('My Mos id:     ' + config.mos.self.mosID)
// config.mos.devices.forEach((device) => {
// 	if (device.primary) logger.info('Mos Primary:   ' + device.primary.host)
// 	if (device.secondary) logger.info('Mos Secondary: ' + device.secondary.host)
// })
logger.info('------------------------------------------------------------------')
c.init().catch(logger.error)

// @todo: remove this line of comment
