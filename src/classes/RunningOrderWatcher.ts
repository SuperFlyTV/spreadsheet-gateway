import { IOutputLayer } from '@sofie-automation/blueprints-integration'
import { StatusCode } from '@sofie-automation/shared-lib/dist/lib/status'
import * as clone from 'clone'
import * as dotenv from 'dotenv'
import { EventEmitter } from 'events'
import { Auth, Common, drive_v3, google } from 'googleapis'
import * as request from 'request-promise'
import * as _ from 'underscore'
import { CoreHandler, WorkflowType } from '../coreHandler'
import { logger } from '../logger'
import { checkErrorType, getErrorMsg } from '../util'
import { MediaDict } from './media'
import { SheetPart } from './Part'
import { SheetRundown } from './Rundown'
import { SheetSegment } from './Segment'
import { SheetsManager, SheetUpdate } from './SheetManager'

dotenv.config()

export class RunningOrderWatcher extends EventEmitter {
	public sheetFolderName?: string

	on!: ((event: 'info', listener: (message: string) => void) => this) &
		((event: 'error', listener: (error: any, stack?: any) => void) => this) &
		((event: 'warning', listener: (message: string) => void) => this) &
		((event: 'rundown_delete', listener: (runningOrderId: string) => void) => this) &
		((event: 'rundown_create', listener: (runningOrderId: string, runningOrder: SheetRundown) => void) => this) &
		((event: 'rundown_update', listener: (runningOrderId: string, runningOrder: SheetRundown) => void) => this) &
		((event: 'segment_delete', listener: (runningOrderId: string, sectionId: string) => void) => this) &
		((
			event: 'segment_create',
			listener: (runningOrderId: string, sectionId: string, newSection: SheetSegment) => void
		) => this) &
		((
			event: 'segment_update',
			listener: (runningOrderId: string, sectionId: string, newSection: SheetSegment) => void
		) => this) &
		((event: 'part_delete', listener: (runningOrderId: string, sectionId: string, storyId: string) => void) => this) &
		((
			event: 'part_create',
			listener: (runningOrderId: string, sectionId: string, storyId: string, newStory: SheetPart) => void
		) => this) &
		((
			event: 'part_update',
			listener: (runningOrderId: string, sectionId: string, storyId: string, newStory: SheetPart) => void
		) => this)

	// Fast = list diffs, Slow = fetch All
	public pollIntervalFast: number = 5 * 1000
	public pollIntervalSlow: number = 10 * 1000
	public pollIntervalMedia: number = 5 * 1000

	private runningOrders: { [runningOrderId: string]: SheetRundown } = {}

	private fastInterval: NodeJS.Timer | undefined
	private slowinterval: NodeJS.Timer | undefined
	private mediaPollInterval: NodeJS.Timer | undefined

	private drive: drive_v3.Drive
	private currentlyChecking = false
	private sheetManager: SheetsManager
	private pageToken?: string
	private _lastMedia: MediaDict = {}
	private _lastOutputLayers: IOutputLayer[] = []
	private _lastWorkflow: WorkflowType | undefined

	// private _lastOutputLayers: Array<ISourceLayer> = []

	/**
	 * A Running Order watcher which will poll Google Drive for changes
	 * and emit events whenever a change occurs.
	 *
	 * @param authClient Google OAuth2Clint containing connection information
	 * @param coreHandler Handler for Sofie Core
	 * @param gatewayVersion Set version of gateway
	 * @param delayStart (Optional) Set to a falsy value to prevent the watcher to start watching immediately.
	 */
	constructor(
		private authClient: Auth.OAuth2Client,
		private coreHandler: CoreHandler,
		private gatewayVersion: string,
		delayStart?: boolean
	) {
		super()
		this.drive = google.drive({ version: 'v3', auth: this.authClient })

		/*if (!process.env.MEDIA_URL) {
			this.pollIntervalMedia = (24 * 3600) / 45 // Use Google API to update, rate limit to 45 updates per day.
		}*/

		this.sheetManager = new SheetsManager(this.authClient)
		if (!delayStart) {
			this.startWatcher()
		}
	}

