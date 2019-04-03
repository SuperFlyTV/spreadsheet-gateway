import { google, sheets_v4 } from 'googleapis'
import { OAuth2Client } from 'googleapis-common'
import { SheetRunningOrder } from './RunningOrder'
const sheets = google.sheets('v4')

const SHEET_NAME = process.env.SHEET_NAME || 'Rundown'

export interface SheetUpdate {
	value: string
	cellPosition: string
}

export class SheetsManager {

	constructor (private auth: OAuth2Client) { }

	/**
	 * Creates a Google Sheets api-specific change element
	 *
	 * @param cell Cell range for the cell being updated. Eg. "A2"
	 * @param newValue The new value for the cell
	 */
	static createSheetValueChange (cell: string, newValue: any): sheets_v4.Schema$ValueRange {
		return {
			range: `${cell}:${cell}`, // Maybe we don't need the `:`?
			values: [[newValue]]
		}
	}

	/**
	 * Downloads and parses a Running Order for google sheets
	 *
	 * @param rundownSheetId Id of the google sheet containing the Running Order
	 */
	downloadRunningOrder (rundownSheetId: string): Promise<SheetRunningOrder> {
		return this.downloadSheet(rundownSheetId)
		.then(data => {
			const runningOrderTitle = data.meta.properties ? data.meta.properties.title || 'unknown' : 'unknown'
			return SheetRunningOrder.fromSheetCells(rundownSheetId, runningOrderTitle, data.values.values || [], this)
		})
	}

	/**
	 * Downloads raw data from google spreadsheets
	 *
	 * @param spreadsheetId Id of the google spreadsheet to download
	 */
	downloadSheet (spreadsheetId: string) {
		const request = {
			// The spreadsheet to request.
			auth: this.auth,
			spreadsheetId,
			// The ranges to retrieve from the spreadsheet.
			range: SHEET_NAME // Get all cells in Rundown sheet

		}
		return Promise.all([
			sheets.spreadsheets.get({
				auth: this.auth,
				spreadsheetId,
				fields: 'spreadsheetId,properties.title'
			}),
			sheets.spreadsheets.values.get(request)])
			.then(([meta, values]) => {
				return {
					meta: meta.data,
					values: values.data
				}
			})

	}

	updateSheetWithSheetUpdates (spreadsheetId: string, sheetUpdates: SheetUpdate[]) {
		let googleUpdates = sheetUpdates.map(update => {
			return SheetsManager.createSheetValueChange(update.cellPosition, update.value)
		})
		return this.updateSheet(spreadsheetId, googleUpdates)
		.then((res) => {
			console.log('Sheet updated', spreadsheetId)
			return res
		})
	}

	/**
	 * Update the values of the google spreadsheet in google drive (external).
	 *
	 * @param spreadsheetId Id of spreadsheet to update
	 * @param sheetUpdates List of updates to issue to the google spreadsheet
	 */
	updateSheet (spreadsheetId: string, sheetUpdates: sheets_v4.Schema$ValueRange[]) {
		let request: sheets_v4.Params$Resource$Spreadsheets$Values$Batchupdate = {
			spreadsheetId: spreadsheetId,
			requestBody: {
				valueInputOption: 'RAW',
				data: sheetUpdates
				// [{
				//     range: 'A1:A1',
				//     values: [[1]]
				// }]
			},
			auth: this.auth
		}
		return sheets.spreadsheets.values.batchUpdate(request)
	}

	/**
	 * Returns a list of ids of Google Spreadsheets in provided folder.
	 * If multiple folders have the same name, the first folder is selected.
	 *
	 * @param folderName Name of Google Drive folder
	 */
	getSheetsInDriveFolder (folderName: string): Promise<string[]> {
		const drive = google.drive({ version: 'v3', auth: this.auth })
		return drive.files.list({
			// q: `mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents`,
			q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
			pageSize: 10,
			spaces: 'drive',
			fields: 'nextPageToken, files(*)'
		})
		.then(fileList => {
			// Use first hit only. We assume that that would be the correct folder.
			// If you have multiple folders with the same name, it will become un-deterministic
			if (fileList.data.files && fileList.data.files[0] && fileList.data.files[0].id) {
				return this.getSheetsInDriveFolderId(fileList.data.files[0].id)
			} else {
				return []
			}
		})
	}
	/**
	 * Returns a list of ids of Google Spreadsheets in provided folder.
	 *
	 * @param folderId Id of Google Drive folder to retrieve spreadsheets from
	 * @param nextPageToken Google drive nextPageToken pagination token.
	 */
	getSheetsInDriveFolderId (folderId: string, nextPageToken?: string): Promise<string[]> {
		const drive = google.drive({ version: 'v3', auth: this.auth })
		return drive.files.list({
			q: `mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents`,
			spaces: 'drive',
			fields: 'nextPageToken, files(*)',
			pageToken: nextPageToken
		})
		.then(fileList => {
			let resultData = (fileList.data.files || [])
			.filter(file => {
				return file.id
			})
			.map(file => {
				return file.id || ''
			})

			if (fileList.data.nextPageToken) {
				return this.getSheetsInDriveFolderId(folderId, fileList.data.nextPageToken)
				.then(result => {
					return resultData.concat(result)
				})
			} else {
				return resultData
			}
		})
	}
}
