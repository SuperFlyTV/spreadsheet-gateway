import { CoreConnection,
	CoreOptions,
	PeripheralDeviceAPI as P,
	DDPConnectorOptions
} from '@sofie-automation/server-core-integration'
import * as Winston from 'winston'
import * as fs from 'fs'
import { Process } from './process'

import * as _ from 'underscore'

import { DeviceConfig } from './connector'
import { MediaDict } from './classes/media'
import { IOutputLayer } from '@sofie-automation/blueprints-integration'
import { SPREADSHEET_DEVICE_CONFIG_MANIFEST } from './configManifest'
// import { STATUS_CODES } from 'http'
export interface PeripheralDeviceCommand {
	_id: string

	deviceId: string
	functionName: string
	args: Array<any>

	hasReply: boolean
	reply?: any
	replyError?: any

	time: number // time
}
export interface CoreConfig {
	host: string,
	port: number,
	watchdog: boolean
}
export type WorkflowType = 'ATEM' | 'VMIX'
/**
 * Represents a connection between mos-integration and Core
 */
export class CoreHandler {

	public core: CoreConnection
	public doReceiveAuthToken?: (authToken: string) => Promise<any>

	private logger: Winston.LoggerInstance
	private _observers: Array<any> = []
	private _onConnected?: () => any
	private _subscriptions: Array<any> = []
	private _isInitialized: boolean = false
	private _executedFunctions: {[id: string]: boolean} = {}
	private _coreConfig?: CoreConfig
	private _process?: Process
	private _studioId: string
	private _mediaPaths: MediaDict = {}
	private _outputLayers: IOutputLayer[] = []
	private _workflow: WorkflowType

	constructor (logger: Winston.LoggerInstance, deviceOptions: DeviceConfig) {
		this.logger = logger
		this.core = new CoreConnection(this.getCoreConnectionOptions(deviceOptions, 'Spreadsheet Gateway'))
	}

