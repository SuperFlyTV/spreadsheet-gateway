import { google, sheets_v4 } from 'googleapis'
import { OAuth2Client } from 'googleapis-common'
import { SheetRundown } from './Rundown'
import { IOutputLayer } from '@sofie-automation/blueprints-integration'
const sheets = google.sheets('v4')
const drive = google.drive('v3')

const SHEET_NAME = process.env.SHEET_NAME || 'Rundown'

export interface SheetUpdate {
	value: string | number
	cellPosition: string
}

export class SheetsManager {
	private currentFolder = ''

	constructor (private auth: OAuth2Client) { }

	/**
	 * Creates a Google Sheets api-specific change element
	 *
	 * @param sheet Name of sheet to update e.g. 'Rundown'
	 * @param cell Cell range for the cell being updated. Eg. "A2"
	 * @param newValue The new value for the cell
	 */
	static createSheetValueChange (sheet: string, cell: string, newValue: any): sheets_v4.Schema$ValueRange {
		return {
			range: `${sheet}!${cell}`,
			values: [[newValue]]
		}
	}

	/**
	 * Downloads and parses a Running Order for google sheets
	 *
	 * @param rundownSheetId Id of the google sheet containing the Running Order
	 */
	downloadRunningOrder (rundownSheetId: string, outputLayers: IOutputLayer[]): Promise<SheetRundown> {
		return this.downloadSheet(rundownSheetId)
		.then(data => {
			const runningOrderTitle = data.meta.properties ? data.meta.properties.title || 'unknown' : 'unknown'
			return SheetRundown.fromSheetCells(rundownSheetId, runningOrderTitle, data.values.values || [], outputLayers, this)
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

	/**
	 * Updates a sheet with a set of sheet updates.
	 * @param spreadsheetId The ID of the spreadsheet document.
	 * @param sheet The name of the sheet within the document, e.g. 'Rundown'.
	 * @param sheetUpdates The updates to apply.
	 */
	async updateSheetWithSheetUpdates (spreadsheetId: string, sheet: string, sheetUpdates: SheetUpdate[]) {
		let googleUpdates = sheetUpdates.map(update => {
			return SheetsManager.createSheetValueChange(sheet, update.cellPosition, update.value)
		})
		return this.updateSheet(spreadsheetId, googleUpdates)

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
	async getSheetsInDriveFolder (folderName: string): Promise<string[]> {
		const drive = google.drive({ version: 'v3', auth: this.auth })

		const fileList = await drive.files.list({
			// q: `mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents`,
			q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
			pageSize: 100,
			spaces: 'drive',
			fields: 'nextPageToken, files(*)'
		})
		// Use first hit only. We assume that that would be the correct folder.
		// If you have multiple folders with the same name, it will become un-deterministic
		if (
			fileList.data.files &&
			fileList.data.files[0] &&
			fileList.data.files[0].id
		) {
			return this.getSheetsInDriveFolderId(fileList.data.files[0].id)
		} else {
			return []
		}

	}
	/**
	 * Returns a list of ids of Google Spreadsheets in provided folder.
	 *
	 * @param folderId Id of Google Drive folder to retrieve spreadsheets from
	 * @param nextPageToken Google drive nextPageToken pagination token.
	 */
	async getSheetsInDriveFolderId (folderId: string, nextPageToken?: string): Promise<string[]> {
		const drive = google.drive({ version: 'v3', auth: this.auth })

		this.currentFolder = folderId

		const fileList = await drive.files.list({
			q: `mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents`,
			spaces: 'drive',
			fields: 'nextPageToken, files(*)',
			pageToken: nextPageToken
		})

		let resultData = (fileList.data.files || [])
		.filter(file => {
			if (file.name && file.name[0] !== '_' && !file.trashed) {
				return file.id
			}
			return
		})
		.map(file => {
			return file.id || ''
		})

		if (fileList.data.nextPageToken) {
			const result = await this.getSheetsInDriveFolderId(folderId, fileList.data.nextPageToken)

			return resultData.concat(result)
		} else {
			return resultData
		}

	}

	/**
	 * Checks if a sheet contains the 'Rundown' range.
	 * @param {string} sheetid Id of the sheet to check.
	 */
	async checkSheetIsValid (sheetid: string): Promise<boolean> {
		const spreadsheet = await sheets.spreadsheets.get({
			spreadsheetId: sheetid,
			auth: this.auth
		}).catch(console.error)

		if (!spreadsheet) {
			return Promise.resolve(false)
		}

		const file = await drive.files.get({
			fileId: sheetid,
			fields: 'parents',
			auth: this.auth
		}).catch(console.error)

		if (!file) {
			return Promise.resolve(false)
		}

		const folderId = this.currentFolder

		if (spreadsheet.data && file.data) {
			if (spreadsheet.data.sheets && file.data.parents) {
				const sheets = spreadsheet.data.sheets.map(sheet => {
					if (sheet.properties) {
						return sheet.properties.title
					}

					return
				})
				if (sheets.indexOf(SHEET_NAME) !== -1 && file.data.parents.indexOf(folderId) !== -1) {
					return Promise.resolve(true)
				}
			}
		}

		return Promise.resolve(false)
	}
}
