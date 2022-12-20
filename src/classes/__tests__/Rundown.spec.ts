import { Common, google, sheets_v4 } from 'googleapis'
import { SheetRundown } from '../Rundown'
import { SheetsManager } from '../SheetManager'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const responseMock = require('./cellValues.json') as Common.GaxiosResponse<sheets_v4.Schema$BatchGetValuesResponse>
const SHEET_NAME = 'Rundown'

describe('Rundown', () => {
	const oAuth2ClientMock = new google.auth.OAuth2()
	const sheetsManager = new SheetsManager(oAuth2ClientMock)

	describe('Rundown parsing', () => {
		it('Parse rundown', () => {
			const mainSheet = sheetsManager.extractSheet(responseMock.data.valueRanges || [], SHEET_NAME)

			const rundown = SheetRundown.fromSheetCells('spreadsheet-id', 'Rundown name', mainSheet?.values || [], [])

			expect(rundown).toBeTruthy()
		})
	})
})