	init (_deviceOptions: DeviceConfig, config: CoreConfig, process: Process): Promise<void> {
		// this.logger.info('========')

		this._coreConfig = config
		this._process = process

		this.core.onConnected(() => {
			this.logger.info('Core Connected!')
			if (this._isInitialized) this.onConnectionRestored()
		})
		this.core.onDisconnected(() => {
			this.logger.info('Core Disconnected!')
		})
		this.core.onError((err) => {
			this.logger.error('Core Error: ' + (err.message || err.toString() || err))
		})

		let ddpConfig: DDPConnectorOptions = {
			host: config.host,
			port: config.port
		}
		if (this._process && this._process.certificates.length) {
			ddpConfig.tlsOpts = {
				ca: this._process.certificates
			}
		}
		return this.core.init(ddpConfig).then((id: string) => {
			id = id // tsignore

			this.core.setStatus({
				statusCode: P.StatusCode.UNKNOWN,
				messages: ['Starting up']
			})
			.catch(e => this.logger.warn('Error when setting status:' + e))
			// nothing
		})
		.then(() => {
			return this.setupSubscriptionsAndObservers()
		})
		.then(() => {
			this._isInitialized = true
		})
	}
	dispose (): Promise<void> {
		return this.core.setStatus({
			statusCode: P.StatusCode.FATAL,
			messages: ['Shutting down']
		})
		.then(() => {
			return this.core.destroy()
		})
		.then(() => {
			// nothing
		})
	}
	setStatus (statusCode: P.StatusCode, messages: string[]) {
		this.core.setStatus({
			statusCode: statusCode,
			messages: messages
		})
		.catch(e => this.logger.warn('Error when setting status:' + e))
	}
	getCoreConnectionOptions (deviceOptions: DeviceConfig, name: string): CoreOptions {
		let credentials: {
			deviceId: string
			deviceToken: string
		}

		if (deviceOptions.deviceId && deviceOptions.deviceToken) {
			credentials = {
				deviceId: deviceOptions.deviceId,
				deviceToken: deviceOptions.deviceToken
			}
		} else if (deviceOptions.deviceId) {
			this.logger.warn('Token not set, only id! This might be unsecure!')
			credentials = {
				deviceId: deviceOptions.deviceId + name,
				deviceToken: 'unsecureToken'
			}
		} else {
			credentials = CoreConnection.getCredentials(name.replace(/ /g,''))
		}
		let options: CoreOptions = {
			...credentials,

			deviceCategory: P.DeviceCategory.INGEST,
			deviceType: P.DeviceType.SPREADSHEET,
			deviceSubType: P.SUBTYPE_PROCESS,

			deviceName: name,
			watchDog: (this._coreConfig ? this._coreConfig.watchdog : true),

			configManifest: SPREADSHEET_DEVICE_CONFIG_MANIFEST
		}
		options.versions = this._getVersions()
		return options
	}
	onConnectionRestored () {
		this.setupSubscriptionsAndObservers()
		.catch((e) => {
			this.logger.error(e)
		})
		if (this._onConnected) this._onConnected()
		// this._coreMosHandlers.forEach((cmh: CoreMosDeviceHandler) => {
		// 	cmh.setupSubscriptionsAndObservers()
		// })
	}
	onConnected (fcn: () => any) {
		this._onConnected = fcn
	}
	/**
	 * Subscribes to events in the core.
	 */
	setupSubscriptionsAndObservers (): Promise<void> {
		if (this._observers.length) {
			this.logger.info('Core: Clearing observers..')
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		this._subscriptions = []

		this.logger.info('Core: Setting up subscriptions for ' + this.core.deviceId + '..')
		return Promise.all([
			this.core.autoSubscribe('peripheralDevices', {
				_id: this.core.deviceId
			}),
			this.core.autoSubscribe('peripheralDeviceCommands', this.core.deviceId),
			this.core.autoSubscribe('peripheralDevices', this.core.deviceId)
		])
		.then((subs) => {
			this._subscriptions = this._subscriptions.concat(subs)
		})
		.then(() => {
			this.setupObserverForPeripheralDeviceCommands()
			this.setupObserverForPeripheralDevices()

			return
		})
	}

	/**
	 * Subscribes to the 'mediaObjects' collection.
	 * @param studioId The studio the media objects belong to.
	 */
	setupSubscriptionForMediaObjects (studioId: string): Promise<void> {
		return Promise.all([
			// Media found by the media scanner.
			this.core.autoSubscribe('mediaObjects', studioId, {})
		])
		.then(() => {
			this.setupObserverForMediaObjects()

			return
		})
	}
	/**
	 * Subscribes to the 'showStyleBases' collection.
	 * @param studioId The studio the showstyles belong to.
	 */
	setupSubscriptionForShowStyleBases (): Promise<void> {
		return Promise.all([
			this.core.autoSubscribe('showStyleBases', {}),
			this.core.autoSubscribe('studios', {})
		])
		.then(() => {
			this.setupObserverForShowStyleBases()

			return
		})
	}
	executeFunction (cmd: PeripheralDeviceCommand, fcnObject: any) {
		if (cmd) {
			if (this._executedFunctions[cmd._id]) return // prevent it from running multiple times
			this.logger.debug(cmd.functionName, cmd.args)
			this._executedFunctions[cmd._id] = true
			let cb = (err: any, res?: any) => {
				if (err) {
					this.logger.error('executeFunction error', err, err.stack)
				}
				this.core.callMethod(P.methods.functionReply, [cmd._id, err, res])
				.catch((e) => {
					this.logger.error(e)
				})
			}
			// @ts-ignore
			let fcn: Function = fcnObject[cmd.functionName]
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
				cb(e.toString(), null)
			}
		}
	}
	retireExecuteFunction (cmdId: string) {
		delete this._executedFunctions[cmdId]
	}
	receiveAuthToken (authToken: string) {
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
	setupObserverForPeripheralDeviceCommands () {
		let observer = this.core.observe('peripheralDeviceCommands')
		this.killProcess(0) // just make sure it exists
		this._observers.push(observer)

		/**
		 * Called when a command is added/changed. Executes that command.
		 * @param {string} id Command id to execute.
		 */
		let addedChangedCommand = (id: string) => {
			let cmds = this.core.getCollection('peripheralDeviceCommands')
			if (!cmds) throw Error('"peripheralDeviceCommands" collection not found!')
			let cmd = cmds.findOne(id) as PeripheralDeviceCommand
			if (!cmd) throw Error('PeripheralCommand "' + id + '" not found!')
			if (cmd.deviceId === this.core.deviceId) {
				this.executeFunction(cmd, this)
			}
		}
		observer.added = (id: string) => {
			addedChangedCommand(id)
		}
		observer.changed = (id: string) => {
			addedChangedCommand(id)
		}
		observer.removed = (id: string) => {
			this.retireExecuteFunction(id)
		}
		let cmds = this.core.getCollection('peripheralDeviceCommands')
		if (!cmds) throw Error('"peripheralDeviceCommands" collection not found!')
		cmds.find({}).forEach((cmd0) => {
			let cmd = cmd0 as PeripheralDeviceCommand
			if (cmd.deviceId === this.core.deviceId) {
				this.executeFunction(cmd, this)
			}
		})
	}
	/**
	 * Subscribes to changes to media objects to populate spreadsheet data.
	 */
	setupObserverForMediaObjects () {
		// Setup observer.
		let observer = this.core.observe('mediaObjects')
		this.killProcess(0)
		this._observers.push(observer)

		let addedChanged = (id: string) => {
			// Check collection exists.
			let media = this.core.getCollection('mediaObjects')
			if (!media) throw Error('"mediaObjects" collection not found!')

			// Add file path to list.
			let file = media.findOne({ _id: id })
			constructMediaObject(file)
		}

		// Formats the duration as HH:MM:SS
		let formatDuration = (duration: number): string => {
			let hours = Math.floor(duration / 3600)
			duration -= hours * 3600
			let minutes = Math.floor(duration / 60)
			duration -= minutes * 60

			return `${hours}:${minutes}:${duration}`
		}

		// Constructs a MediaInfo object from file information.
		let constructMediaObject = (file: any) => {
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
					duration: formatDuration(duration)
				}
			}
		}

