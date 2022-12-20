import { v4 as uuidV4 } from 'uuid'
import { SheetSegment } from './Segment'
import { SheetPart } from './Part'
import { SheetPiece } from './Piece'
import { SheetUpdate, SheetsManager } from './SheetManager'
import * as _ from 'underscore'
import { IOutputLayer } from '@sofie-automation/blueprints-integration'

const SHEET_NAME = 'Rundown'

interface RundownMetaData {
	version: string
	startTime: number
	endTime: number
}

interface ParsedRow {
	meta: {
		rowPosition: number
		propColPosition: {
			[attrName: string]: number
		}
	}
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
		transition?: string
		attributes?: { [key: string]: string }
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
	constructor(
		public externalId: string,
		public name: string,
		public gatewayVersion: string,
		public expectedStart: number,
		public expectedEnd: number,
		public segments: SheetSegment[] = []
	) {}

	serialize(): Rundown {
		return {
			externalId: this.externalId,
			name: this.name,
			expectedStart: this.expectedStart,
			expectedEnd: this.expectedEnd,
		}
	}
	addSegments(segments: SheetSegment[]): void {
		segments.forEach((segment) => this.segments.push(segment))
	}

	/**
	 * Converts a 12/24 hour date string to a ShowTime
	 * @param {string} timeString Time in the form `HH:MM:SS (AM|PM)`
	 */
	private static showTimeFromString(timeString: string): ShowTime {
		const [time, mod] = timeString.split(' ')
		// eslint-disable-next-line prefer-const
		let [hours, mins, seconds] = time.includes('.') ? time.split('.') : time.split(':')
		let h: number
		const m = Number(mins)
		const s = Number(seconds)

		if (hours === '12') {
			hours = '00'
		}

		if (mod === 'PM') {
			h = parseInt(hours, 10) + 12
		} else {
			h = parseInt(hours, 10)
		}

		const mil = 1000

		return {
			hour: h,
			minute: m,
			second: s,
			millis: s * mil + m * 60 * mil + h * 3600 * mil,
		}
	}

	/**
	 * Converts the start and end times to milliseconds
	 * @param {string} startString Start time in the form `HH:MM:SS (AM|PM)`
	 * @param {string} endString End time in the form `HH:MM:SS (AM|PM)`
	 */
	private static showTimesToMillis(startString: string, endString: string): [number, number] {
		const startDay = new Date()
		const endDay = new Date()

		const startTime: ShowTime = this.showTimeFromString(startString)
		const endTime: ShowTime = this.showTimeFromString(endString)

		if (startTime.millis > endTime.millis) {
			endDay.setDate(startDay.getDate() + 1)
		}

		// Assume the show is happening today
		const targetStart = new Date(
			startDay.getFullYear(),
			startDay.getMonth(),
			startDay.getDate(),
			startTime.hour,
			startTime.minute,
			startTime.second
		)
		const targetEnd = new Date(
			endDay.getFullYear(),
			endDay.getMonth(),
			endDay.getDate(),
			endTime.hour,
			endTime.minute,
			endTime.second
		)
		return [targetStart.getTime(), targetEnd.getTime()]
	}

	private static getLayerByName(name: string, outputLayers: IOutputLayer[]): string {
		let id = ''
		outputLayers.forEach((layer) => {
			if (layer.name === name) id = layer._id
		})

		return id
	}

	private static parseRawData(
		cells: any[][],
		outputLayers: IOutputLayer[]
	): { rows: ParsedRow[]; meta: RundownMetaData } {
		const metaRow = cells[0] || []
		const rundownStartTime = metaRow[2]
		const rundownEndTime = metaRow[4]
		const tablesRow = cells[1] || []
		const tablePositions: any = {}
		const inverseTablePositions: { [key: number]: string } = {}
		tablesRow.forEach((cell, columnNumber) => {
			if (typeof cell === 'string' && cell !== '') {
				tablePositions[cell] = columnNumber
				inverseTablePositions[columnNumber] = cell
			}
		})
		const parsedRows: ParsedRow[] = []
		for (let rowNumber = 3; rowNumber < cells.length; rowNumber++) {
			const row = cells[rowNumber]
			if (row) {
				const rowItem: ParsedRow = {
					meta: {
						rowPosition: rowNumber,
						propColPosition: {},
					},
					data: {
						float: 'FALSE',
					},
				}
				let index = 0
				row.forEach((cell, columnNumber) => {
					const attr = inverseTablePositions[columnNumber]
					rowItem.meta.propColPosition[attr] = columnNumber
					if (cell === undefined || cell === '') {
						index++
						return
					}
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
						case 'transition':
							rowItem.data[attr] = cell
							break
						case 'screen':
							if (!rowItem.data.attributes) {
								rowItem.data.attributes = {}
							}

							rowItem.data.attributes['screen'] = this.getLayerByName(cell, outputLayers)
							break
						case '':
						case undefined:
							break
						default:
							if (attr.match(/attr\d/i)) {
								if (!rowItem.data.attributes) {
									rowItem.data.attributes = {}
								}
								if (row[index - 1]) {
									rowItem.data.attributes[String(row[index - 1]).toLowerCase()] = cell
								} else {
									rowItem.data.attributes[attr] = cell
								}
							}
							break
					}
					index++
				})

				if (
					// Only add non-empty rows:
					rowItem.data.name ||
					rowItem.data.type ||
					rowItem.data.objectType
				) {
					parsedRows.push(rowItem)
				}
			}
		}

