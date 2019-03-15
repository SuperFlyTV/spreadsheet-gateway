import { EventEmitter } from 'events'
import { SheetRunningOrder } from './classes/RunningOrder';
import { OAuth2Client } from 'googleapis-common';
import { google, drive_v3 } from 'googleapis';
import { downloadSheet } from './sheets'
export class RunningOrderWatcher extends EventEmitter {
    private interval: NodeJS.Timeout | undefined
    private pageToken: string | undefined
    private drive: drive_v3.Drive
    private runningOrderIdDictionary: {[runningOrderId: string]: SheetRunningOrder} = {}
    private currentlyChecking: boolean = false
    constructor (public runningOrders: SheetRunningOrder[], public pollIntervalMS: number, private authClient: OAuth2Client, delayStart?: boolean) { 
        super()
        this.drive = google.drive({ version: 'v3', auth: this.authClient })
        runningOrders.forEach(runningOrder => {
            this.runningOrderIdDictionary[runningOrder.id] = runningOrder
        })
        if (!delayStart) {
            this.startWatcher()
        }
    }


    startWatcher() {
        this.stopWatcher()
        this.interval = setInterval(this.onInterval.bind(this), this.pollIntervalMS)
    }

    stopWatcher() {
        if(this.interval) {
            clearInterval(this.interval)
            this.interval = undefined
        }
    }

    private onInterval () {
        if(this.currentlyChecking) {
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
        // this.getChanges()
        // .then((changesObject: any) => {
        //     if (!changesObject) { return }
        //     console.log('allChanges', typeof changesObject, changesObject)
        //     pageToken = changesObject.newStartPageToken; // update page token
        //     (changesObject.changes || []).forEach((change: any) => {
        //         if (change && nsiep[change.fileId]) {
        //             // There was a change in one of our files.
        //             if (change.removed) {
        //                 // file was removed
        //                 // removeSheet(change.fileId)ø
        //                 console.log('thing was deleted', change.fileId)
        //                 delete nsiep[change.fileId]
        //             } else {
        //                 // file was updated
        //                 console.log('thing was updated', change.fileId)
        //                 manageSheet(auth, change.fileId)
        //             }
        //         }
        //     })
        // })
        // .catch(error => {
        //     console.error(error)
        // })
    }

    private processChange(change: drive_v3.Schema$Change) {
        const fileId = change.fileId
        const currentRunningOrder = this.runningOrderIdDictionary[fileId || '']
        if (fileId && currentRunningOrder) {
            // There was a change in one of our files.
            if (change.removed) {
                // file was removed
                // removeSheet(fileId)
                console.log('Sheet was deleted', fileId)
                delete this.runningOrderIdDictionary[fileId]
                this.runningOrders = this.runningOrders.filter(ro => { return ro.id !== currentRunningOrder.id})
            } else {
                // file was updated
                console.log('thing was updated', fileId)
                downloadSheet(this.authClient, fileId)
                .then(data => {
                    const runningOrderTitle = data.meta.properties ? data.meta.properties.title || 'unknown' : 'unknown'
                    let newRunningOrder = SheetRunningOrder.fromSheetCells(fileId, runningOrderTitle, data.values.values || [])
                    let runningOrderDiff = currentRunningOrder.diff(newRunningOrder)
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
                })
            }
        }
    }
    private checkForChanges(): Promise<any> {
        return this.drive.changes.list({
            pageToken: this.pageToken,
            fields: '*'
        })
        .then(data => {
            if(data.data.changes) {
                data.data.changes.forEach(change => {
                    this.processChange(change)
                })
            }
            if(data.data.newStartPageToken) {
                // This was the end. No more changes
                this.pageToken = data.data.newStartPageToken
                return data
            }
            if(data.data.nextPageToken) {
                // There are more changes. We need to get changes again.
                this.pageToken = data.data.nextPageToken
                return this.checkForChanges()
            }
        })
    }
}