	/**
	 * Add a Running Order from Google Sheets ID
	 * @param spreadsheetId Id of Spreadsheet on Google Sheets
	 * @param asNew If this spreadsheet should be considered as new one
	 */
	async fetchSheetRundown(spreadsheetId: string, asNew?: boolean): Promise<SheetRundown | undefined> {
		const downloadedRundown = await this.sheetManager.downloadRundown(spreadsheetId, this.coreHandler.GetOutputLayers())

		if (downloadedRundown) {
			this.processUpdatedRunningOrder(downloadedRundown.externalId, downloadedRundown, asNew)
		}

		return downloadedRundown
	}

	/**
	 * Will add all currently available Running Orders from the first drive folder
	 * matching the provided name
	 * @param sheetFolderName Name of folder to add Running Orders from. Eg. "My Running Orders"
	 */
	async setDriveFolder(sheetFolderName: string): Promise<SheetRundown[]> {
		this.sheetFolderName = sheetFolderName
		return this.fetchAllSpreadsheetsInFolder()
	}

	/**
	 * Method updates watcher's poll intervals based on the number of spreadsheet documents.
	 * Updating is important to make sure that optimum number of API calls will be made and API limitation won't be hit.
	 * @param numberOfSpreadsheets Number of spreadsheet documents in the folder
	 */
	updatePollIntervals(numberOfSpreadsheets: number): void {
		// How long is one period of counting API calls
		const GOOGLE_TIMEOUT_SECONDS = 60

		// Maximum number of API calls that can be safely made in one period
		const GOOGLE_MAX_QUERIES = 60

		// Assumption of many documents will be edited (or created) in one period
		const MAX_EDIT_SHEETS_ASSUMPTION = 30

		let slowInterval =
			(1000 * GOOGLE_TIMEOUT_SECONDS) / ((GOOGLE_MAX_QUERIES - MAX_EDIT_SHEETS_ASSUMPTION) / numberOfSpreadsheets)

		if (slowInterval < 10000) {
			slowInterval = 10000
		}

		if (slowInterval === this.pollIntervalSlow) {
			// Nothing has changed
			return
		}

		logger.info('Updating slow interval to ' + slowInterval)
		this.pollIntervalSlow = slowInterval

		this.stopWatcher()
		this.startWatcher()
	}

	/**
	 * Returns all sheets in selected folder on the drive
	 */
	async fetchAllSpreadsheetsInFolder(): Promise<SheetRundown[]> {
		if (!this.sheetFolderName) return []

		const spreadsheetIds = await this.sheetManager.getSpreadsheetsInDriveFolder(this.sheetFolderName)

		const sheets: SheetRundown[] = []

		this.updatePollIntervals(spreadsheetIds.length)

		for (const spreadsheetId of spreadsheetIds) {
			const sheet = await this.fetchSheetRundown(spreadsheetId)
			if (sheet) {
				sheets.push(sheet)
			}
		}

		return sheets
	}

	/**
	 * Start the watcher
	 */
	startWatcher(): void {
		logger.info('Starting Watcher')
		this.stopWatcher()

		/**
		 * FAST check - only perform fetching if changes are detected
		 */
		this.fastInterval = setInterval(() => {
			if (this.currentlyChecking) {
				return
			}
			logger.info('Running fast check')
			this.currentlyChecking = true
			this.checkForChanges()
				.catch((error) => {
					let msg = getErrorMsg(error)
					logger.error('Something went wrong during fast check: ' + msg)
					logger.debug(error)
					if (checkErrorType(error, ['invalid_grant', 'authError'])) {
						msg += ', try resetting user credentials'
					}
					this.coreHandler.setStatus(StatusCode.BAD, [msg])
				})
				.then(() => {
					this.currentlyChecking = false
				})
				.catch((error) => {
					logger.error('Error after checking for changes in fast check')
					logger.debug(error)
				})
		}, this.pollIntervalFast)

		/**
		 * SLOW check - fetch all spreadsheets in the folder
		 */
		this.slowinterval = setInterval(() => {
			if (this.currentlyChecking) {
				return
			}

			logger.info('Running slow check')
			this.currentlyChecking = true

			this.fetchAllSpreadsheetsInFolder()
				.then(() => {
					this.currentlyChecking = false
				})
				.catch((error) => {
					let msg = getErrorMsg(error)
					logger.error('Something went wrong during slow check: ' + msg)
					logger.debug(error)
					if (checkErrorType(error, ['invalid_grant', 'authError'])) {
						msg += ', try resetting user credentials'
					}
					this.coreHandler.setStatus(StatusCode.BAD, [msg])
				})
		}, this.pollIntervalSlow)

		// this.mediaPollInterval = setInterval(() => {
		// 	if (this.currentlyChecking) {
		// 		return
		// 	}
		// 	this.currentlyChecking = true
		// 	this.updateAvailableMedia()
		// 		.catch((error) => {
		// 			console.log('Something went wrong during siper slow check', error, error.stack)
		// 		})
		// 		.then(() => {
		// 			this.updateAvailableOutputs()
		// 				.catch((error) => {
		// 					console.log('Something went wrong during super slow check', error, error.stack)
		// 				})
		// 				.then(() => {
		// 					this.updateAvailableTransitions()
		// 						.catch((error) => {
		// 							console.log('Something went wrong during super slow check', error, error.stack)
		// 						})
		// 						.then(() => {
		// 							this.currentlyChecking = false
		// 						})
		// 						.catch(console.error)
		// 				})
		// 				.catch(console.error)
		// 		})
		// 		.catch(console.error)
		// }, this.pollIntervalMedia)
	}

