import { CoreConnection,
	CoreOptions,
	PeripheralDeviceAPI as P,
	DDPConnectorOptions
} from 'tv-automation-server-core-integration'
import * as Winston from 'winston'
import * as fs from 'fs'
import { Process } from './process'

import * as _ from 'underscore'

import { DeviceConfig } from './connector'
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
		let credentials

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
		let options: CoreOptions = _.extend(credentials, {
			deviceType: P.DeviceType.SPREADSHEET,
			deviceName: name,
			watchDog: (this._coreConfig ? this._coreConfig.watchdog : true)
		})
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
			this.core.autoSubscribe('peripheralDeviceCommands', this.core.deviceId)
		])
		.then((subs) => {
			this._subscriptions = this._subscriptions.concat(subs)
		})
		.then(() => {

			this.setupObserverForPeripheralDeviceCommands()

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
	setupObserverForPeripheralDeviceCommands () {
		let observer = this.core.observe('peripheralDeviceCommands')
		this.killProcess(0) // just make sure it exists
		this._observers.push(observer)
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
			'tv-automation-server-core-integration'
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
}
