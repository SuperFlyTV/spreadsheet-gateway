import { EventEmitter } from 'events'
import { SheetRunningOrder, SheetRunningOrderDiffWithType } from './RunningOrder';
import { OAuth2Client } from 'googleapis-common';
import { google, drive_v3 } from 'googleapis';
import { SheetsManager } from './SheetManager'
export class RunningOrderWatcher extends EventEmitter {
    private interval: NodeJS.Timeout | undefined
    private pageToken?: string
    private drive: drive_v3.Drive
    private runningOrderIdDictionary: { [runningOrderId: string]: SheetRunningOrder } = {}
    private currentlyChecking: boolean = false
    private sheetManager: SheetsManager
    constructor(public runningOrders: SheetRunningOrder[], public pollIntervalMS: number, private authClient: OAuth2Client, delayStart?: boolean) {
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

    addRunningOrderById(runningOrderId: string) {
        return this.sheetManager.downloadRunningOrder(runningOrderId)
            .then(runningOrder => {
                this.addRunningOrder(runningOrder)
            })
    }

    addSheetsFolderToWatch(sheetFolderName: string) {
        return this.sheetManager.getSheetsInDriveFolder(sheetFolderName)
            .then(runningOrderIds => {
                return Promise.all(runningOrderIds.map(roId => {
                    return this.addRunningOrderById(roId)
                }))
            })
    }

    startWatcher() {
        console.log('Starting Watcher')
        this.stopWatcher()
        this.interval = setInterval(this.onInterval.bind(this), this.pollIntervalMS)
    }

    stopWatcher() {
        if (this.interval) {
            console.log('Stopping Watcher')
            clearInterval(this.interval)
            this.interval = undefined
        }
    }

    deleteRunningOrder(runningOrderId: string) {
        console.log('Removing running order', runningOrderId)
        delete this.runningOrderIdDictionary[runningOrderId]
        this.runningOrders = this.runningOrders.filter(ro => { return ro.id !== runningOrderId })
    }
    addRunningOrder(runningOrder: SheetRunningOrder) {
        console.log('added running order', runningOrder.id)
        this.runningOrderIdDictionary[runningOrder.id] = runningOrder
        this.runningOrders.push(runningOrder)
    }

    private onInterval() {
        if (this.currentlyChecking) {
            return
        }
        this.currentlyChecking = true
        this.checkForChanges()
            .catch(error => {
                console.error('Something went wrong during checking', error, error.stack)
            })
            .then(() => {
                this.currentlyChecking = false
            })
    }

    private processChangeDiff(runningOrderDiff: SheetRunningOrderDiffWithType) {
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

    private processChange(change: drive_v3.Schema$Change) {
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
                        this.processChangeDiff(runningOrderDiff)
                    })
            }
        }
    }

    private getPageToken(): Promise<string> {
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
    private checkForChanges(): Promise<any> {
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
