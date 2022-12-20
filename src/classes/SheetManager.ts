import { IOutputLayer } from '@sofie-automation/blueprints-integration'
import { Auth, Common, google, sheets_v4 } from 'googleapis'
import { logger } from '../logger'
import { getErrorMsg } from '../util'
import { SheetRundown } from './Rundown'
const sheets = google.sheets({ version: 'v4', timeout: 5000 })
const drive = google.drive('v3')

const SHEET_NAME = process.env.SHEET_NAME || 'Rundown'

export interface SheetUpdate {
	value: string | number
	cellPosition: string
}

export interface SplittedSheets {
	mainSheet: sheets_v4.Schema$ValueRange | undefined
}

export class SheetsManager {
	private currentFolder = ''

	constructor(private _oAuth2Client: Auth.OAuth2Client) {}

	/**
	 * Creates a Google Sheets api-specific change element
	 *
	 * @param sheet Name of sheet to update e.g. 'Rundown'
	 * @param cell Cell range for the cell being updated. Eg. "A2"
	 * @param newValue The new value for the cell
	 */
	static createSheetValueChange(sheet: string, cell: string, newValue: unknown): sheets_v4.Schema$ValueRange {
		return {
			range: `${sheet}!${cell}`,
			values: [[newValue]],
		}
	}

	async downloadRundown(spreadsheetId: string, outputLayers: IOutputLayer[]): Promise<SheetRundown | undefined> {
		try {
			const downloadedSpreadsheet = await this.fetchSpreadsheetSheets(spreadsheetId)

			if (!downloadedSpreadsheet) {
				return undefined
			}

			const downloadedMainSheet = downloadedSpreadsheet?.mainSheet
			if (!downloadedMainSheet) {
				logger.warn(`Rundown main sheet is undefined`)
				return undefined
			}

			return SheetRundown.fromSheetCells(spreadsheetId, SHEET_NAME, downloadedMainSheet.values || [], outputLayers)
		} catch (error) {
			logger.error(`Error while downloading rundown`)
			logger.debug(error)
			return undefined
		}
	}

	async fetchSpreadsheetFromServer(
		spreadsheetId: string
	): Promise<Common.GaxiosResponse<sheets_v4.Schema$BatchGetValuesResponse>> {
		const res = await sheets.spreadsheets.values.batchGet({
			spreadsheetId,
			ranges: [SHEET_NAME],
			auth: this._oAuth2Client,
		})
		return res
	}

	/**
	 * Method downloads specific Google spreadsheet document
	 * @param spreadsheetId Id of the Google spreadsheet to download
	 * @returns Object containing all splitted sheets
	 */
	async fetchSpreadsheetSheets(spreadsheetId: string): Promise<SplittedSheets | undefined> {
		try {
			const res = await this.fetchSpreadsheetFromServer(spreadsheetId)
			return this.splitSheets(res)
		} catch (error) {
			logger.error(`Error while executing batch get for spreadsheet ${spreadsheetId}: ${getErrorMsg(error)}`)
			logger.debug(error)
			return undefined
		}
	}

	splitSheets(response: Common.GaxiosResponse<sheets_v4.Schema$BatchGetValuesResponse>): SplittedSheets {
		return {
			mainSheet: this.extractSheet(response.data.valueRanges || [], SHEET_NAME),
		}
	}

	/**
	 * Helper method that extracts specific sheet from the array of downloaded sheets.
	 * @param sheetValueRanges Array of downloaded ranges
	 * @param sheetName Name of the sheet that should be returned
	 * @returns Sheet value range of the desired sheet
	 */
	extractSheet(
		sheetValueRanges: sheets_v4.Schema$ValueRange[],
		sheetName: string
	): sheets_v4.Schema$ValueRange | undefined {
		for (const sheetValueRange of sheetValueRanges) {
			if (sheetValueRange.range?.includes(sheetName)) {
				return sheetValueRange
			}
		}
		return undefined
	}

