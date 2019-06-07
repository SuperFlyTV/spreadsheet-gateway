import { EventEmitter } from 'events'
import { SheetRundown } from './Rundown'
import { OAuth2Client } from 'googleapis-common'
import { google, drive_v3 } from 'googleapis'
import { SheetsManager } from './SheetManager'
import { GaxiosResponse } from 'gaxios'
import * as _ from 'underscore'
import { SheetSegment } from './Segment'
import { SheetPart } from './Part'
import * as clone from 'clone'

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

	private runningOrders: { [runningOrderId: string]: SheetRundown } = {}

	private fastInterval: NodeJS.Timer | undefined
	private slowinterval: NodeJS.Timer | undefined

	private drive: drive_v3.Drive
	private currentlyChecking: boolean = false
	private sheetManager: SheetsManager
	private pageToken?: string
	/**
	 * A Running Order watcher which will poll Google Drive for changes and emit events
	 * whenever a change occurs.
	 *
	 * @param authClient Google OAuth2Clint containing connection information
	 * @param delayStart (Optional) Set to a falsy value to prevent the watcher to start watching immediately.
	 */
	constructor (
		private authClient: OAuth2Client,
		delayStart?: boolean
	) {
		super()
		this.drive = google.drive({ version: 'v3', auth: this.authClient })

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
		const runningOrder = await this.sheetManager.downloadRunningOrder(runningOrderId)

		this.processUpdatedRunningOrder(runningOrder.externalId, runningOrder)

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
		} else if (rundown && oldRundown) {

			if (!_.isEqual(rundown.serialize(), oldRundown.serialize())) {

				console.log(rundown.serialize()) // debug

				this.emit('rundown_update', rundownId, rundown)
			} else {
				const newRundown: SheetRundown = rundown

				// Go through the sections for changes:
				_.uniq(
					_.keys(oldRundown.segments).concat(
					_.keys(newRundown.segments))
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
								_.keys(oldSection.parts).concat(
								_.keys(newSection.parts))
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
			if (change.removed) {
				// file was removed
				console.log('Sheet was deleted', fileId)

				this.processUpdatedRunningOrder(fileId, null)
			} else {

				// file was updated
				console.log('Sheet was updated', fileId)
				const newRunningOrder = await this.sheetManager.downloadRunningOrder(fileId)

				this.processUpdatedRunningOrder(fileId, newRunningOrder)
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
