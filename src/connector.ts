import { SpreadsheetHandler, SpreadsheetConfig } from './spreadsheetHandler'
import { CoreHandler, CoreConfig } from './coreHandler'
import { Process } from './process'
import { logger } from './logger'

export interface Config {
	process: ProcessConfig
	device: DeviceConfig
	core: CoreConfig
	spreadsheet: SpreadsheetConfig
}
export interface ProcessConfig {
	/** Will cause the Node applocation to blindly accept all certificates. Not recommenced unless in local, controlled networks. */
	unsafeSSL: boolean
	/** Paths to certificates to load, for SSL-connections */
	certificates: string[]
}
export interface DeviceConfig {
	deviceId: string
	deviceToken: string
}
export class Connector {
	private spreadsheetHandler: SpreadsheetHandler
	private coreHandler: CoreHandler
	private _config: Config
	private _process: Process

	constructor(config: Config) {
		this._config = config
		this._process = new Process()
		this.coreHandler = new CoreHandler(this._config.device)
		this.spreadsheetHandler = new SpreadsheetHandler(this._config, this.coreHandler)
	}

	async init(): Promise<void> {
		return Promise.resolve()
			.then(() => {
				logger.info('Initializing Process...')
				return this.initProcess()
			})
			.then(async () => {
				logger.info('Process initialized')
				logger.info('Initializing Core...')
				return this.initCore()
			})
			.then(async () => {
				logger.info('Initializing Spreadsheet-monitor...')
				return this.initSpreadsheetHandler()
			})
			.then(() => {
				logger.info('Initialization done')
				return
			})
			.catch((e) => {
				logger.error('Error during initialization:', e, e.stack)
				logger.info('Shutting down in 10 seconds!')

				try {
					this.dispose().catch((e) => logger.error(e))
				} catch (e) {
					logger.error(e)
				}

				setTimeout(() => {
					// eslint-disable-next-line no-process-exit
					process.exit(0)
				}, 10 * 1000)

				return
			})
	}
	initProcess(): void {
		this._process.init(this._config.process)
	}
	async initCore(): Promise<void> {
		await this.coreHandler.init(this._config.device, this._config.core, this._process, this.spreadsheetHandler)
	}
	async initSpreadsheetHandler(): Promise<void> {
		return this.spreadsheetHandler.init(this.coreHandler)
	}
	async dispose(): Promise<void> {
		return (this.spreadsheetHandler ? this.spreadsheetHandler.dispose() : Promise.resolve())
			.then(async () => {
				return this.coreHandler ? this.coreHandler.dispose() : Promise.resolve()
			})
			.then(() => {
				return
			})
	}
}
