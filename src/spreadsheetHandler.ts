import { CollectionObj, PeripheralDeviceAPI as P } from '@sofie-automation/server-core-integration'
import { google } from 'googleapis'
import { Auth } from 'googleapis'

import { CoreHandler } from './coreHandler'
import { RunningOrderWatcher } from './classes/RunningOrderWatcher'
import { mutateRundown, mutateSegment, mutatePart } from './mutate'
import { StatusCode } from '@sofie-automation/blueprints-integration'
import { logger } from './logger'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
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

const ACCESS_SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets']

export class SpreadsheetHandler {
	public options: SpreadsheetConfig
	public debugLogging = false

	private spreadsheetWatcher?: RunningOrderWatcher
	// private allMosDevices: {[id: string]: IMOSDevice} = {}
	// private _ownMosDevices: {[deviceId: string]: MosDevice} = {}
	private _currentOAuth2Client: Auth.OAuth2Client | null = null
	private _currentOAuth2ClientAuthorized = false

	private _disposed = false
	private _settings?: SpreadsheetDeviceSettings
	private _coreHandler: CoreHandler
	private _observers: Array<any> = []
	private _triggerupdateDevicesTimeout: any = null
	private _coreUrl: URL | undefined
	private _deviceId: string | undefined

	constructor(config: SpreadsheetConfig, coreHandler: CoreHandler) {
		this.options = config
		this._coreHandler = coreHandler

		coreHandler.doReceiveAuthToken = async (authToken: string): Promise<void> => {
			return this.receiveAuthToken(authToken)
		}
	}
	async init(coreHandler: CoreHandler): Promise<void> {
		return coreHandler.core
			.getPeripheralDevice()
			.then(async (peripheralDevice: any) => {
				this._settings = peripheralDevice.settings || {}

				return this._initSpreadsheetConnection()
			})
			.then(async () => {
				this._coreHandler.onConnected(() => {
					this.setupObservers()
				})
				this.setupObservers()

				return this._updateDevices().catch((e) => {
					if (e) throw e // otherwise just swallow it
				})
			})
	}
	async dispose(): Promise<void> {
		this._disposed = true
		if (this.spreadsheetWatcher) {
			return Promise.resolve(this.spreadsheetWatcher.dispose())
		} else {
			return Promise.resolve()
		}
	}
	setupObservers(): void {
		if (this._observers.length) {
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		logger.info('Renewing observers')

		const deviceObserver = this._coreHandler.core.observe('peripheralDevices')
		deviceObserver.added = () => {
			this._deviceOptionsChanged()
		}
		deviceObserver.changed = () => {
			this._deviceOptionsChanged()
		}
		deviceObserver.removed = () => {
			this._deviceOptionsChanged()
		}
		this._observers.push(deviceObserver)

		this._deviceOptionsChanged()
	}
	debugLog(msg: string, ...args: any[]): void {
		if (this.debugLogging) {
			logger.debug(msg, ...args)
		}
	}
	async receiveAuthToken(authToken: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this._currentOAuth2Client) {
				const oAuth2Client = this._currentOAuth2Client

				// Here redirect_uri just needs to match what was sent previously to satisfy Google's security requirements
				oAuth2Client.getToken(
					{ code: authToken, redirect_uri: `${this._coreUrl?.toString()}/devices/${this._deviceId}/oauthResponse` },
					(err, accessToken) => {
						if (err) {
							return reject(err)
						} else if (!accessToken) {
							return reject(new Error('No accessToken received'))
						} else {
							oAuth2Client.setCredentials(accessToken)
							this._currentOAuth2ClientAuthorized = true

							// Store for later use:
							this._coreHandler.core.callMethod(P.methods.storeAccessToken, [accessToken]).catch(logger.error)

							resolve()
						}
					}
				)
			} else {
				throw Error('No Authorization is currently in progress!')
			}
		})
	}
	triggerReloadRundown(rundownId: string): void {
		void this.spreadsheetWatcher?.checkRunningOrderById(rundownId, true)
	}
	private _deviceOptionsChanged() {
		const peripheralDevice = this.getThisPeripheralDevice()
		if (peripheralDevice) {
			const settings: SpreadsheetDeviceSettings = peripheralDevice.settings || {}
			if (this.debugLogging !== settings.debugLogging) {
				logger.info('Changing debugLogging to ' + settings.debugLogging)

				this.debugLogging = settings.debugLogging

				// this.spreadsheetWatcher.setDebug(settings.debugLogging)

				if (settings.debugLogging) {
					logger.level = 'debug'
				} else {
					logger.level = 'info'
				}
				logger.info('log level ' + logger.level)
				logger.info('test log info')
				console.log('test console.log')
				logger.debug('test log debug')
			}
		}
		if (this._triggerupdateDevicesTimeout) {
			clearTimeout(this._triggerupdateDevicesTimeout)
		}
		this._triggerupdateDevicesTimeout = setTimeout(() => {
			this._updateDevices().catch((e) => {
				if (e) logger.error(e)
			})
		}, 20)
	}
	private async _initSpreadsheetConnection(): Promise<void> {
		if (this._disposed) return Promise.resolve()
		if (!this._settings) throw Error('Spreadsheet-Settings are not set')

		logger.info('Initializing Spreadsheet connection...')
	}
	private getThisPeripheralDevice(): CollectionObj | undefined {
		const peripheralDevices = this._coreHandler.core.getCollection('peripheralDevices')
		return peripheralDevices.findOne(this._coreHandler.core.deviceId)
	}
	private async _updateDevices(): Promise<void> {
		if (this._disposed) return Promise.resolve()
		return (!this.spreadsheetWatcher ? this._initSpreadsheetConnection() : Promise.resolve())
			.then(async () => {
				const peripheralDevice = this.getThisPeripheralDevice()

				if (peripheralDevice) {
					const settings: SpreadsheetDeviceSettings = peripheralDevice.settings || {}
					const secretSettings: SpreadsheetDeviceSecretSettings = peripheralDevice.secretSettings || {}

					if (!secretSettings.credentials) {
						this._coreHandler.setStatus(P.StatusCode.BAD, ['Not set up: Credentials missing'])
						return
					}

					const credentials = secretSettings.credentials
					const accessToken = secretSettings.accessToken

					const authClient = await this.createAuthClient(credentials, accessToken)

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

					if (!this.spreadsheetWatcher || this.spreadsheetWatcher.sheetFolderName !== settings.folderPath) {
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
								logger.info(message)
							})
							.on('error', (error: any) => {
								logger.error(error)
							})
							.on('warning', (warning: any) => {
								logger.error(warning)
							})
							// TODO - these event types should operate on the correct types and with better parameters
							.on('rundown_delete', (rundownExternalId) => {
								this._coreHandler.core.callMethod(P.methods.dataRundownDelete, [rundownExternalId]).catch(logger.error)
							})
							.on('rundown_create', (_rundownExternalId, rundown) => {
								this._coreHandler.core
									.callMethod(P.methods.dataRundownCreate, [mutateRundown(rundown)])
									.catch(logger.error)
							})
							.on('rundown_update', (_rundownExternalId, rundown) => {
								this._coreHandler.core
									.callMethod(P.methods.dataRundownUpdate, [mutateRundown(rundown)])
									.catch(logger.error)
							})
							.on('segment_delete', (rundownExternalId, sectionId) => {
								this._coreHandler.core
									.callMethod(P.methods.dataSegmentDelete, [rundownExternalId, sectionId])
									.catch(logger.error)
							})
							.on('segment_create', (rundownExternalId, _sectionId, newSection) => {
								this._coreHandler.core
									.callMethod(P.methods.dataSegmentCreate, [rundownExternalId, mutateSegment(newSection)])
									.catch(logger.error)
							})
							.on('segment_update', (rundownExternalId, _sectionId, newSection) => {
								this._coreHandler.core
									.callMethod(P.methods.dataSegmentUpdate, [rundownExternalId, mutateSegment(newSection)])
									.catch(logger.error)
							})
							.on('part_delete', (rundownExternalId, sectionId, storyId) => {
								this._coreHandler.core
									.callMethod(P.methods.dataPartDelete, [rundownExternalId, sectionId, storyId])
									.catch(logger.error)
							})
							.on('part_create', (rundownExternalId, sectionId, _storyId, newStory) => {
								this._coreHandler.core
									.callMethod(P.methods.dataPartCreate, [rundownExternalId, sectionId, mutatePart(newStory)])
									.catch(logger.error)
							})
							.on('part_update', (rundownExternalId, sectionId, _storyId, newStory) => {
								this._coreHandler.core
									.callMethod(P.methods.dataPartUpdate, [rundownExternalId, sectionId, mutatePart(newStory)])
									.catch(logger.error)
							})

						if (settings.folderPath) {
							logger.info(`Starting watch of folder "${settings.folderPath}"`)
							watcher
								.setDriveFolder(settings.folderPath)
								.then(() =>
									this._coreHandler.setStatus(P.StatusCode.GOOD, [`Watching folder '${settings.folderPath}'`])
								)
								.catch((e) => {
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
	private async createAuthClient(credentials: Credentials, accessToken?: any): Promise<Auth.OAuth2Client | null> {
		if (this._currentOAuth2Client) {
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
			logger.info('Requesting auth token from user..')

			if (!this._coreUrl) {
				logger.error(`Core URL not set`)
				this._coreHandler.setStatus(StatusCode.BAD, ['Core URL Not set on studio'])
				return Promise.reject()
			}

			const authUrl = this._currentOAuth2Client.generateAuthUrl({
				access_type: 'offline',
				scope: ACCESS_SCOPES,
				prompt: 'consent',
				redirect_uri: `${this._coreUrl.toString()}/devices/${this._deviceId}/oauthResponse`,
			})

			// This will prompt the user in Core, which will fillow the link, and provide us with an access token.
			// user will eventually call this.receiveAuthToken()
			return this._coreHandler.core.callMethod(P.methods.requestUserAuthToken, [authUrl]).then(async () => {
				return Promise.resolve(null)
			})
		}
	}

	public setCoreUrl(url: URL): void {
		this._coreUrl = url
	}

	public setDeviceId(id: string): void {
		this._deviceId = id
	}
}
