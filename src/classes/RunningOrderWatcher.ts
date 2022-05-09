import { EventEmitter } from 'events'
import * as request from 'request-promise'
import * as dotenv from 'dotenv'
import { SheetRundown } from './Rundown'
import { Auth, Common } from 'googleapis'
import { google, drive_v3 } from 'googleapis'
import { SheetsManager, SheetUpdate } from './SheetManager'
import * as _ from 'underscore'
import { SheetSegment } from './Segment'
import { SheetPart } from './Part'
import * as clone from 'clone'
import { CoreHandler, WorkflowType } from '../coreHandler'
import { MediaDict } from './media'
import { IOutputLayer } from '@sofie-automation/blueprints-integration'
import { diffRundowns, RundownChangeType } from '../diffRundowns'
import { assertUnreachable } from '../util'
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

	emit!: ((event: 'info', message: string) => boolean) &
		((event: 'error', error: any, stack?: any) => boolean) &
		((event: 'warning', message: string) => boolean) &
		((event: 'rundown_delete', runningOrderId: string) => boolean) &
		((event: 'rundown_create', runningOrderId: string, runningOrder: SheetRundown) => boolean) &
		((event: 'rundown_update', runningOrderId: string, runningOrder: SheetRundown) => boolean) &
		((event: 'segment_delete', runningOrderId: string, sectionId: string) => boolean) &
		((event: 'segment_create', runningOrderId: string, sectionId: string, newSection: SheetSegment) => boolean) &
		((event: 'segment_update', runningOrderId: string, sectionId: string, newSection: SheetSegment) => boolean) &
		((event: 'part_delete', runningOrderId: string, sectionId: string, storyId: string) => boolean) &
		((
			event: 'part_create',
			runningOrderId: string,
			sectionId: string,
			storyId: string,
			newStory: SheetPart
		) => boolean) &
		((event: 'part_update', runningOrderId: string, sectionId: string, storyId: string, newStory: SheetPart) => boolean)

	// Fast = list diffs, Slow = fetch All
	public pollIntervalFast: number = 2 * 1000
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
	 * A Running Order watcher which will poll Google Drive for changes and emit events
	 * whenever a change occurs.
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
	 *
	 * @param runningOrderId Id of Running Order Sheet on Google Sheets
	 */
	async checkRunningOrderById(runningOrderId: string, asNew?: boolean): Promise<SheetRundown> {
		const runningOrder = await this.sheetManager.downloadRunningOrder(
			runningOrderId,
			this.coreHandler.GetOutputLayers()
		)

		if (runningOrder.gatewayVersion === this.gatewayVersion) {
			this.processUpdatedRunningOrder(runningOrder.externalId, runningOrder, asNew)
		}

		return runningOrder
	}

	async checkDriveFolder(): Promise<SheetRundown[]> {
		if (!this.sheetFolderName) return []

		const runningOrderIds = await this.sheetManager.getSheetsInDriveFolder(this.sheetFolderName)
		return Promise.all(
			runningOrderIds.map(async (roId) => {
				return this.checkRunningOrderById(roId)
			})
		)
	}
	/**
	 * Will add all currently available Running Orders from the first drive folder
	 * matching the provided name
	 *
	 * @param sheetFolderName Name of folder to add Running Orders from. Eg. "My Running Orders"
	 */
	async setDriveFolder(sheetFolderName: string): Promise<SheetRundown[]> {
		this.sheetFolderName = sheetFolderName
		return this.checkDriveFolder()
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

		const objs = ['FULL', 'HEAD', 'CAM', 'DVE', 'SECTION', 'TITLES', 'BREAKER', 'PACKAGE']

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

	/**
	 * Start the watcher
	 */
	startWatcher(): void {
		console.log('Starting Watcher')
		this.stopWatcher()

		this.fastInterval = setInterval(() => {
			if (this.currentlyChecking) {
				return
			}
			// console.log('Running fast check')
			this.currentlyChecking = true
			this.checkForChanges()
				.catch((error) => {
					console.error('Something went wrong during fast check', error, error.stack)
				})
				.then(() => {
					// console.log('fast check done')
					this.currentlyChecking = false
				})
				.catch(console.error)
		}, this.pollIntervalFast)

		this.slowinterval = setInterval(() => {
			if (this.currentlyChecking) {
				return
			}
			console.log('Running slow check')
			this.currentlyChecking = true

			this.checkDriveFolder()
				.catch((error) => {
					console.error('Something went wrong during slow check', error, error.stack)
				})
				.then(() => {
					// console.log('slow check done')
					this.currentlyChecking = false
				})
				.catch(console.error)
		}, this.pollIntervalSlow)

		this.mediaPollInterval = setInterval(() => {
			if (this.currentlyChecking) {
				return
			}
			this.currentlyChecking = true
			this.updateAvailableMedia()
				.catch((error) => {
					console.log('Something went wrong during siper slow check', error, error.stack)
				})
				.then(() => {
					this.updateAvailableOutputs()
						.catch((error) => {
							console.log('Something went wrong during super slow check', error, error.stack)
						})
						.then(() => {
							this.updateAvailableTransitions()
								.catch((error) => {
									console.log('Something went wrong during super slow check', error, error.stack)
								})
								.then(() => {
									this.currentlyChecking = false
								})
								.catch(console.error)
						})
						.catch(console.error)
				})
				.catch(console.error)
		}, this.pollIntervalMedia)
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

	private processUpdatedRunningOrder(rundownId: string, rundown: SheetRundown | null, asNew?: boolean) {
		const oldRundown = !asNew ? this.runningOrders[rundownId] : null

		// Check if runningOrders have changed:
		const changes = diffRundowns(oldRundown, rundown)
		for (const change of changes) {
			const changeType = change.type
			switch (changeType) {
				case RundownChangeType.RundownCreate: {
					if (rundown === null) throw new Error(`Tried to emit RUNDOWN_CREATE for Rundown that does not exist`)
					this.emit('rundown_create', change.rundownId, rundown)
					break
				}
				case RundownChangeType.RundownDelete: {
					this.emit('rundown_delete', change.rundownId)
					break
				}
				case RundownChangeType.RundownUpdate: {
					if (rundown === null) throw new Error(`Tried to emit RUNDOWN_UPDATE for Rundown that does not exist`)
					this.emit('rundown_update', change.rundownId, rundown)
					break
				}
				case RundownChangeType.SegmentCreate: {
					const segment = rundown?.segments.find((s) => s.externalId === change.segmentId)
					if (!segment) throw new Error(`Tried to emit SEGMENT_CREATE for Segment that does not exist`)
					this.emit('segment_create', change.rundownId, change.segmentId, segment)
					break
				}
				case RundownChangeType.SegmentDelete: {
					this.emit('segment_delete', change.rundownId, change.segmentId)
					break
				}
				case RundownChangeType.SegmentUpdate: {
					const segment = rundown?.segments.find((s) => s.externalId === change.segmentId)
					if (!segment) throw new Error(`Tried to emit SEGMENT_UPDATE for Segment that does not exist`)
					this.emit('segment_update', change.rundownId, change.segmentId, segment)
					break
				}
				case RundownChangeType.PartCreate: {
					const segment = rundown?.segments.find((s) => s.externalId === change.segmentId)
					if (!segment) throw new Error(`Tried to emit PART_CREATE for Part in Segment that does not exist`)
					const part = segment.parts.find((s) => s.externalId === change.segmentId)
					if (!part) throw new Error(`Tried to emit PART_CREATE for Part that does not exist`)
					this.emit('part_create', change.rundownId, change.segmentId, change.partId, part)
					break
				}
				case RundownChangeType.PartDelete: {
					this.emit('part_delete', change.rundownId, change.segmentId, change.partId)
					break
				}
				case RundownChangeType.PartUpdate: {
					const segment = rundown?.segments.find((s) => s.externalId === change.segmentId)
					if (!segment) throw new Error(`Tried to emit PART_UPDATE for Part in Segment that does not exist`)
					const part = segment.parts.find((s) => s.externalId === change.segmentId)
					if (!part) throw new Error(`Tried to emit PART_UPDATE for Part that does not exist`)
					this.emit('part_update', change.rundownId, change.segmentId, change.partId, part)
					break
				}
				default:
					throw assertUnreachable(changeType, new Error(`Unhandled change type: ${changeType}`))
			}
		}

		// Update the stored data:
		if (rundown) {
			this.runningOrders[rundownId] = clone(rundown)
		} else {
			delete this.runningOrders[rundownId]
		}
	}

	private async processChange(change: drive_v3.Schema$Change) {
		const fileId = change.fileId
		if (fileId) {
			const valid = await this.sheetManager.checkSheetIsValid(fileId)
			if (valid) {
				if (change.removed) {
					// file was removed
					console.log('Sheet was deleted', fileId)

					this.processUpdatedRunningOrder(fileId, null)
				} else {
					// file was updated
					console.log('Sheet was updated', fileId)
					const newRunningOrder = await this.sheetManager.downloadRunningOrder(
						fileId,
						this.coreHandler.GetOutputLayers()
					)

					if (newRunningOrder.gatewayVersion === this.gatewayVersion) {
						this.processUpdatedRunningOrder(fileId, newRunningOrder)
					}
				}
			}
		}
	}

	private async getPageToken(): Promise<string> {
		if (this.pageToken) {
			return this.pageToken
		}

		const result = await this.drive.changes.getStartPageToken({})
		if (!result.data.startPageToken) {
			throw new Error('No startPageToken found')
		}
		return result.data.startPageToken
	}
	private async checkForChanges(): Promise<any> {
		let pageToken: string | null | undefined = await this.getPageToken()

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
		return
	}
}
