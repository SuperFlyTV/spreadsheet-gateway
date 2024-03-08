import {
	CoreConnection,
	CoreOptions,
	DDPConnectorOptions,
	PeripheralDeviceForDevice,
	PeripheralDeviceCommand,
} from '@sofie-automation/server-core-integration'
import { StatusCode } from '@sofie-automation/shared-lib/dist/lib/status'
import {
	PeripheralDeviceCategory,
	PeripheralDeviceType,
} from '@sofie-automation/shared-lib/dist/peripheralDevice/peripheralDeviceAPI'
import { PeripheralDeviceCommandId, PeripheralDeviceId } from '@sofie-automation/shared-lib/dist/core/model/Ids'
import { protectString, unprotectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import * as winston from 'winston'
import * as fs from 'fs'
import { Process } from './process'

import * as _ from 'underscore'

import { DeviceConfig } from './connector'
import { MediaDict } from './classes/media'
import { IOutputLayer } from '@sofie-automation/blueprints-integration'
import { SPREADSHEET_DEVICE_CONFIG_MANIFEST } from './configManifest'
import { SpreadsheetHandler } from './spreadsheetHandler'
import { MediaObject } from '@sofie-automation/shared-lib/dist/core/model/MediaObjects'
import { DBShowStyleBase } from './sofie-core-copy/dataModel/ShowStyleBase'
import { DBStudio } from './sofie-core-copy/dataModel/Studio'
import { applyAndValidateOverrides } from './sofie-core-copy/objectWithOverrides'
export interface CoreConfig {
	host: string
	port: number
	watchdog: boolean
}
export type WorkflowType = 'ATEM' | 'VMIX'
/**
 * Represents a connection between mos-integration and Core
 */
export class CoreHandler {
	public core!: CoreConnection
	public doReceiveAuthToken?: (authToken: string) => Promise<any>

	public deviceStatus: StatusCode = StatusCode.GOOD
	public deviceMessages: Array<string> = []

	private logger: winston.Logger
	private _observers: Array<any> = []
	public deviceSettings: { [key: string]: any } = {}

	private _deviceOptions: DeviceConfig
	private _onConnected?: () => any
	private _onChanged?: () => any
	private _statusInitialized = false
	private _statusDestroyed = false
	private _executedFunctions: { [id: string]: boolean } = {}
	private _coreConfig?: CoreConfig
	private _process?: Process
	private _studioId: string | undefined
	private _mediaPaths: MediaDict = {}
	private _outputLayers: IOutputLayer[] = []
	private _workflow: WorkflowType
	private _spreadsheetHandler: SpreadsheetHandler | undefined

	constructor(logger: winston.Logger, deviceOptions: DeviceConfig) {
		this.logger = logger
		this._workflow = 'ATEM'
		this._deviceOptions = deviceOptions
	}

	async init(
		_deviceOptions: DeviceConfig,
		config: CoreConfig,
		process: Process,
		spreadsheetHandler: SpreadsheetHandler
	): Promise<void> {
		// this.logger.info('========')

		this._coreConfig = config
		this._process = process
		this._spreadsheetHandler = spreadsheetHandler

		this.core = new CoreConnection(this.getCoreConnectionOptions())

		this.core.onConnected(() => {
			this.logger.info('Core Connected!')
			if (this._statusInitialized) this.onConnectionRestored()
		})
		this.core.onDisconnected(() => {
			this.logger.info('Core Disconnected!')
		})
		this.core.onError((err) => {
			if (err instanceof Error) {
				this.logger.error('Core Error: ' + (err.message || err.toString() || err))
			}
			this.logger.error('Core Error: ' + (err.toString() || err))
		})

		const ddpConfig: DDPConnectorOptions = {
			host: config.host,
			port: config.port,
		}
		if (this._process && this._process.certificates.length) {
			ddpConfig.tlsOpts = {
				ca: this._process.certificates,
			}
		}
		await this.core.init(ddpConfig)
		await this.setupObserversAndSubscriptions()
		this._statusInitialized = true
		await this.updateCoreStatus()
	}
	async setupObserversAndSubscriptions(): Promise<void> {
		this.logger.info('Core: Setting up subscriptions..')
		this.logger.info('DeviceId: ' + this.core.deviceId)
		await Promise.all([
			this.core.autoSubscribe('peripheralDeviceForDevice', this.core.deviceId),
			this.core.autoSubscribe('studios', [this.core.deviceId]),
			this.core.autoSubscribe('peripheralDeviceCommands', this.core.deviceId),
		])
		this.logger.info('Core: Subscriptions are set up!')
		if (this._observers.length) {
			this.logger.info('Core: Clearing observers..')
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		// setup observers
		const observer = this.core.observe('peripheralDeviceForDevice')
		observer.added = (id: string) => {
			this.onDeviceChanged(protectString(id))
		}
		observer.changed = (id1: string) => {
			this.onDeviceChanged(protectString(id1))
		}
		this.setupObserverForPeripheralDeviceCommands(this)
		return
	}
	async dispose(): Promise<void> {
		return this.core
			.setStatus({
				statusCode: StatusCode.FATAL,
				messages: ['Shutting down'],
			})
			.then(async () => {
				return this.core.destroy()
			})
			.then(() => {
				// nothing
			})
	}
	setStatus(statusCode: StatusCode, messages: string[]): void {
		this.core
			.setStatus({
				statusCode: statusCode,
				messages: messages,
			})
			.catch((e) => this.logger.warn('Error when setting status:' + e))
	}
	getCoreConnectionOptions(): CoreOptions {
		const options: CoreOptions = {
			deviceId: protectString(this._deviceOptions.deviceId + 'spreadsheetgateway'),
			deviceToken: this._deviceOptions.deviceToken,

			deviceCategory: PeripheralDeviceCategory.INGEST,
			deviceType: PeripheralDeviceType.SPREADSHEET,

			deviceName: 'Spreadsheet Gateway',
			watchDog: this._coreConfig ? this._coreConfig.watchdog : true,
			configManifest: SPREADSHEET_DEVICE_CONFIG_MANIFEST,
			documentationUrl: 'pok',
			versions: this._getVersions(),
		}

		if (!options.deviceToken) {
			this.logger.warn('Token not set, only id! This might be unsecure!')
			options.deviceToken = 'unsecureToken'
		}

		return options
	}
	onConnectionRestored(): void {
		this.setupObserversAndSubscriptions().catch((e) => {
			this.logger.error(e)
		})
		if (this._onConnected) this._onConnected()
		// this._coreMosHandlers.forEach((cmh: CoreMosDeviceHandler) => {
		// 	cmh.setupSubscriptionsAndObservers()
		// })
	}
	onConnected(fcn: () => any): void {
		this._onConnected = fcn
	}

	/**
	 * Subscribes to the 'mediaObjects' collection.
	 * @param studioId The studio the media objects belong to.
	 */
	async setupSubscriptionForMediaObjects(studioId: string): Promise<void> {
		return Promise.all([
			// Media found by the media scanner.
			this.core.autoSubscribe('mediaObjects', studioId, {}),
		]).then(() => {
			// this.setupObserverForMediaObjects()

			return
		})
	}
	/**
	 * Subscribes to the 'showStyleBases' collection.
	 * @param studioId The studio the showstyles belong to.
	 */
	async setupSubscriptionForShowStyleBases(): Promise<void> {
		return Promise.all([this.core.autoSubscribe('showStyleBases', {})]).then(() => {
			this.setupObserverForShowStyleBases()
			return
		})
	}
	async updateCoreStatus(): Promise<any> {
		let statusCode = StatusCode.GOOD
		const messages: Array<string> = []

		if (this.deviceStatus !== StatusCode.GOOD) {
			statusCode = this.deviceStatus
			if (this.deviceMessages) {
				_.each(this.deviceMessages, (msg) => {
					messages.push(msg)
				})
			}
		}
		if (!this._statusInitialized) {
			statusCode = StatusCode.BAD
			messages.push('Starting up...')
		}
		if (this._statusDestroyed) {
			statusCode = StatusCode.BAD
			messages.push('Shut down')
		}

		if (this.core) {
			await this.core.setStatus({
				statusCode: statusCode,
				messages: messages,
			})
		}
	}
	onDeviceChanged(id: PeripheralDeviceId): void {
		if (id === this.core.deviceId) {
			const col = this.core.getCollection<PeripheralDeviceForDevice>('peripheralDeviceForDevice')
			if (!col) throw new Error('collection "peripheralDevices" not found!')

			const device = col.findOne(id)
			if (device) {
				if (!_.isEqual(this.deviceSettings, device.deviceSettings)) {
					this.deviceSettings = device.deviceSettings as { [key: string]: any }
				}
			} else {
				this.deviceSettings = {}
			}

			const logLevel = this.deviceSettings['debugLogging'] ? 'debug' : 'info'
			if (logLevel !== this.logger.level) {
				this.logger.level = logLevel

				this.logger.info('Loglevel: ' + this.logger.level)
			}

			if (this._onChanged) this._onChanged()
		}
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	executeFunction(cmd: PeripheralDeviceCommand, fcnObject: any): void {
		if (cmd) {
			if (this._executedFunctions[unprotectString(cmd._id)]) return // prevent it from running multiple times
			this.logger.info(cmd.functionName ?? '(undefined)', cmd.args)
			this._executedFunctions[unprotectString(cmd._id)] = true
			// console.log('executeFunction', cmd)
			const cb = (err: any, res?: any) => {
				// console.log('cb', err, res)
				if (err) {
					this.logger.error('executeFunction error', err, err.stack)
				}
				this.core.coreMethods
					.functionReply(cmd._id, err, res)
					.then(() => {
						// console.log('cb done')
					})
					.catch((e: Error) => {
						this.logger.error(e)
					})
			}

			if (cmd.functionName === undefined) {
				this.logger.error(`No function name provided in command "${cmd._id}", aborting`)
				cb('No function name provided')
				return
			}

			const fcn = fcnObject[cmd.functionName]
			try {
				if (!fcn) throw Error('Function "' + cmd.functionName + '" not found!')

				Promise.resolve(fcn.apply(fcnObject, cmd.args))
					.then((result) => {
						cb(null, result)
					})
					.catch((e) => {
						cb(e.toString(), null)
					})
			} catch (e) {
				if (e instanceof Error) {
					cb(e.toString(), null)
				} else {
					cb(`Unknown error: ${e}`, null)
				}
			}
		}
	}
	retireExecuteFunction(cmdId: string): void {
		delete this._executedFunctions[cmdId]
	}
	async receiveAuthToken(authToken: string): Promise<void> {
		console.log('received AuthToken', authToken)

		if (this.doReceiveAuthToken) {
			return this.doReceiveAuthToken(authToken)
		} else {
			throw new Error('doReceiveAuthToken not set!')
		}
	}

	/**
	 * Listen for commands and execute.
	 */
	setupObserverForPeripheralDeviceCommands(functionObject: CoreHandler): void {
		const observer = functionObject.core.observe('peripheralDeviceCommands')
		functionObject.killProcess(false)
		functionObject._observers.push(observer)
		const addedChangedCommand = (id: PeripheralDeviceCommandId) => {
			const cmds = functionObject.core.getCollection<PeripheralDeviceCommand>('peripheralDeviceCommands')
			if (!cmds) throw Error('"peripheralDeviceCommands" collection not found!')
			const cmd = cmds.findOne(id)
			if (!cmd) throw Error('PeripheralCommand "' + id + '" not found!')
			// console.log('addedChangedCommand', id)
			if (cmd.deviceId === functionObject.core.deviceId) {
				this.executeFunction(cmd, functionObject)
			} else {
				// console.log('not mine', cmd.deviceId, this.core.deviceId)
			}
		}
		observer.added = (id: string) => {
			addedChangedCommand(protectString(id))
		}
		observer.changed = (id: string) => {
			addedChangedCommand(protectString(id))
		}
		observer.removed = (id: string) => {
			this.retireExecuteFunction(id)
		}
		const cmds = functionObject.core.getCollection('peripheralDeviceCommands')
		if (!cmds) throw Error('"peripheralDeviceCommands" collection not found!')
		;(cmds.find({}) as PeripheralDeviceCommand[]).forEach((cmd: PeripheralDeviceCommand) => {
			if (cmd.deviceId === functionObject.core.deviceId) {
				this.executeFunction(cmd, functionObject)
			}
		})
	}
	/**
	 * Subscribes to changes to media objects to populate spreadsheet data.
	 */

	setupObserverForMediaObjects(): void {
		// Setup observer.
		const observer = this.core.observe('mediaObjects')
		this.killProcess(false)
		this._observers.push(observer)

		const addedChanged = (id: string) => {
			// Check collection exists.
			const media = this.core.getCollection<MediaObject>('mediaObjects')
			if (!media) throw Error('"mediaObjects" collection not found!')

			// Add file path to list.
			const file = media.findOne(protectString(id))
			constructMediaObject(file)
		}

		// Formats the duration as HH:MM:SS
		const formatDuration = (duration: number): string => {
			const hours = Math.floor(duration / 3600)
			duration -= hours * 3600
			const minutes = Math.floor(duration / 60)
			duration -= minutes * 60

			return `${hours}:${minutes}:${duration}`
		}

		// Constructs a MediaInfo object from file information.
		const constructMediaObject = (file: any) => {
			if ('mediaPath' in file) {
				let duration = 0
				let name = file['mediaPath']

				if ('mediainfo' in file) {
					duration = Number(file['mediainfo']['format']['duration']) || 0
					duration = Math.round(duration)
					name = file['mediainfo']['name']
				}

				this._mediaPaths[file._id] = {
					name: name,
					path: file['mediaPath'],
					duration: formatDuration(duration),
				}
			}
		}

		const removed = (id: string) => {
			if (id in this._mediaPaths) {
				delete this._mediaPaths[id]
			}
		}

		observer.added = (id: string) => {
			addedChanged(id)
		}

		observer.changed = (id: string) => {
			addedChanged(id)
		}

		observer.removed = (id: string) => {
			removed(id)
		}

		// Check collection exists.
		const media = this.core.getCollection('mediaObjects')
		if (!media) throw Error('"mediaObjects" collection not found!')

		// Add all media files to dictionary.
		media.find({}).forEach((file) => {
			constructMediaObject(file)
		})
	}

	setupObserverForShowStyleBases(): void {
		const observerStyles = this.core.observe('showStyleBases')
		this.killProcess(false)
		this._observers.push(observerStyles)

		const observerStudios = this.core.observe('studios')
		this.killProcess(false)
		this._observers.push(observerStudios)

		const addedChanged = () => {
			const showStyles = this.core.getCollection<DBShowStyleBase>('showStyleBases')
			if (!showStyles) throw Error('"showStyleBases" collection not found!')

			const studios = this.core.getCollection<DBStudio>('studios')
			if (!studios) throw Error('"studios" collection not found!')

			const studio = this._studioId ? studios.findOne(protectString(this._studioId)) : undefined
			if (studio) {
				this._outputLayers = []

				showStyles.find({}).forEach((style) => {
					if (studio.supportedShowStyleBase.indexOf(style._id) !== 1) {
						Object.values<IOutputLayer | undefined>(
							applyAndValidateOverrides(style.outputLayersWithOverrides).obj
						).forEach((layer) => {
							if (layer && !layer.isPGM) {
								this._outputLayers.push(layer)
							}
						})
					}
				})

				const settings = studio['config'] as Array<{ _id: string; value: string | boolean }>
				if (!settings) {
					this._workflow = 'ATEM' // default
				} else {
					settings.forEach((setting) => {
						if (setting._id.match(/^vmix$/i)) {
							if (setting.value === true) {
								this._workflow = 'VMIX'
							} else {
								this._workflow = 'ATEM'
							}
						}
					})
				}
			}
		}

		observerStyles.added = () => addedChanged()
		observerStyles.changed = () => addedChanged()
		observerStyles.removed = () => addedChanged()

		observerStudios.added = () => addedChanged()
		observerStudios.changed = () => addedChanged()
		observerStudios.removed = () => addedChanged()

		addedChanged()
	}
	/**
	 * Subscribes to changes to the device to get its associated studio ID.
	 */

	setupObserverForPeripheralDevices(): void {
		// Setup observer.
		const observer = this.core.observe('peripheralDeviceCommands')
		this.killProcess(false)
		this._observers.push(observer)

		const addedChanged = (id: string) => {
			// Check that collection exists.
			const devices = this.core.getCollection('peripheralDeviceForDevice')
			if (!devices) throw Error('"peripheralDeviceForDevice" collection not found!')

			// Find studio ID.
			const dev = devices.findOne(protectString(id))
			if (dev && 'studioId' in dev) {
				if (dev['studioId'] !== this._studioId) {
					this._studioId = dev['studioId']

					if (this._studioId) {
						// Subscribe to mediaObjects collection.
						this.setupSubscriptionForMediaObjects(this._studioId).catch((er) => {
							this.logger.error(er)
						})

						this.setupSubscriptionForShowStyleBases().catch((er) => {
							this.logger.error(er)
						})
					}
				}
			} else {
				throw Error('Could not get a studio for spreadsheet-gateway')
			}
		}

		observer.added = (id: string) => {
			addedChanged(id)
		}
		observer.changed = (id: string) => {
			addedChanged(id)
		}

		addedChanged(String(this.core.deviceId))
	}

	killProcess(actually: boolean): boolean {
		if (actually) {
			this.logger.info('KillProcess command received, shutting down in 1000ms!')
			setTimeout(() => {
				// eslint-disable-next-line no-process-exit
				process.exit(0)
			}, 1000)
			return true
		}
		return false
	}
	triggerReloadRundown(rundownId: string): void {
		this._spreadsheetHandler?.triggerReloadRundown(rundownId)
	}
	pingResponse(message: string): boolean {
		this.core.setPingResponse(message)
		return true
	}
	getSnapshot(): any {
		this.logger.info('getSnapshot')
		return {} // TODO: send some snapshot data?
	}
	private _getVersions() {
		const versions: { [packageName: string]: string } = {}

		if (process.env.npm_package_version) {
			versions['_process'] = process.env.npm_package_version
		}

		const dirNames = [
			'@sofie-automation/server-core-integration',
			// 'mos-connection'
		]
		try {
			const nodeModulesDirectories = fs.readdirSync('node_modules')
			_.each(nodeModulesDirectories, (dir) => {
				try {
					if (dirNames.indexOf(dir) !== -1) {
						let file = 'node_modules/' + dir + '/package.json'
						file = fs.readFileSync(file, 'utf8')
						const json = JSON.parse(file)
						versions[dir] = json.version || 'N/A'
					}
				} catch (e) {
					this.logger.error(e)
				}
			})
		} catch (e) {
			this.logger.error(e)
		}
		return versions
	}

	/**
	 * Returns the available media.
	 */
	public GetMedia(): MediaDict {
		return this._mediaPaths
	}

	public GetOutputLayers(): Array<IOutputLayer> {
		return this._outputLayers
	}

	public GetWorkflow(): WorkflowType {
		return this._workflow
	}
}