	/**
	 * Updates a sheet with a set of sheet updates.
	 * @param spreadsheetId The ID of the spreadsheet document.
	 * @param sheet The name of the sheet within the document, e.g. 'Rundown'.
	 * @param sheetUpdates The updates to apply.
	 */
	async updateSheetWithSheetUpdates(
		spreadsheetId: string,
		sheet: string,
		sheetUpdates: SheetUpdate[]
	): Promise<Common.GaxiosResponse<sheets_v4.Schema$BatchUpdateValuesResponse>> {
		const googleUpdates = sheetUpdates.map((update) => {
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
	async updateSheet(
		spreadsheetId: string,
		_sheetUpdates: sheets_v4.Schema$ValueRange[]
	): Promise<Common.GaxiosResponse<sheets_v4.Schema$BatchUpdateValuesResponse>> {
		const request: sheets_v4.Params$Resource$Spreadsheets$Values$Batchupdate = {
			spreadsheetId: spreadsheetId,
			requestBody: {
				valueInputOption: 'RAW',
			},
			auth: this._oAuth2Client,
		}
		return sheets.spreadsheets.values.batchUpdate(request)

		// const request: sheets_v4.Params$Resource$Spreadsheets$Values$Batchupdate = {
		// 	spreadsheetId: spreadsheetId,
		// 	requestBody: {
		// 		valueInputOption: 'RAW',
		// 		data: sheetUpdates,
		// 		// [{
		// 		//     range: 'A1:A1',
		// 		//     values: [[1]]
		// 		// }]
		// 	},
		// 	auth: this.auth,
		// }
		// return sheets.spreadsheets.values.batchUpdate(request)
	}

	/**
	 * Returns a list of ids of Google Spreadsheets in provided folder.
	 * If multiple folders have the same name, the first folder is selected.
	 *
	 * @param folderName Name of Google Drive folder
	 */
	async getSpreadsheetsInDriveFolder(folderName: string): Promise<string[]> {
		const drive = google.drive({ version: 'v3', auth: this._oAuth2Client })

		const fileList = await drive.files.list({
			// q: `mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents`,
			q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
			pageSize: 100,
			spaces: 'drive',
			fields: 'nextPageToken, files(*)',
		})

		// Use first hit only. We assume that that would be the correct folder.
		// If you have multiple folders with the same name, it will become un-deterministic
		if (fileList.data.files && fileList.data.files[0] && fileList.data.files[0].id) {
			const folderId = fileList.data.files[0].id
			return this.getSpreadsheetsInDriveFolderId(folderId)
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
	async getSpreadsheetsInDriveFolderId(folderId: string, nextPageToken?: string): Promise<string[]> {
		const drive = google.drive({ version: 'v3', auth: this._oAuth2Client })
		this.currentFolder = folderId

		try {
			const fileList = await drive.files.list({
				q: `mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents`,
				// q: `mimeType='application/vnd.google-apps.spreadsheet'`,
				spaces: 'drive',
				fields: 'nextPageToken, files(*)',
				pageToken: nextPageToken,
			})

			const resultDataFileIds = (fileList.data.files || [])
				.filter((file) => file.name && file.name[0] !== '_' && !file.trashed)
				.map((file) => file.id || '')

			if (fileList.data.nextPageToken) {
				const nextPageDataFileIds = await this.getSpreadsheetsInDriveFolderId(folderId, fileList.data.nextPageToken)
				return resultDataFileIds.concat(nextPageDataFileIds)
			}
			return resultDataFileIds
		} catch (error) {
			console.log('Error while fetching spreadsheets from folder', JSON.stringify(error))
			return []
		}
	}

	/**
	 * Checks if a sheet contains the 'Rundown' range.
	 * @param {string} sheetid Id of the sheet to check.
	 */
	async checkSheetIsValid(sheetid: string): Promise<boolean> {
		const spreadsheet = await sheets.spreadsheets
			.get({
				spreadsheetId: sheetid,
				auth: this._oAuth2Client,
			})
			.catch(console.error)

		if (!spreadsheet) {
			return Promise.resolve(false)
		}

		const file = await drive.files
			.get({
				fileId: sheetid,
				fields: 'parents',
				auth: this._oAuth2Client,
			})
			.catch(console.error)

		if (!file) {
			return Promise.resolve(false)
		}

		const folderId = this.currentFolder

		if (spreadsheet.data && file.data) {
			if (spreadsheet.data.sheets && file.data.parents) {
				const sheets = spreadsheet.data.sheets.map((sheet) => {
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