		const [parsedStartTime, parsedEndTime] = this.showTimesToMillis(rundownStartTime, rundownEndTime)
		return {
			rows: parsedRows,
			meta: {
				version: metaRow[0].replace(/blueprint gateway /i, ''),
				startTime: parsedStartTime, // runningOrderStartTime,
				endTime: parsedEndTime, // runningOrderEndTime
			},
		}
	}

	static columnToLetter(columnOneIndexed: number): string {
		let temp: number | undefined
		let letter = ''
		while (columnOneIndexed > 0) {
			temp = (columnOneIndexed - 1) % 26
			letter = String.fromCharCode(temp + 65) + letter
			columnOneIndexed = (columnOneIndexed - temp - 1) / 26
		}
		return letter
	}

	private static parsedRowsIntoSegments(
		sheetId: string,
		parsedRows: ParsedRow[]
	): { segments: SheetSegment[]; sheetUpdates: SheetUpdate[] } {
		const segments: SheetSegment[] = []
		const implicitId = 'implicitFirst'
		let segment = new SheetSegment(sheetId, implicitId, 0, 'Implicit First Section', false)
		let part: SheetPart | undefined
		const sheetUpdates: SheetUpdate[] = []

		function timeFromRawData(time: string | undefined): number {
			if (time === undefined) {
				return 0
			}

			time = time.replace('\n', '').replace(/\s/g, '')

			let parts: string[] = []

			if (time.match(/^(\d{1,2}){1,2}([.:]\d{1,2}){0,2}$/)) {
				if (time.indexOf(':') !== -1) {
					parts = time.split(':')
				} else {
					parts = time.split('.')
				}
			} else if (time.match(/^(\d{1,2}){0,2}(\.\d{1,2}){0,2}(:(\d{1,3}))?$/)) {
				if (time.indexOf(':') !== -1) {
					const t = time.split(':')
					time = t[0].replace('.', ':')
					time += '.' + t[1]
				}
				parts = time.split(':')
			} else {
				return 0
			}

			parts = parts.reverse()

			const ml = 1000

			const multipliers: number[] = [ml, ml * 60, ml * 3600]
			let duration = 0

			for (let i = 0; i < parts.length; i++) {
				if (i === 0) {
					if (parts[i].includes('.')) {
						duration += Number(parts[i].split('.')[1])
						duration += Number(parts[i].split('.')[0]) * multipliers[i]
					} else {
						duration += Number(parts[i]) * multipliers[i]
					}
				} else {
					duration += Number(parts[i]) * multipliers[i]
				}
			}

			return duration
		}

		function isAdlib(time: string | undefined): boolean {
			if (!time) {
				return true
			}

			return false
		}

		parsedRows.forEach((row) => {
			let id = row.data.id
			let currentSheetUpdate: SheetUpdate | undefined
			if (!id) {
				id = uuidV4()
				// Update sheet with new ids
				const rowPosition = row.meta.rowPosition + 1
				const colPosition = this.columnToLetter(row.meta.propColPosition['id'] + 1)

				currentSheetUpdate = {
					value: id,
					cellPosition: colPosition + rowPosition,
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
							const attr = { ...(row.data.attributes || {}), ...{ adlib: isAdlib(row.data.objectTime).toString() } }
							part.addPiece(
								new SheetPiece(
									id,
									row.data.objectType,
									timeFromRawData(row.data.objectTime),
									timeFromRawData(row.data.duration),
									row.data.clipName || '',
									attr,
									'TBA',
									row.data.script || '',
									row.data.transition || ''
								)
							)
						} else {
							currentSheetUpdate = undefined
						}
					}
					break
				case 'SPLIT':
				// Not sure what to do there
				// For now; assuming this is a type of story
				// break;
				// eslint-disable-next-line no-fallthrough
				default:
					// It is likely a story
					if (part) {
						// We already have a story. We should add it to the section.
						segment.addPart(part)
						part = undefined
					}
					part = new SheetPart(
						row.data.type,
						segment.externalId,
						id,
						_.keys(segment.parts).length,
						row.data.name || '',
						row.data.float === 'TRUE',
						row.data.script || ''
					)
					if (row.data.objectType) {
						const attr = { ...(row.data.attributes || {}), ...{ adlib: isAdlib(row.data.objectTime).toString() } }
						const firstItem = new SheetPiece(
							id + '_item',
							row.data.objectType,
							timeFromRawData(row.data.objectTime),
							timeFromRawData(row.data.duration),
							row.data.clipName || '',
							attr,
							'TBA',
							'',
							row.data.transition || ''
						)
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
	 *  A1: Spreadsheet gateway version
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
	static fromSheetCells(
		sheetId: string,
		name: string,
		cells: any[][],
		outputLayers: IOutputLayer[],
		sheetManager?: SheetsManager
	): SheetRundown {
		const parsedData = SheetRundown.parseRawData(cells, outputLayers)
		const rundown = new SheetRundown(
			sheetId,
			name,
			parsedData.meta.version,
			parsedData.meta.startTime,
			parsedData.meta.endTime
		)
		const results = SheetRundown.parsedRowsIntoSegments(sheetId, parsedData.rows)
		rundown.addSegments(results.segments)

		if (sheetManager && results.sheetUpdates && results.sheetUpdates.length > 0) {
			sheetManager.updateSheetWithSheetUpdates(sheetId, SHEET_NAME, results.sheetUpdates).catch(console.error)
		}
		return rundown
	}
}
