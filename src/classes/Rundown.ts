import { v4 as uuidV4 } from 'uuid'
import { SheetSegment } from './Segment'
import { SheetPart } from './Part'
import { SheetPiece } from './Piece'
import { SheetUpdate, SheetsManager } from './SheetManager'
import * as _ from 'underscore'

interface RundownMetaData {
	startTime: number
	endTime: number
}

interface ParsedRow {
	meta: {
		rowPosition: number,
		propColPosition: {
			[attrName: string]: number
		}
	},
	data: {
		id?: string
		name?: string
		type?: string
		float: string
		script?: string
		objectType?: string
		objectTime?: string
		duration?: string
		clipName?: string
		feedback?: string
		attributes?: {[key: string]: string}
	}
}

interface ShowTime {
	hour: number
	minute: number
	second: number
	millis: number
}

export interface Rundown {
	externalId: string
	name: string // namnet på sheeten
	expectedStart: number // unix time
	expectedEnd: number // unix time
}

export class SheetRundown implements Rundown {
	// id: string
	// name: string // namnet på sheeten
	// expectedStart: number // unix time
	// expectedEnd: number // unix time
	// sections: Section[] = []
	constructor (
		public externalId: string,
		public name: string,
		public expectedStart: number,
		public expectedEnd: number,
		public segments: SheetSegment[] = []
	) {}

	serialize (): Rundown {
		return {
			externalId:				this.externalId,
			name:			this.name,
			expectedStart:	this.expectedStart,
			expectedEnd:	this.expectedEnd
		}
	}
	addSegments (segments: SheetSegment[]) {
		segments.forEach(segment => this.segments.push(segment))
	}

	/**
	 * Converts a 12/24 hour date string to a ShowTime
	 * @param {string} timeString Time in the form `HH:MM:SS (AM|PM)`
	 */
	private static showTimeFromString (timeString: string): ShowTime {
		let [time, mod] = timeString.split(' ')
		let [hours, mins, seconds] = time.split(':')
		let h: number
		let m: number = Number(mins)
		let s: number = Number(seconds)

		if (hours === '12') {
			hours = '00'
		}

		if (mod === 'PM') {
			h = parseInt(hours, 10) + 12
		} else {
			h = parseInt(hours, 10)
		}

		let mil = 1000

		return {
			hour: h,
			minute: m,
			second: s,
			millis: (s * mil) + (m * 60 * mil) + (h * 3600 * mil)
		}
	}

