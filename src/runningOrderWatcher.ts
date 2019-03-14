import { EventEmitter } from 'events'
import { RunningOrder } from './classes/RunningOrder';
import { OAuth2Client } from 'googleapis-common';
import { google, drive_v3 } from 'googleapis';

export class RunningOrderWatcher extends EventEmitter {
    private interval: NodeJS.Timeout | undefined
    private pageToken: string | undefined
    private drive: drive_v3.Drive
    constructor (public runningOrders: RunningOrder[], public pollIntervalMS: number, private authClient: OAuth2Client, delayStart?: boolean) { 
        super()
        this.drive = google.drive({ version: 'v3', auth: this.authClient })
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
        
        this.getChanges()
        .then((changesObject: any) => {
            if (!changesObject) { return }
            console.log('allChanges', typeof changesObject, changesObject)
            pageToken = changesObject.newStartPageToken; // update page token
            (changesObject.changes || []).forEach((change: any) => {
                if (change && nsiep[change.fileId]) {
                    // There was a change in one of our files.
                    if (change.removed) {
                        // file was removed
                        // removeSheet(change.fileId)ø
                        console.log('thing was deleted', change.fileId)
                        delete nsiep[change.fileId]
                    } else {
                        // file was updated
                        console.log('thing was updated', change.fileId)
                        manageSheet(auth, change.fileId)
                    }
                }
            })
        })
        .catch(error => {
            console.error(error)
        })

        this.runningOrders.forEach(runningOrder => {

        })
    }

    private getChanges(){
        return this.drive.changes.list({
            pageToken: this.pageToken,
            fields: '*'
        })
        .then(data => {
            if(data.data.nextPageToken) {
                // There are more changes. We need to get changes again.
            }
            return data
        })
    }

}