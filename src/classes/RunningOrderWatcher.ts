import { EventEmitter } from 'events'
import * as request from 'request-promise'
import * as dotenv from 'dotenv'
import { SheetRundown } from './Rundown'
import { OAuth2Client } from 'googleapis-common'
import { google, drive_v3 } from 'googleapis'
import { SheetsManager, SheetUpdate } from './SheetManager'
import { GaxiosResponse } from 'gaxios'
import * as _ from 'underscore'
import { SheetSegment } from './Segment'
import { SheetPart } from './Part'
import * as clone from 'clone'
import { CoreHandler, WorkflowType } from '../coreHandler'
import { MediaDict } from './media'
import { IOutputLayer } from '@sofie-automation/blueprints-integration'
dotenv.config()

export class RunningOrderWatcher extends EventEmitter {
	public sheetFolderName?: string

	on: ((event: 'info', listener: (message: string) => void) => this) &
		((event: 'error', listener: (error: any, stack?: any) => void) => this) &
		((event: 'warning', listener: (message: string) => void) => this) &

		((event: 'rundown_delete', listener: (runningOrderId: string) => void) => this) &
		((event: 'rundown_create', listener: (runningOrderId: string, runningOrder: SheetRundown) => void) => this) &
		((event: 'rundown_update', listener: (runningOrderId: string, runningOrder: SheetRundown) => void) => this) &

		((event: 'segment_delete', listener: (runningOrderId: string, sectionId: string) => void) => this) &
		((event: 'segment_create', listener: (runningOrderId: string, sectionId: string, newSection: SheetSegment) => void) => this) &
		((event: 'segment_update', listener: (runningOrderId: string, sectionId: string, newSection: SheetSegment) => void) => this) &

		((event: 'part_delete', listener: (runningOrderId: string, sectionId: string, storyId: string) => void) => this) &
		((event: 'part_create', listener: (runningOrderId: string, sectionId: string, storyId: string, newStory: SheetPart) => void) => this) &
		((event: 'part_update', listener: (runningOrderId: string, sectionId: string, storyId: string, newStory: SheetPart) => void) => this)

	// Fast = list diffs, Slow = fetch All
	public pollIntervalFast: number = 2 * 1000
	public pollIntervalSlow: number = 10 * 1000
	public pollIntervalMedia: number = 5 * 1000

	private runningOrders: { [runningOrderId: string]: SheetRundown } = {}

	private fastInterval: NodeJS.Timer | undefined
	private slowinterval: NodeJS.Timer | undefined
	private mediaPollInterval: NodeJS.Timer | undefined