	/**
	 * Converts the start and end times to milliseconds
	 * @param {string} startString Start time in the form `HH:MM:SS (AM|PM)`
	 * @param {string} endString End time in the form `HH:MM:SS (AM|PM)`
	 */
	private static showTimesToMillis (startString: string, endString: string): [number, number] {
		let startDay = new Date()
		let endDay = new Date()

		let startTime: ShowTime
		let endTime: ShowTime

		startTime = this.showTimeFromString(startString)
		endTime = this.showTimeFromString(endString)

		if (startTime.millis > endTime.millis) {
			endDay.setDate(startDay.getDate() + 1)
		}

		// Assume the show is happening today
		let targetStart = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), startTime.hour, startTime.minute, startTime.second)
		let targetEnd = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), endTime.hour, endTime.minute, endTime.second)
		return [
			targetStart.getTime(),
			targetEnd.getTime()
		]
	}

	private static parseRawData (cells: any[][]): {rows: ParsedRow[], meta: RundownMetaData} {
		let metaRow = cells[0] || []
		let rundownStartTime = metaRow[2]
		let rundownEndTime = metaRow[4]
		let tablesRow = cells[1] || []
		let tablePositions: any = {}
		let inverseTablePositions: {[key: number]: string} = {}
		tablesRow.forEach((cell, columnNumber) => {
			if (typeof cell === 'string' && cell !== '') {
				tablePositions[cell] = columnNumber
				inverseTablePositions[columnNumber] = cell
			}
		})
		let parsedRows: ParsedRow[] = []
		for (let rowNumber = 3; rowNumber < cells.length; rowNumber++) {

			let row = cells[rowNumber]
			if (row) {
				let rowItem: ParsedRow = {
					meta: {
						rowPosition: rowNumber,
						propColPosition: {}
					},
					data: {
						float: 'FALSE'
					}
				}
				row.forEach((cell, columnNumber) => {
					const attr = inverseTablePositions[columnNumber]
					rowItem.meta.propColPosition[attr] = columnNumber
					if (cell === undefined || cell === '') { return }
					switch (attr) {
						case 'id':
						case 'name':
						case 'type':
						case 'float':
						case 'script':
						case 'objectType':
						case 'objectTime':
						case 'duration':
						case 'clipName':
						case 'feedback':
							rowItem.data[attr] = cell
							break
						case '':
						case undefined:
							break
						default:
							if (attr.startsWith('attr')) {
								if (!rowItem.data.attributes) {
									rowItem.data.attributes = {}
								}
								rowItem.data.attributes[attr] = cell
							}
							break
					}
				})

				if (// Only add non-empty rows:
					rowItem.data.name ||
					rowItem.data.type ||
					rowItem.data.objectType
				) {
					parsedRows.push(rowItem)
				}

			}
		}

		let [parsedStartTime, parsedEndTime] = this.showTimesToMillis(rundownStartTime, rundownEndTime)
		return {
			rows: parsedRows,
			meta: {
				startTime: parsedStartTime, // runningOrderStartTime,
				endTime: parsedEndTime // runningOrderEndTime
			}
		}
	}

	static columnToLetter (columnOneIndexed: number): string {
		let temp: number | undefined
		let letter = ''
		while (columnOneIndexed > 0) {
			temp = (columnOneIndexed - 1) % 26
			letter = String.fromCharCode(temp + 65) + letter
			columnOneIndexed = (columnOneIndexed - temp - 1) / 26
		}
		return letter
	}

	private static parsedRowsIntoSegments (sheetId: string, parsedRows: ParsedRow[]): {segments: SheetSegment[], sheetUpdates: SheetUpdate[]} {
		let segments: SheetSegment[] = []
		const implicitId = 'implicitFirst'
		let segment = new SheetSegment(sheetId,implicitId, 0,'Implicit First Section', false)
		let part: SheetPart | undefined
		let sheetUpdates: SheetUpdate[] = []

		function timeFromRawData (time: string | undefined): number {
			if (time === undefined) {
				return 0
			}

			let ml = 1000

			let parts = time.split('.')

			if (parts.length < 3) {
				return 0
			}

			let millis: number = 0
			let seconds: number = 0

			if (parts[2].includes('.')) {
				millis = Number(parts[2].split('.')[1])
				seconds = Number(parts[2].split('.')[0])
			} else {
				millis = 0
				seconds = Number(parts[2])
			}

			return millis + (seconds * ml) + (Number(parts[1]) * 60 * ml) + (Number(parts[0]) * 3600 * ml)
		}

		function isAdlib (time: string | undefined): boolean {
			if (!time) {
				return true
			}

			return false
		}

		parsedRows.forEach(row => {
			let id = row.data.id
			let currentSheetUpdate: SheetUpdate | undefined
			if (!id) {
				id = uuidV4()
				// Update sheet with new ids
				let rowPosition = row.meta.rowPosition + 1
				let colPosition = this.columnToLetter(row.meta.propColPosition['id'] + 1)

				currentSheetUpdate = {
					value: id,
					cellPosition: colPosition + rowPosition
				}
			}
			switch (row.data.type) {
				case 'SECTION':
					if (part) {
						segment.addPart(part)
						part = undefined
					}
					if (!(segment.externalId === implicitId && _.keys(segment.parts).length === 0)) {
						segments.push(segment)
					}

					// TODO: if there is no ID we need to update the sheet.
					segment = new SheetSegment(sheetId, id, segments.length, row.data.name || '', row.data.float === 'TRUE')
					break
				case '':
				case undefined:
					// This is an item only, not a story even. Usually "graphics" or "video"
					if (!part) {
						// Then what?!
						currentSheetUpdate = undefined
					} else {
						if (row.data.objectType) {
							let attr = { ...row.data.attributes || {}, ...{ adlib: isAdlib(row.data.objectTime).toString() } }
							part.addPiece(new SheetPiece(id, row.data.objectType, timeFromRawData(row.data.objectTime), timeFromRawData(row.data.duration), row.data.clipName || '', attr, 'TBA', row.data.script || ''))
						} else {
							currentSheetUpdate = undefined
						}
					}
					break
				case 'SPLIT':
					// Not sure what to do there
					// For now; assuming this is a type of story
					// break;
				default:
					// It is likely a story
					if (part) {
						// We already have a story. We should add it to the section.
						segment.addPart(part)
						part = undefined
					}
					part = new SheetPart(row.data.type, segment.externalId, id, _.keys(segment.parts).length, row.data.name || '', row.data.float === 'TRUE', row.data.script || '')
					if (row.data.objectType) {
						let attr = { ...row.data.attributes || {}, ...{ adlib: isAdlib(row.data.objectTime).toString() } }
						const firstItem = new SheetPiece(id + '_item', row.data.objectType, timeFromRawData(row.data.objectTime), timeFromRawData(row.data.duration), row.data.clipName || '', attr, 'TBA')
						part.addPiece(firstItem)
					}
					// TODO: ID issue. We can probably do "id + `_item`, or some shit"
					break
			}
			if (currentSheetUpdate) {
				// console.log('creating a new id for row', currentSheetUpdate.value)
				// console.log(row)

				sheetUpdates.push(currentSheetUpdate)
			}
		})

		if (part) {
			segment.addPart(part)
		}
		segments.push(segment)
		return { segments: segments, sheetUpdates }
	}
	/**
	 * Data attributes
	 *
	 * Row 1: Meta data about the running order;
	 *  C1: Expected start
	 *  E1: Expected end
	 * Row 2: table names
	 *  Should have one of each of id, name, type, float, script, objectType, objectTime, , duration, clipName, feedback
	 *  Can have 0 to N of "attr: X" Where x can be any alphanumerical value eg. "attr: name"
	 * Row 3: Human readable information. Ignored
	 * Row 4: Start of row-items. Normally Row 4 will be a SECTION. If not a SECTION, a "section 1" is assumed.
	 * All following rows is one of the possible row types.
	 */

	 /**
	  *
	  * @param sheetId Id of the sheet
	  * @param name Name of the sheet (often the title)
	  * @param cells Cells of the sheet
	  * @param sheetManager Optional; Will be used to update the sheet if changes, such as ID-updates, needs to be done.
	  */
	static fromSheetCells (sheetId: string, name: string, cells: any[][], sheetManager?: SheetsManager): SheetRundown {
		let parsedData = SheetRundown.parseRawData(cells)
		let rundown = new SheetRundown(sheetId, name, parsedData.meta.startTime, parsedData.meta.endTime)
		let results = SheetRundown.parsedRowsIntoSegments(sheetId, parsedData.rows)
		rundown.addSegments(results.segments)

		if (sheetManager && results.sheetUpdates && results.sheetUpdates.length > 0) {
			sheetManager.updateSheetWithSheetUpdates(sheetId, 'Rundown', results.sheetUpdates).catch(console.error)
		}
		return rundown
	}
}