	/**
	 * Stop the watcher
	 */
	stopWatcher(): void {
		if (this.fastInterval) {
			clearInterval(this.fastInterval)
			this.fastInterval = undefined
		}
		if (this.slowinterval) {
			clearInterval(this.slowinterval)
			this.slowinterval = undefined
		}
		if (this.mediaPollInterval) {
			clearInterval(this.mediaPollInterval)
			this.mediaPollInterval = undefined
		}
	}

	dispose(): void {
		this.stopWatcher()
	}

	/**
	 * Method checks there have been any changes made to spreadsheet files.
	 * Checking is done by calling Drive API Changes method.
	 * If there are changes to files, they will be processed by processChange() method.
	 */
	private async checkForChanges(): Promise<void> {
		let pageToken: string | null | undefined = await this.getChangesStartPageToken()

		while (pageToken) {
			const listData: Common.GaxiosResponse<drive_v3.Schema$ChangeList> = await this.drive.changes.list({
				restrictToMyDrive: true,
				pageToken: pageToken,
				fields: '*',
			})

			if (listData.data.changes) {
				for (const change of listData.data.changes) {
					await this.processChange(change)
				}
			}
			pageToken = listData.data.nextPageToken

			if (listData.data.newStartPageToken) {
				// This was the end. No more changes
				this.pageToken = listData.data.newStartPageToken
			}
		}
	}

	/**
	 * Method returns start page token of Google Drive API Changes.
	 * @returns Start page token
	 */
	private async getChangesStartPageToken(): Promise<string> {
		if (this.pageToken) {
			return this.pageToken
		}

		const result = await this.drive.changes.getStartPageToken({})
		if (!result.data.startPageToken) {
			throw new Error('No startPageToken found')
		}
		return result.data.startPageToken
	}

	/**
	 * Method receives a Google Drive API Change object and fetches spreadsheet
	 * on which that change has been detected.
	 * @param change Change that has been detected
	 */
	private async processChange(change: drive_v3.Schema$Change) {
		const fileId = change.fileId
		if (fileId) {
			const valid = await this.sheetManager.checkSheetIsValid(fileId)
			if (valid) {
				if (change.removed) {
					// File was removed
					console.log('Sheet was deleted', fileId)
					this.processUpdatedRunningOrder(fileId, null)
				} else {
					// File was updated
					console.log('Sheet was updated', fileId)
					const newRundown = await this.sheetManager.downloadRundown(fileId, this.coreHandler.GetOutputLayers())

					if (newRundown && newRundown.gatewayVersion === this.gatewayVersion) {
						this.processUpdatedRunningOrder(fileId, newRundown)
					}
				}
			}
		}
	}

