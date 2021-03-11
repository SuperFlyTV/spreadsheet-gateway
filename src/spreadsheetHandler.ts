import * as _ from 'underscore'
import * as Winston from 'winston'
import {
	CollectionObj,
	PeripheralDeviceAPI as P
} from '@sofie-automation/server-core-integration'
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

import { CoreHandler } from './coreHandler'
import { RunningOrderWatcher } from './classes/RunningOrderWatcher'
import { mutateRundown, mutateSegment, mutatePart } from './mutate'

export interface SpreadsheetConfig {
	// Todo: add settings here?
	// self: IConnectionConfig
}
export interface SpreadsheetDeviceSettings {
	/** Path / Name to the Drive folder */
	folderPath: string
	debugLogging: boolean

	/** Set to true when secret value exists */
	secretCredentials: boolean
	secretAccessToken: boolean
}
export interface SpreadsheetDeviceSecretSettings {
	credentials?: Credentials
	accessToken?: AccessToken
}

export interface Credentials {
	installed: {
		client_id: string
		project_id: string
		auth_uri: string
		token_uri: string
		auth_provider_x509_cert_url: string
		client_secret: string
		redirect_uris: string[]
	}
}
export interface AccessToken {
	access_token: string
	refresh_token: string
	scope: string
	token_type: string
	expiry_date: number
}

const ACCESS_SCOPES = [
	'https://www.googleapis.com/auth/drive.readonly',
	'https://www.googleapis.com/auth/spreadsheets'
]

export class SpreadsheetHandler {

	public options: SpreadsheetConfig
	public debugLogging: boolean = false

	private spreadsheetWatcher?: RunningOrderWatcher
	// private allMosDevices: {[id: string]: IMOSDevice} = {}
	// private _ownMosDevices: {[deviceId: string]: MosDevice} = {}
	private _currentOAuth2Client: OAuth2Client | null = null
	private _currentOAuth2ClientAuthorized: boolean = false

	private _logger: Winston.LoggerInstance
	private _disposed: boolean = false
	private _settings?: SpreadsheetDeviceSettings
	private _coreHandler: CoreHandler
	private _observers: Array<any> = []
	private _triggerupdateDevicesTimeout: any = null