	private drive: drive_v3.Drive
	private currentlyChecking: boolean = false
	private sheetManager: SheetsManager
	private pageToken?: string
	private _lastMedia: MediaDict = {}
	private _lastOutputLayers: IOutputLayer[] = []
	private _lastWorkflow: WorkflowType
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
	constructor (
		private authClient: OAuth2Client,
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
	async checkRunningOrderById (runningOrderId: string): Promise<SheetRundown> {
		const runningOrder = await this.sheetManager.downloadRunningOrder(runningOrderId, this.coreHandler.GetOutputLayers())

		if (runningOrder.gatewayVersion === this.gatewayVersion) {
			this.processUpdatedRunningOrder(runningOrder.externalId, runningOrder)
		}

		return runningOrder
	}

	async checkDriveFolder (): Promise<SheetRundown[]> {
		if (!this.sheetFolderName) return []

		const runningOrderIds = await this.sheetManager.getSheetsInDriveFolder(this.sheetFolderName)
		return Promise.all(runningOrderIds.map(roId => {
			return this.checkRunningOrderById(roId)
		}))

	}
	/**
	 * Will add all currently available Running Orders from the first drive folder
	 * matching the provided name
	 *
	 * @param sheetFolderName Name of folder to add Running Orders from. Eg. "My Running Orders"
	 */
	async setDriveFolder (sheetFolderName: string): Promise<SheetRundown[]> {
		this.sheetFolderName = sheetFolderName
		return this.checkDriveFolder()
	}

	sendMediaViaGAPI (): Promise<void> {
		// Create required updates
		let updates: SheetUpdate[] = []
		let cell = 2
		for (let key in this._lastMedia) {
			// Media name.
			updates.push({
				value: this._lastMedia[key].path,
				cellPosition: `E${cell}`
			})
			// Media duration.
			updates.push({
				value: this._lastMedia[key].duration,
				cellPosition: `F${cell}`
			})
			cell++
		}

		// Update all running orders with media.
		Object.keys(this.runningOrders).forEach(id => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	sendOutputLayersViaGAPI (): Promise<void> {
		// Create reqrired updates
		let updates: SheetUpdate[] = []

		updates.push({
			value: 'None',
			cellPosition: `H2`
		})

		let cell = 3
		for (let key in this._lastOutputLayers) {
			updates.push({
				value: this._lastOutputLayers[key].name,
				cellPosition: `H${cell}`
			})
			cell++
		}

		// Update all running orders with outputLayers.
		Object.keys(this.runningOrders).forEach(id => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	sendTransitionsViaGAPI (workflow: WorkflowType): Promise<void> {
		// Create reqrired updates
		let updates: SheetUpdate[] = []
		let cell = 2

		if (workflow === 'VMIX') {
			[
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
				'VerticalSlideReverse'
			].forEach(transition => {
				updates.push({
					value: transition,
					cellPosition: `J${cell}`
				})
				cell++
			})

			for (let i = cell; i < 20; i++) {
				updates.push({
					value: '',
					cellPosition: `J${cell}`
				})
			}
		} else {
			[
				'mix',
				'cut',
				'dip',
				'sting',
				'wipe'
			].forEach(transition => {
				updates.push({
					value: transition,
					cellPosition: `J${cell}`
				})
				cell++
			})

			for (let i = cell; i < 20; i++) {
				updates.push({
					value: '',
					cellPosition: `J${cell}`
				})
			}
		}

		// Update all running orders with outputLayers.
		Object.keys(this.runningOrders).forEach(id => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	sendObjectTypesViaGAPI (): Promise<void> {
		// Create reqrired updates
		let updates: SheetUpdate[] = []
		let cell = 2

		let objs = [
			'camera',
			'video',
			'graphic',
			'overlay',
			'lights',
			'transition',
			'remote',
			'pip',
			'voiceover',
			'script'
		]

		if (this.coreHandler.GetWorkflow() !== 'VMIX') {
			objs.push('split')
		}

		objs.forEach(obj => {
			updates.push({
				value: obj,
				cellPosition: `C${cell}`
			})
		})

		// Update all running orders with outputLayers.
		Object.keys(this.runningOrders).forEach(id => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	sendTemplateTypesViaGAPI (): Promise<void> {
		// Create reqrired updates
		let updates: SheetUpdate[] = []
		let cell = 2

		let objs = [
			'FULL',
			'HEAD',
			'CAM',
			'DVE',
			'SECTION',
			'TITLES',
			'BREAKER',
			'PACKAGE'
		]

		objs.forEach(obj => {
			updates.push({
				value: obj,
				cellPosition: `A${cell}`
			})
		})

		// Update all running orders with outputLayers.
		Object.keys(this.runningOrders).forEach(id => {
			this.sheetManager.updateSheetWithSheetUpdates(id, '_dataFromSofie', updates).catch(console.error)
		})

		return Promise.resolve()
	}

	/**
	 * Sends available media as CSV to a URL specified in .env
	 */
	sendMediaAsCSV (): Promise<void> {
		// Create required updates
		let updates: { name: string, duration: string }[] = []
		for (let key in this._lastMedia) {
			updates.push({
				name: this._lastMedia[key].name,
				duration: this._lastMedia[key].duration
			})
		}

		// Convert the media list to xml.
		function convertToCSV (updates: {name: string, duration: string}[]) {
			let output = ''
			updates.forEach(update => {
				output += `${update.name},${update.duration}\n`
			})
			output = output.substring(0, output.length - 1)
			return output
		}

		if (process.env.MEDIA_URL) {
			let req = request.post(process.env.MEDIA_URL, function (err) {
				if (err) {
					console.log(err)
				}
			})
			let form = req.form()
			form.append('file', convertToCSV(updates), {
				filename: 'media.csv',
				contentType: 'text/plain'
			})
		}

		return Promise.resolve()
	}

	fillRundownData (): Promise<void> {
		this.sendMediaViaGAPI().catch(console.log)
		this.sendOutputLayersViaGAPI().catch(console.log)
		this.sendTransitionsViaGAPI(this._lastWorkflow).catch(console.log)
		this.sendObjectTypesViaGAPI().catch(console.log)
		this.sendTemplateTypesViaGAPI().catch(console.log)

		return Promise.resolve()
	}

	/**
	 * Adds all available media to all running orders.
	 */
	updateAvailableMedia (): Promise<void> {
		let newMedia = this.coreHandler.GetMedia()

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
	updateAvailableOutputs (): Promise<void> {
		let outputLayers = this.coreHandler.GetOutputLayers()

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
	updateAvailableTransitions (): Promise<void> {
		let workflow = this.coreHandler.GetWorkflow()
		if (this._lastWorkflow !== workflow) {
			this._lastWorkflow = workflow

			this.sendTransitionsViaGAPI(this._lastWorkflow).catch(console.log)
		}

		return Promise.resolve()
	}

	/**
	 * Start the watcher
	 */
	startWatcher () {
		console.log('Starting Watcher')
		this.stopWatcher()

		this.fastInterval = setInterval(() => {
			if (this.currentlyChecking) {
				return
			}
			// console.log('Running fast check')
			this.currentlyChecking = true
			this.checkForChanges()
			.catch(error => {
				console.error('Something went wrong during fast check', error, error.stack)
			})
			.then(() => {
				// console.log('fast check done')
				this.currentlyChecking = false
			}).catch(console.error)

		}, this.pollIntervalFast)

		this.slowinterval = setInterval(() => {
			if (this.currentlyChecking) {
				return
			}
			console.log('Running slow check')
			this.currentlyChecking = true

			this.checkDriveFolder()
			.catch(error => {
				console.error('Something went wrong during slow check', error, error.stack)
			})
			.then(() => {
				// console.log('slow check done')
				this.currentlyChecking = false
			}).catch(console.error)

		}, this.pollIntervalSlow)

		this.mediaPollInterval = setInterval(() => {
			if (this.currentlyChecking) {
				return
			}
			this.currentlyChecking = true
			this.updateAvailableMedia()
			.catch(error => {
				console.log('Something went wrong during siper slow check', error, error.stack)
			})
			.then(() => {
				this.updateAvailableOutputs()
				.catch(error => {
					console.log('Something went wrong during super slow check', error, error.stack)
				})
				.then(() => {
					this.updateAvailableTransitions()
					.catch(error => {
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
	stopWatcher () {
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
	dispose () {
		this.stopWatcher()
	}

	private processUpdatedRunningOrder (rundownId: string, rundown: SheetRundown | null) {

		const oldRundown = this.runningOrders[rundownId]

		// Check if runningOrders have changed:

		if (!rundown && oldRundown) {
			this.emit('rundown_delete', rundownId)

		} else if (rundown && !oldRundown) {
			this.emit('rundown_create', rundownId, rundown)
			this.fillRundownData().catch(console.error)
		} else if (rundown && oldRundown) {

			if (!_.isEqual(rundown.serialize(), oldRundown.serialize())) {

				console.log(rundown.serialize()) // debug

				this.emit('rundown_update', rundownId, rundown)
			} else {
				const newRundown: SheetRundown = rundown

				// Go through the sections for changes:
				_.uniq(
					oldRundown.segments.map(segment => segment.externalId).concat(
					newRundown.segments.map(segment => segment.externalId))
				).forEach((segmentId: string) => {
					const oldSection: SheetSegment = oldRundown.segments.find(segment => segment.externalId === segmentId) as SheetSegment // TODO: handle better
					const newSection: SheetSegment = rundown.segments.find(segment => segment.externalId === segmentId) as SheetSegment

					if (!newSection && oldSection) {
						this.emit('segment_delete', rundownId, segmentId)
					} else if (newSection && !oldSection) {
						this.emit('segment_create', rundownId, segmentId, newSection)
					} else if (newSection && oldSection) {

						if (!_.isEqual(newSection.serialize(), oldSection.serialize())) {
							console.log(newSection.serialize(), oldSection.serialize()) // debug
							this.emit('segment_update', rundownId, segmentId, newSection)
						} else {

							// Go through the stories for changes:
							_.uniq(
								oldSection.parts.map(part => part.externalId).concat(
								newSection.parts.map(part => part.externalId))
							).forEach((storyId: string) => {

								const oldStory: SheetPart = oldSection.parts.find(part => part.externalId === storyId) as SheetPart // TODO handle the possibility of a missing id better
								const newStory: SheetPart = newSection.parts.find(part => part.externalId === storyId) as SheetPart

								if (!newStory && oldStory) {
									this.emit('part_delete', rundownId, segmentId, storyId)
								} else if (newStory && !oldStory) {
									this.emit('part_create', rundownId, segmentId, storyId, newStory)
								} else if (newStory && oldStory) {

									if (!_.isEqual(newStory.serialize(), oldStory.serialize())) {
										console.log(newStory.serialize(), oldStory.serialize()) // debug
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

	private async processChange (change: drive_v3.Schema$Change) {
		const fileId = change.fileId
		if (fileId) {
			let valid = await this.sheetManager.checkSheetIsValid(fileId)
			if (valid) {
				if (change.removed) {
					// file was removed
					console.log('Sheet was deleted', fileId)

					this.processUpdatedRunningOrder(fileId, null)
				} else {

					// file was updated
					console.log('Sheet was updated', fileId)
					const newRunningOrder = await this.sheetManager.downloadRunningOrder(fileId, this.coreHandler.GetOutputLayers())

					if (newRunningOrder.gatewayVersion === this.gatewayVersion) {
						this.processUpdatedRunningOrder(fileId, newRunningOrder)
					}
				}
			}
		}
	}

	private async getPageToken (): Promise<string> {
		if (this.pageToken) {
			return this.pageToken
		}

		const result = await this.drive.changes.getStartPageToken({})
		if (!result.data.startPageToken) {
			throw new Error('No startPageToken found')
		}
		return result.data.startPageToken
	}
	private async checkForChanges (): Promise<any> {
		let pageToken: string | undefined = await this.getPageToken()

		while (pageToken) {
			const listData: GaxiosResponse<drive_v3.Schema$ChangeList> = await this.drive.changes.list({
				restrictToMyDrive: true,
				pageToken: pageToken,
				fields: '*'
			})

			if (listData.data.changes) {
				for (let key in listData.data.changes) {
					let change = listData.data.changes[key]
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
