import { CollectionObj } from '@sofie-automation/server-core-integration'
import { StatusCode } from '@sofie-automation/shared-lib/dist/lib/status'
import { PeripheralDeviceAPIMethods } from '@sofie-automation/shared-lib/dist/peripheralDevice/methodsAPI'
import { Auth, google } from 'googleapis'
import { RunningOrderWatcher } from './classes/RunningOrderWatcher'
import { CoreHandler } from './coreHandler'
import { logger } from './logger'
import { mutatePart, mutateRundown, mutateSegment } from './mutate'
import { checkErrorType, getErrorMsg } from './util'

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
	// public options: SpreadsheetConfig
	public debugLogging = false

	private spreadsheetWatcher?: RunningOrderWatcher
	private _currentOAuth2Client: Auth.OAuth2Client | null = null

	private _disposed = false
	private _settings?: SpreadsheetDeviceSettings
	private _coreHandler: CoreHandler
	private _observers: Array<any> = []
	private _triggerUpdateDevicesTimeout: any = null
	private _coreUrl: URL | undefined
	private _deviceId: string | undefined

	constructor(_config: SpreadsheetConfig, coreHandler: CoreHandler) {
		// this.options = config
		this._coreHandler = coreHandler

		coreHandler.doReceiveAuthToken = async (authToken: string): Promise<void> => {
			return this.receiveAuthToken(authToken)
		}
	}

	async init(coreHandler: CoreHandler): Promise<void> {
		const peripheralDevice = await coreHandler.core.getPeripheralDevice()

		this._settings = peripheralDevice.settings || {}

		this._coreHandler.onConnected(() => this.setupObservers())
		this.setupObservers()

		await this._updateThisDevice()
	}

	async dispose(): Promise<void> {
		this._disposed = true
		if (this.spreadsheetWatcher) {
			return Promise.resolve(this.spreadsheetWatcher.dispose())
		} else {
			return Promise.resolve()
		}
	}

	/**
	 * Method disposes spreadsheet watcher.
	 * Should be called when the minimum conditions are not met
	 * (missing acces token, auth token, auth client, folder path...)
	 */
	private disposeSpreadsheetWatcher(): void {
		if (!this.spreadsheetWatcher) {
			return
		}

		this.spreadsheetWatcher.dispose()
		delete this.spreadsheetWatcher
	}

	/**
	 * Method initializes observers for changed to Sofie peripheral device.
	 * For example, when some of the settings change for this gateway app.
	 */
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

	/**
	 * Method returns Spreadsheet Gateway as a Sofie core peripheral device
	 * @returns Spreadsheet Gateway as a Sofie core peripheral device
	 */
	private getThisPeripheralDevice(): CollectionObj | undefined {
		const peripheralDevices = this._coreHandler.core.getCollection('peripheralDevices')
		return peripheralDevices.findOne(this._coreHandler.core.deviceId)
	}

	/**
	 * Method invoked when Spreadsheet Gateway settings change in the Sofie
	 */
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
			}
		}
		if (this._triggerUpdateDevicesTimeout) {
			clearTimeout(this._triggerUpdateDevicesTimeout)
		}
		this._triggerUpdateDevicesTimeout = setTimeout(() => {
			this._updateThisDevice().catch((error) => {
				logger.error(`Something went wrong wile updating this device`, error)
			})
		}, 20)
	}

	/**
	 * Method invoked when some of the settings related to the Spreadsheet Gateway change.
	 * For example, update gateway status, check credentials etc.
	 */
	private async _updateThisDevice(): Promise<void> {
		if (this._disposed) {
			return
		}

		const peripheralDevice = this.getThisPeripheralDevice() // This gateway app as Sofie peripheral device
		if (!peripheralDevice) {
			return
		}

		const settings: SpreadsheetDeviceSettings = peripheralDevice.settings || {}
		const secretSettings: SpreadsheetDeviceSecretSettings = peripheralDevice.secretSettings || {}

		if (!secretSettings.credentials) {
			this.disposeSpreadsheetWatcher()
			this._coreHandler.setStatus(StatusCode.BAD, ['Not set up: Credentials missing'])
			return
		}

		const credentials = secretSettings.credentials
		const accessToken = secretSettings.accessToken

		const authClient = await this.createAuthClient(credentials, accessToken)

		if (!secretSettings.accessToken) {
			this.disposeSpreadsheetWatcher()
			this._coreHandler.setStatus(StatusCode.BAD, ['Not set up: AccessToken missing'])
			return
		}

		if (!authClient) {
			this.disposeSpreadsheetWatcher()
			this._coreHandler.setStatus(StatusCode.BAD, ['Internal error: authClient not set'])
			return
		}

		if (!settings.folderPath) {
			this.disposeSpreadsheetWatcher()
			this._coreHandler.setStatus(StatusCode.BAD, ['Not set up: FolderPath missing'])
			return
		}

		// At this point we're authorized and good to go!

		if (this.spreadsheetWatcher && this.spreadsheetWatcher.sheetFolderName === settings.folderPath) {
			// Nothing new has happened
			return
		}

		this._logInitSpreadsheetConnection()
		this._coreHandler.setStatus(StatusCode.UNKNOWN, ['Initializing..'])
		this.disposeSpreadsheetWatcher()

		const watcher = new RunningOrderWatcher(authClient, this._coreHandler, 'v0.1')
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
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataRundownDelete, [rundownExternalId])
					.catch(logger.error)
			})
			.on('rundown_create', (_rundownExternalId, rundown) => {
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataRundownCreate, [mutateRundown(rundown)])
					.catch(logger.error)
			})
			.on('rundown_update', (_rundownExternalId, rundown) => {
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataRundownUpdate, [mutateRundown(rundown)])
					.catch(logger.error)
			})
			.on('segment_delete', (rundownExternalId, sectionId) => {
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataSegmentDelete, [rundownExternalId, sectionId])
					.catch(logger.error)
			})
			.on('segment_create', (rundownExternalId, _sectionId, newSection) => {
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataSegmentCreate, [rundownExternalId, mutateSegment(newSection)])
					.catch(logger.error)
			})
			.on('segment_update', (rundownExternalId, _sectionId, newSection) => {
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataSegmentUpdate, [rundownExternalId, mutateSegment(newSection)])
					.catch(logger.error)
			})
			.on('part_delete', (rundownExternalId, sectionId, storyId) => {
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataPartDelete, [rundownExternalId, sectionId, storyId])
					.catch(logger.error)
			})
			.on('part_create', (rundownExternalId, sectionId, _storyId, newStory) => {
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataPartCreate, [rundownExternalId, sectionId, mutatePart(newStory)])
					.catch(logger.error)
			})
			.on('part_update', (rundownExternalId, sectionId, _storyId, newStory) => {
				this._coreHandler.core
					.callMethod(PeripheralDeviceAPIMethods.dataPartUpdate, [rundownExternalId, sectionId, mutatePart(newStory)])
					.catch(logger.error)
			})

		if (settings.folderPath) {
			logger.info(`Starting watch of folder "${settings.folderPath}"`)
			this._coreHandler.setStatus(StatusCode.GOOD, [`Starting watching folder '${settings.folderPath}'`])
			watcher
				.setDriveFolder(settings.folderPath)
				.then(() => {
					this._coreHandler.setStatus(StatusCode.GOOD, [`Watching folder '${settings.folderPath}'`])
				})
				.catch((error) => {
					let msg = getErrorMsg(error)
					logger.error('Something went wrong during setting drive folder: ' + msg)
					logger.error(error)

					if (checkErrorType(error, ['invalid_grant', 'authError'])) {
						msg += ', try resetting user credentials'
					}
					this._coreHandler.setStatus(StatusCode.BAD, [msg])
				})
		}
	}

	/**
	 * Get an authentication client towards Google drive on behalf of the user,
	 * or prompt for login.
	 * @param credentials Credentials from credentials.json which you get from Google
	 * @param authCredentials Auth credentials if they already exists
	 * @returns OAuth2 client
	 */
	private async createAuthClient(
		credentials: Credentials,
		authCredentials?: Auth.Credentials
	): Promise<Auth.OAuth2Client> {
		if (authCredentials && this._currentOAuth2Client) {
			return this._currentOAuth2Client
		}

		// Create OAuth2 Client
		this._currentOAuth2Client = new google.auth.OAuth2(
			credentials.installed.client_id,
			credentials.installed.client_secret,
			credentials.installed.redirect_uris[0]
		)

		if (authCredentials) {
			this._currentOAuth2Client.setCredentials(authCredentials)
		} else {
			// If we don't have an authCredentials, request it from the user.
			logger.info('Requesting auth token from user')

			if (!this._coreUrl) {
				logger.error(`Core URL not set`)
				this._coreHandler.setStatus(StatusCode.BAD, ['Core URL Not set on studio'])
				return Promise.reject()
			}

			const authUrl = this._currentOAuth2Client.generateAuthUrl({
				access_type: 'offline',
				scope: ACCESS_SCOPES,
				prompt: 'consent',
				redirect_uri: new URL(`devices/${this._deviceId}/oauthResponse`, this._coreUrl.toString()).toString(),
			})

			/**
			 * This will prompt the user in Sofie UI to authorize it's Google Account.
			 * Once authorized, this.receiveAuthToken() method will be invoked.
			 * Requesting user access token and receiving it is delegated to the Sofie Core, which forwards the data to this gateway app.
			 */
			await this._coreHandler.core.callMethod(PeripheralDeviceAPIMethods.requestUserAuthToken, [authUrl])
		}

		return this._currentOAuth2Client
	}

	/**
	 * Method handles receivement of user's auth token from Sofie
	 * TODO: Rename receiveAuthToken to receiveAuthorizationCode
	 * @param authorizationCode Authorization code received from Sofie
	 */
	async receiveAuthToken(authorizationCode: string): Promise<void> {
		if (this._currentOAuth2Client) {
			const oAuth2Client = this._currentOAuth2Client

			// Here redirect_uri just needs to match what was sent previously to satisfy Google's security requirements
			const redirect_uri = new URL(
				`devices/${this._deviceId}/oauthResponse`,
				this._coreUrl?.toString() ?? ''
			).toString()

			this._currentOAuth2Client.getToken({ code: authorizationCode, redirect_uri }, (error, authCredentials) => {
				if (error) {
					throw error
				} else if (!authCredentials) {
					throw new Error('No authCredentials received')
				} else {
					oAuth2Client.setCredentials(authCredentials)

					// Store for later use:
					this._coreHandler.core
						.callMethod(PeripheralDeviceAPIMethods.storeAccessToken, [authCredentials])
						.catch(logger.error)
				}
			})
		} else {
			throw Error('No Authorization is currently in progress!')
		}
	}

	debugLog(msg: string, ...args: any[]): void {
		if (this.debugLogging) {
			logger.debug(msg, ...args)
		}
	}

	/**
	 * TODO - Useless?
	 */
	private _logInitSpreadsheetConnection(): void {
		if (this._disposed) return
		if (!this._settings) throw Error('Spreadsheet Settings are not set')

		logger.info('Initializing Spreadsheet connection...')
	}

	triggerReloadRundown(spreadsheetId: string): void {
		void this.spreadsheetWatcher?.fetchSheetRundown(spreadsheetId, true)
	}

	public setCoreUrl(url: URL): void {
		this._coreUrl = url
	}

	public setDeviceId(id: string): void {
		this._deviceId = id
	}
}