	constructor (logger: Winston.LoggerInstance, config: SpreadsheetConfig, coreHandler: CoreHandler) {
		this._logger = logger
		this.options = config
		this._coreHandler = coreHandler

		coreHandler.doReceiveAuthToken = (authToken: string) => {
			return this.receiveAuthToken(authToken)
		}
	}
	init (coreHandler: CoreHandler): Promise<void> {
		return coreHandler.core.getPeripheralDevice()
		.then((peripheralDevice: any) => {
			this._settings = peripheralDevice.settings || {}

			return this._initSpreadsheetConnection()
		})
		.then(() => {
			this._coreHandler.onConnected(() => {
				this.setupObservers()
			})
			this.setupObservers()

			return this._updateDevices()
			.catch(e => {
				if (e) throw e // otherwise just swallow it
			})
		})
	}
	dispose (): Promise<void> {
		this._disposed = true
		if (this.spreadsheetWatcher) {
			return Promise.resolve(this.spreadsheetWatcher.dispose())
		} else {
			return Promise.resolve()
		}
	}
	setupObservers () {
		if (this._observers.length) {
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		this._logger.info('Renewing observers')

		let deviceObserver = this._coreHandler.core.observe('peripheralDevices')
		deviceObserver.added = () => { this._deviceOptionsChanged() }
		deviceObserver.changed = () => { this._deviceOptionsChanged() }
		deviceObserver.removed = () => { this._deviceOptionsChanged() }
		this._observers.push(deviceObserver)

		this._deviceOptionsChanged()

	}
	debugLog (msg: any, ...args: any[]) {
		if (this.debugLogging) {
			this._logger.debug(msg, ...args)
		}
	}
	receiveAuthToken (authToken: string) {
		return new Promise((resolve, reject) => {
			if (this._currentOAuth2Client) {

				const oAuth2Client = this._currentOAuth2Client

				oAuth2Client.getToken(authToken, (err, accessToken) => {
					if (err) {
						return reject(err)
					} else if (!accessToken) {
						return reject(new Error('No accessToken received'))
					} else {
						oAuth2Client.setCredentials(accessToken)
						this._currentOAuth2ClientAuthorized = true

						// Store for later use:
						this._coreHandler.core.callMethod(P.methods.storeAccessToken, [accessToken])
						.catch(this._logger.error)

						resolve()
					}
				})
			} else {
				throw Error('No Authorization is currently in progress!')
			}
		})

	}
	private _deviceOptionsChanged () {
		let peripheralDevice = this.getThisPeripheralDevice()
		if (peripheralDevice) {
			let settings: SpreadsheetDeviceSettings = peripheralDevice.settings || {}
			if (this.debugLogging !== settings.debugLogging) {
				this._logger.info('Changing debugLogging to ' + settings.debugLogging)

				this.debugLogging = settings.debugLogging

				// this.spreadsheetWatcher.setDebug(settings.debugLogging)

				if (settings.debugLogging) {
					this._logger.level = 'debug'
				} else {
					this._logger.level = 'info'
				}
				this._logger.info('log level ' + this._logger.level)
				this._logger.info('test log info')
				console.log('test console.log')
				this._logger.debug('test log debug')
			}
		}
		if (this._triggerupdateDevicesTimeout) {
			clearTimeout(this._triggerupdateDevicesTimeout)
		}
		this._triggerupdateDevicesTimeout = setTimeout(() => {
			this._updateDevices()
			.catch(e => {
				if (e) this._logger.error(e)
			})
		}, 20)
	}
	private async _initSpreadsheetConnection (): Promise<void> {
		if (this._disposed) return Promise.resolve()
		if (!this._settings) throw Error('Spreadsheet-Settings are not set')

		this._logger.info('Initializing Spreadsheet connection...')

	}
	private getThisPeripheralDevice (): CollectionObj | undefined {
		let peripheralDevices = this._coreHandler.core.getCollection('peripheralDevices')
		return peripheralDevices.findOne(this._coreHandler.core.deviceId)
	}
	private _updateDevices (): Promise<void> {
		if (this._disposed) return Promise.resolve()
		return (
			!this.spreadsheetWatcher ?
			this._initSpreadsheetConnection() :
			Promise.resolve()
		)
		.then(async () => {
			let peripheralDevice = this.getThisPeripheralDevice()

			if (peripheralDevice) {
				let settings: SpreadsheetDeviceSettings = peripheralDevice.settings || {}
				let secretSettings: SpreadsheetDeviceSecretSettings = peripheralDevice.secretSettings || {}

				if (!secretSettings.credentials) {
					this._coreHandler.setStatus(P.StatusCode.BAD, ['Not set up: Credentials missing'])
					return
				}

				const credentials = secretSettings.credentials
				const accessToken = secretSettings.accessToken

				let authClient = await this.createAuthClient(credentials, accessToken)

				if (!secretSettings.accessToken) {
					this._coreHandler.setStatus(P.StatusCode.BAD, ['Not set up: AccessToken missing'])
					return
				}

				if (!authClient) {
					this._coreHandler.setStatus(P.StatusCode.BAD, ['Internal error: authClient not set'])
					return
				}

				if (!settings.folderPath) {
					this._coreHandler.setStatus(P.StatusCode.BAD, ['Not set up: FolderPath missing'])
					return
				}

				// At this point we're authorized and good to go!

				if (
					!this.spreadsheetWatcher ||
					this.spreadsheetWatcher.sheetFolderName !== settings.folderPath
				) {

					this._coreHandler.setStatus(P.StatusCode.UNKNOWN, ['Initializing..'])

					// this._logger.info('GO!')

					if (this.spreadsheetWatcher) {
						this.spreadsheetWatcher.dispose()
						delete this.spreadsheetWatcher
					}
					const watcher = new RunningOrderWatcher(authClient, this._coreHandler, 'v0.2')
					this.spreadsheetWatcher = watcher

					watcher
					.on('info', (message: any) => {
						this._logger.info(message)
					})
					.on('error', (error: any) => {
						this._logger.error(error)
					})
					.on('warning', (warning: any) => {
						this._logger.error(warning)
					})
					// TODO - these event types should operate on the correct types and with better parameters
					.on('rundown_delete', (rundownExternalId) => {
						this._coreHandler.core.callMethod(P.methods.dataRundownDelete, [rundownExternalId]).catch(this._logger.error)
					})
					.on('rundown_create', (_rundownExternalId, rundown) => {
						this._coreHandler.core.callMethod(P.methods.dataRundownCreate, [mutateRundown(rundown)]).catch(this._logger.error)
					})
					.on('rundown_update', (_rundownExternalId, rundown) => {
						this._coreHandler.core.callMethod(P.methods.dataRundownUpdate, [mutateRundown(rundown)]).catch(this._logger.error)
					})
					.on('segment_delete', (rundownExternalId, sectionId) => {
						this._coreHandler.core.callMethod(P.methods.dataSegmentDelete, [rundownExternalId, sectionId]).catch(this._logger.error)
					})
					.on('segment_create', (rundownExternalId, _sectionId, newSection) => {
						this._coreHandler.core.callMethod(P.methods.dataSegmentCreate, [rundownExternalId, mutateSegment(newSection)]).catch(this._logger.error)
					})
					.on('segment_update', (rundownExternalId, _sectionId, newSection) => {
						this._coreHandler.core.callMethod(P.methods.dataSegmentUpdate, [rundownExternalId, mutateSegment(newSection)]).catch(this._logger.error)
					})
					.on('part_delete', (rundownExternalId, sectionId, storyId) => {
						this._coreHandler.core.callMethod(P.methods.dataPartDelete, [rundownExternalId, sectionId, storyId]).catch(this._logger.error)
					})
					.on('part_create', (rundownExternalId, sectionId, _storyId, newStory) => {
						this._coreHandler.core.callMethod(P.methods.dataPartCreate, [rundownExternalId, sectionId, mutatePart(newStory)]).catch(this._logger.error)
					})
					.on('part_update', (rundownExternalId, sectionId, _storyId, newStory) => {
						this._coreHandler.core.callMethod(P.methods.dataPartUpdate, [rundownExternalId, sectionId, mutatePart(newStory)]).catch(this._logger.error)
					})

					if (settings.folderPath) {
						this._logger.info(`Starting watch of folder "${settings.folderPath}"`)
						watcher.setDriveFolder(settings.folderPath)
						.then(() => this._coreHandler.setStatus(P.StatusCode.GOOD, [`Watching folder '${settings.folderPath}'`]))
						.catch(e => {
							console.log('Error in addSheetsFolderToWatch', e)
						})
					}
				}
			}
			return Promise.resolve()
		})
		.then(() => {
			return
		})
	}
	/**
	 * Get an authentication client towards Google drive on behalf of the user,
	 * or prompt for login.
	 *
	 * @param credentials Credentials from credentials.json which you get from Google
	 */
	private createAuthClient (credentials: Credentials, accessToken?: any): Promise<OAuth2Client | null> {

		if (
			this._currentOAuth2Client
		) {
			if (!this._currentOAuth2ClientAuthorized) {
				// there is already a authentication in progress..
				return Promise.resolve(null)
			} else {
				return Promise.resolve(this._currentOAuth2Client)
			}
		}

		this._currentOAuth2Client = new google.auth.OAuth2(
			credentials.installed.client_id,
			credentials.installed.client_secret,
			credentials.installed.redirect_uris[0]
		)

		if (accessToken) {
			this._currentOAuth2Client.setCredentials(accessToken)
			this._currentOAuth2ClientAuthorized = true
			return Promise.resolve(this._currentOAuth2Client)
		} else {
			// If we don't have an accessToken, request it from the user.
			this._logger.info('Requesting auth token from user..')

			const authUrl = this._currentOAuth2Client.generateAuthUrl({
				access_type: 'offline',
				scope: ACCESS_SCOPES,
				prompt: 'consent'
			})

			// This will prompt the user in Core, which will fillow the link, and provide us with an access token.
			// user will eventually call this.receiveAuthToken()
			return this._coreHandler.core.callMethod(P.methods.requestUserAuthToken, [authUrl])
			.then(() => {
				return Promise.resolve(null)
			})
		}
	}
}