	private processUpdatedRunningOrder(rundownId: string, rundown: SheetRundown | null, asNew?: boolean) {
		const oldRundown = !asNew && this.runningOrders[rundownId]

		// Check if runningOrders have changed:

		if (!rundown && oldRundown) {
			this.emit('rundown_delete', rundownId)
		} else if (rundown && !oldRundown) {
			this.emit('rundown_create', rundownId, rundown)
			// this.fillRundownData().catch(console.error)
		} else if (rundown && oldRundown) {
			if (!_.isEqual(rundown.serialize(), oldRundown.serialize())) {
				// console.log(rundown.serialize()) // debug

				this.emit('rundown_update', rundownId, rundown)
			} else {
				const newRundown: SheetRundown = rundown

				// Go through the sections for changes:
				_.uniq(
					oldRundown.segments
						.map((segment) => segment.externalId)
						.concat(newRundown.segments.map((segment) => segment.externalId))
				).forEach((segmentId: string) => {
					const oldSection: SheetSegment = oldRundown.segments.find(
						(segment) => segment.externalId === segmentId
					) as SheetSegment // TODO: handle better
					const newSection: SheetSegment = rundown.segments.find(
						(segment) => segment.externalId === segmentId
					) as SheetSegment

					if (!newSection && oldSection) {
						this.emit('segment_delete', rundownId, segmentId)
					} else if (newSection && !oldSection) {
						this.emit('segment_create', rundownId, segmentId, newSection)
					} else if (newSection && oldSection) {
						if (!_.isEqual(newSection.serialize(), oldSection.serialize())) {
							// console.log(newSection.serialize(), oldSection.serialize()) // debug
							this.emit('segment_update', rundownId, segmentId, newSection)
						} else {
							// Go through the stories for changes:
							_.uniq(
								oldSection.parts.map((part) => part.externalId).concat(newSection.parts.map((part) => part.externalId))
							).forEach((storyId: string) => {
								const oldStory: SheetPart = oldSection.parts.find((part) => part.externalId === storyId) as SheetPart // TODO handle the possibility of a missing id better
								const newStory: SheetPart = newSection.parts.find((part) => part.externalId === storyId) as SheetPart

								if (!newStory && oldStory) {
									this.emit('part_delete', rundownId, segmentId, storyId)
								} else if (newStory && !oldStory) {
									this.emit('part_create', rundownId, segmentId, storyId, newStory)
								} else if (newStory && oldStory) {
									if (!_.isEqual(newStory.serialize(), oldStory.serialize())) {
										// console.log(newStory.serialize(), oldStory.serialize()) // debug
										this.emit('part_update', rundownId, segmentId, storyId, newStory)
									} else {
										// At this point, we've determined that there are no changes.
										// Do nothing
									}
								}
							})
						}
					}
				})
			}
		}
		// Update the stored data:
		if (rundown) {
			this.runningOrders[rundownId] = clone(rundown)
		} else {
			delete this.runningOrders[rundownId]
		}
	}

