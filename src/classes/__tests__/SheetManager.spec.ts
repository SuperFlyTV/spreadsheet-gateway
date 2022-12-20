import { Common, google, sheets_v4 } from 'googleapis'
import { SheetsManager } from '../SheetManager'
import * as _ from 'lodash'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const responseMock = require('./cellValues.json') as Common.GaxiosResponse<sheets_v4.Schema$BatchGetValuesResponse>
const SHEET_NAME = 'Rundown'

describe('Sheet Manager', () => {
	const oAuth2ClientMock = new google.auth.OAuth2()
	const sheetsManager = new SheetsManager(oAuth2ClientMock)

	function deleteSheet(response: Common.GaxiosResponse<sheets_v4.Schema$BatchGetValuesResponse>, sheetName: string) {
		const noSheetResponseMock = _.cloneDeep(response)
		const foundSheet = sheetsManager.extractSheet(noSheetResponseMock.data.valueRanges || [], sheetName)
		noSheetResponseMock.data.valueRanges = noSheetResponseMock.data.valueRanges?.filter((vr) => vr !== foundSheet)
		return noSheetResponseMock
	}

	beforeAll(() => {
		jest
			.spyOn(sheetsManager, 'fetchSpreadsheetFromServer')
			.mockReturnValue(new Promise((resolve) => resolve(responseMock)))
	})

	it('Download Rundown', async () => {
		const validRundown = await sheetsManager.downloadRundown('spreadsheet-id', [])
		expect(validRundown).toBeTruthy()
	})

	it('Missing meta sheet', async () => {
		const noMetaResponseMock = deleteSheet(responseMock, SHEET_NAME)

		jest
			.spyOn(sheetsManager, 'fetchSpreadsheetFromServer')
			.mockReturnValue(new Promise((resolve) => resolve(noMetaResponseMock)))

		const validRundown = await sheetsManager.downloadRundown('spreadsheet-id', [])
		expect(validRundown).toBeUndefined()
	})

	it('Fetch Spreadsheet Sheets', async () => {
		const fetchedSheets = await sheetsManager.fetchSpreadsheetSheets('spreadsheet-id')
		expect(fetchedSheets).toBeTruthy()
	})

	it('Split sheets', () => {
		const splitted = sheetsManager.splitSheets(responseMock)

		expect(splitted.mainSheet).toBeTruthy()
	})

	it('Extract sheet', () => {
		const mainSheet = sheetsManager.extractSheet(responseMock.data.valueRanges || [], SHEET_NAME)

		expect(mainSheet?.range?.includes(SHEET_NAME)).toBeTruthy()
	})

	it('Extract invalid sheet', () => {
		const unknownSheet = sheetsManager.extractSheet(responseMock.data.valueRanges || [], 'unknown-sheet')
		expect(unknownSheet).toBe(undefined)
	})
})
