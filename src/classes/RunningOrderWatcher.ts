import { EventEmitter } from 'events'
import { SheetRunningOrder, SheetRunningOrderDiffWithType } from './RunningOrder'
import { OAuth2Client } from 'googleapis-common'
import { google, drive_v3 } from 'googleapis'
import { SheetsManager } from './SheetManager'

export class RunningOrderWatcher extends EventEmitter {
	private interval: NodeJS.Timeout | undefined
	private pageToken?: string
	private drive: drive_v3.Drive
	private runningOrderIdDictionary: { [runningOrderId: string]: SheetRunningOrder } = {}
	private currentlyChecking: boolean = false
	private sheetManager: SheetsManager
	/**
	 * A Running Order watcher which will poll Google Drive for changes and emit events
	 * whenever a change occurs.
	 *
	 * @param runningOrders List of existing SheetRunningOrders
	 * @param pollIntervalMS Poll interval in milliseconds. Eg. 10000 => 10 seconds
	 * @param authClient Google OAuth2Clint containing connection information
	 * @param delayStart (Optional) Set to a falsy value to prevent the watcher to start watching immediately.
	 */
	constructor (public runningOrders: SheetRunningOrder[], public pollIntervalMS: number, private authClient: OAuth2Client, delayStart?: boolean) {
		super()
		this.drive = google.drive({ version: 'v3', auth: this.authClient })
		runningOrders.forEach(runningOrder => {
			this.runningOrderIdDictionary[runningOrder.id] = runningOrder
		})
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
	addRunningOrderById (runningOrderId: string) {
		return this.sheetManager.downloadRunningOrder(runningOrderId)
			.then(runningOrder => {
				this.addRunningOrder(runningOrder)
			})
	}
	/**
	 * Will add all currently available Running Orders from the first drive folder
	 * matching the provided name
	 *
	 * @param sheetFolderName Name of folder to add Running Orders from. Eg. "My Running Orders"
	 */
	addSheetsFolderToWatch (sheetFolderName: string) {
		return this.sheetManager.getSheetsInDriveFolder(sheetFolderName)
			.then(runningOrderIds => {
				return Promise.all(runningOrderIds.map(roId => {
					return this.addRunningOrderById(roId)
				}))
			})
	}

	/**
	 * Start the watcher
	 */
	startWatcher () {
		console.log('Starting Watcher')
		this.stopWatcher()
		this.interval = setInterval(this.onInterval.bind(this), this.pollIntervalMS)
	}

	/**
	 * Stop the watcher
	 */
	stopWatcher () {
		if (this.interval) {
			console.log('Stopping Watcher')
			clearInterval(this.interval)
			this.interval = undefined
		}
	}
	/**
	 * Deletes a running order from the watcher, removing it from the watch list.
	 *
	 * @param runningOrderId Id of running order to delete
	 */
	deleteRunningOrder (runningOrderId: string) {
		console.log('Removing running order', runningOrderId)
		delete this.runningOrderIdDictionary[runningOrderId]
		this.runningOrders = this.runningOrders.filter(ro => { return ro.id !== runningOrderId })
	}
	/**
	 * Update existing running order with new one.
	 *
	 * @param newRunningOrder Running order that supercedes the old one
	 */
	updateRunningOrder (newRunningOrder: SheetRunningOrder) {
		this.runningOrderIdDictionary[newRunningOrder.id] = newRunningOrder
		this.runningOrders = this.runningOrders.map(ro => {
			if (ro.id === newRunningOrder.id) {
				return newRunningOrder
			} else {
				return ro
			}
		})
	}
	addRunningOrder (runningOrder: SheetRunningOrder) {
		console.log('added running order', runningOrder.id)
		this.runningOrderIdDictionary[runningOrder.id] = runningOrder
		this.runningOrders.push(runningOrder)
	}

	private onInterval () {
		if (this.currentlyChecking) {
			console.log('ignoring. Currently checking')
			return
		}
		console.log('Running interval')
		this.currentlyChecking = true
		this.checkForChanges()
			.catch(error => {
				console.error('Something went wrong during checking', error, error.stack)
			})
			.then(() => {
				console.log('Interval done')
				this.currentlyChecking = false
			})
	}

	private processChangeDiff (runningOrderDiff: SheetRunningOrderDiffWithType) {
		if (runningOrderDiff.changeType === 'Deleted') {
			this.deleteRunningOrder(runningOrderDiff.id)
		}
		let flatDiff = SheetRunningOrder.DiffWithTypeToFlatDiff(runningOrderDiff)
		flatDiff.runningOrders.forEach(roDiff => {
			this.emit('runningOrder:' + roDiff.changeType, [roDiff])
		})
		flatDiff.sections.forEach(sectionDiff => {
			this.emit('section:' + sectionDiff.changeType, [sectionDiff])
		})
		flatDiff.stories.forEach(storiesDiff => {
			this.emit('story:' + storiesDiff.changeType, [storiesDiff])
		})
		// Or we can simply emit the whole flat diff
		this.emit('changes:flat', [flatDiff])
		// Or the non-flat version
		this.emit('changes:full', [runningOrderDiff])
	}

	private processChange (change: drive_v3.Schema$Change) {
		const fileId = change.fileId
		const currentRunningOrder = this.runningOrderIdDictionary[fileId || '']
		if (fileId && currentRunningOrder) {
			if (change.removed) {
				// file was removed
				console.log('Sheet was deleted', fileId)
				// TODO: we must emit a Deleted event
				let diff = currentRunningOrder.diff(undefined)
				this.processChangeDiff(diff)
			} else {
				// file was updated
				console.log('Sheet was updated', fileId)
				this.sheetManager.downloadRunningOrder(fileId)
					.then(newRunningOrder => {
						let runningOrderDiff = currentRunningOrder.diff(newRunningOrder)
						this.updateRunningOrder(newRunningOrder)
						this.processChangeDiff(runningOrderDiff)
					})
			}
		}
	}

	private getPageToken (): Promise<string> {
		if (this.pageToken) {
			return Promise.resolve(this.pageToken)
		}
		return this.drive.changes.getStartPageToken({})
			.then(result => {
				if (!result.data.startPageToken) {
					return Promise.reject(new Error('No startPageToken found'))
				}
				return Promise.resolve(result.data.startPageToken)
			})
	}
	private checkForChanges (): Promise<any> {
		return this.getPageToken()
			.then(pageToken => {
				return this.drive.changes.list({
					pageToken: pageToken,
					fields: '*'
				})
					.then(data => {
						if (data.data.changes) {
							data.data.changes.forEach(change => {
								this.processChange(change)
							})
						}
						if (data.data.newStartPageToken) {
							// This was the end. No more changes
							this.pageToken = data.data.newStartPageToken
							return data
						}
						if (data.data.nextPageToken) {
							// There are more changes. We need to get changes again.
							this.pageToken = data.data.nextPageToken
							return this.checkForChanges()
						}
					})
			})
	}
}
