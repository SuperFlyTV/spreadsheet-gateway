import * as winston from 'winston'

const logger = winston.createLogger({})

export function addConsoleLogging(): void {
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

export function addTestLogging(): void {
	logger.add(
		new winston.transports.Console({
			// level: 'verbose',
			handleExceptions: true,
			format: winston.format.json({ circularValue: null }),
			silent: true,
		})
	)
}

export function addFileLogging(logPath: string): void {
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
}

export { logger }