		let removed = (id: string) => {
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
		let media = this.core.getCollection('mediaObjects')
		if (!media) throw Error('"mediaObjects" collection not found!')

		// Add all media files to dictionary.
		media.find({}).forEach(file => {
			constructMediaObject(file)
		})
	}
	setupObserverForShowStyleBases () {
		let observerStyles = this.core.observe('showStyleBases')
		this.killProcess(0)
		this._observers.push(observerStyles)

		let observerStudios = this.core.observe('studios')
		this.killProcess(0)
		this._observers.push(observerStudios)

		let addedChanged = () => {
			let showStyles = this.core.getCollection('showStyleBases')
			if (!showStyles) throw Error('"showStyleBases" collection not found!')

			let studios = this.core.getCollection('studios')
			if (!studios) throw Error('"studios" collection not found!')

			let studio = studios.findOne({ _id: this._studioId })
			if (studio) {

				this._outputLayers = []

				showStyles.find({})
				.forEach(style => {
					if ((studio['supportedShowStyleBase'] as Array<string>).indexOf(style._id) !== 1) {
						(style['outputLayers'] as IOutputLayer[]).forEach(layer => {
							if (!layer.isPGM) {
								this._outputLayers.push(layer)
							}
						})
					}
				})

				let settings = studio['config'] as Array<{_id: string, value: string | boolean}>
				settings.forEach(setting => {
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
	setupObserverForPeripheralDevices () {
		// Setup observer.
		let observer = this.core.observe('peripheralDevices')
		this.killProcess(0)
		this._observers.push(observer)

		let addedChanged = (id: string) => {
			// Check that collection exists.
			let devices = this.core.getCollection('peripheralDevices')
			if (!devices) throw Error('"peripheralDevices" collection not found!')

			// Find studio ID.
			let dev = devices.findOne({ _id: id })
			if ('studioId' in dev) {
				if (dev['studioId'] !== this._studioId) {
					this._studioId = dev['studioId']

					// Subscribe to mediaObjects collection.
					this.setupSubscriptionForMediaObjects(this._studioId).catch(er => {
						this.logger.error(er)
					})

					this.setupSubscriptionForShowStyleBases().catch(er => {
						this.logger.error(er)
					})
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

		addedChanged(this.core.deviceId)
	}
	killProcess (actually: number) {
		if (actually === 1) {
			this.logger.info('KillProcess command received, shutting down in 1000ms!')
			setTimeout(() => {
				process.exit(0)
			}, 1000)
			return true
		}
		return 0
	}
	pingResponse (message: string) {
		this.core.setPingResponse(message)
		return true
	}
	getSnapshot (): any {
		this.logger.info('getSnapshot')
		return {} // TODO: send some snapshot data?
	}
	private _getVersions () {
		let versions: {[packageName: string]: string} = {}

		if (process.env.npm_package_version) {
			versions['_process'] = process.env.npm_package_version
		}

		let dirNames = [
			'@sofie-automation/server-core-integration'
			// 'mos-connection'
		]
		try {
			let nodeModulesDirectories = fs.readdirSync('node_modules')
			_.each(nodeModulesDirectories, (dir) => {
				try {
					if (dirNames.indexOf(dir) !== -1) {
						let file = 'node_modules/' + dir + '/package.json'
						file = fs.readFileSync(file, 'utf8')
						let json = JSON.parse(file)
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
	public GetMedia (): MediaDict {
		return this._mediaPaths
	}

	public GetOutputLayers (): Array<IOutputLayer> {
		return this._outputLayers
	}

	public GetWorkflow (): WorkflowType {
		return this._workflow
	}
}