	async sendMediaViaGAPI(): Promise<void> {
		// Create required updates
		const updates: SheetUpdate[] = []
		let cell = 2
		for (const key in this._lastMedia) {
			// Media name.
			updates.push({
				value: this._lastMedia[key].path,
				cellPosition: `E${cell}`,
			})
			// Media duration.
			updates.push({
				value: this._lastMedia[key].duration,
				cellPosition: `F${cell}`,
			})
			cell++
		}

		// Update all running orders with media.
		Object.keys(this.runningOrders).forEach((id) => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	async sendOutputLayersViaGAPI(): Promise<void> {
		// Create reqrired updates
		const updates: SheetUpdate[] = []

		updates.push({
			value: 'None',
			cellPosition: `H2`,
		})

		let cell = 3
		for (const layer of this._lastOutputLayers) {
			updates.push({
				value: layer.name,
				cellPosition: `H${cell}`,
			})
			cell++
		}

		// Update all running orders with outputLayers.
		Object.keys(this.runningOrders).forEach((id) => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	async sendTransitionsViaGAPI(workflow: WorkflowType): Promise<void> {
		// Create reqrired updates
		const updates: SheetUpdate[] = []
		let cell = 2

		if (workflow === 'VMIX') {
			;[
				'Cut',
				'Fade',
				'Zoom',
				'Wipe',
				'Slide',
				'Fly',
				'CrossZoom',
				'FlyRotate',
				'Cube',
				'CubeZoom',
				'VerticalWipe',
				'VerticalSlide',
				'Merge',
				'WipeReverse',
				'SlideReverse',
				'VerticalWipeReverse',
				'VerticalSlideReverse',
			].forEach((transition) => {
				updates.push({
					value: transition,
					cellPosition: `J${cell}`,
				})
				cell++
			})

			for (let i = cell; i < 20; i++) {
				updates.push({
					value: '',
					cellPosition: `J${cell}`,
				})
			}
		} else {
			;['mix', 'cut', 'dip', 'sting', 'wipe'].forEach((transition) => {
				updates.push({
					value: transition,
					cellPosition: `J${cell}`,
				})
				cell++
			})

			for (let i = cell; i < 20; i++) {
				updates.push({
					value: '',
					cellPosition: `J${cell}`,
				})
			}
		}

		// Update all running orders with outputLayers.
		Object.keys(this.runningOrders).forEach((id) => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	async sendObjectTypesViaGAPI(): Promise<void> {
		// Create reqrired updates
		const updates: SheetUpdate[] = []
		const cell = 2

		const objs = [
			'camera',
			'video',
			'graphic',
			'overlay',
			'lights',
			'transition',
			'remote',
			'pip',
			'voiceover',
			'script',
		]

		if (this.coreHandler.GetWorkflow() !== 'VMIX') {
			objs.push('split')
		}

		objs.forEach((obj) => {
			updates.push({
				value: obj,
				cellPosition: `C${cell}`,
			})
		})

		// Update all running orders with outputLayers.
		Object.keys(this.runningOrders).forEach((id) => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	async sendTemplateTypesViaGAPI(): Promise<void> {
		// Create reqrired updates
		const updates: SheetUpdate[] = []
		const cell = 2

		const objs = ['FULL', 'HEAD', 'CAM', 'COMPOSITION', 'SECTION', 'TITLES', 'BREAKER', 'PACKAGE']

		objs.forEach((obj) => {
			updates.push({
				value: obj,
				cellPosition: `A${cell}`,
			})
		})

		// Update all running orders with outputLayers.
		Object.keys(this.runningOrders).forEach((id) => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	/**
	 * Sends available media as CSV to a URL specified in .env
	 */
	async sendMediaAsCSV(): Promise<void> {
		// Create required updates
		const updates: { name: string; duration: string }[] = []
		for (const key in this._lastMedia) {
			updates.push({
				name: this._lastMedia[key].name,
				duration: this._lastMedia[key].duration,
			})
		}

		// Convert the media list to xml.
		function convertToCSV(updates: { name: string; duration: string }[]) {
			let output = ''
			updates.forEach((update) => {
				output += `${update.name},${update.duration}\n`
			})
			output = output.substring(0, output.length - 1)
			return output
		}

		if (process.env.MEDIA_URL) {
			const req = request.post(process.env.MEDIA_URL, function (err) {
				if (err) {
					console.log(err)
				}
			})
			const form = req.form()
			form.append('file', convertToCSV(updates), {
				filename: 'media.csv',
				contentType: 'text/plain',
			})
		}

		return Promise.resolve()
	}

	async fillRundownData(): Promise<void> {
		this.sendMediaViaGAPI().catch(console.log)
		this.sendOutputLayersViaGAPI().catch(console.log)
		if (this._lastWorkflow) this.sendTransitionsViaGAPI(this._lastWorkflow).catch(console.log)
		this.sendObjectTypesViaGAPI().catch(console.log)
		this.sendTemplateTypesViaGAPI().catch(console.log)

		return Promise.resolve()
	}

	/**
	 * Adds all available media to all running orders.
	 */
	async updateAvailableMedia(): Promise<void> {
		const newMedia = this.coreHandler.GetMedia()

		if (_.isEqual(this._lastMedia, newMedia)) {
			// No need to update
			return Promise.resolve()
		}
		this._lastMedia = newMedia

		if (process.env.MEDIA_URL) {
			this.sendMediaAsCSV().catch(console.log)

			return Promise.resolve()
		} else {
			this.sendMediaViaGAPI().catch(console.log)

			return Promise.resolve()
		}
	}

	/**
	 * Adds all all available outputs to all running orders.
	 */
	async updateAvailableOutputs(): Promise<void> {
		const outputLayers = this.coreHandler.GetOutputLayers()

		if (_.isEqual(this._lastOutputLayers, outputLayers)) {
			return Promise.resolve()
		}
		this._lastOutputLayers = outputLayers

		this.sendOutputLayersViaGAPI().catch(console.log)

		return Promise.resolve()
	}

	/**
	 * Adds all available transitions to all running orders.
	 */
	async updateAvailableTransitions(): Promise<void> {
		const workflow = this.coreHandler.GetWorkflow()
		if (this._lastWorkflow !== workflow) {
			this._lastWorkflow = workflow

			this.sendTransitionsViaGAPI(this._lastWorkflow).catch(console.log)
		}

		return Promise.resolve()
	}
}
