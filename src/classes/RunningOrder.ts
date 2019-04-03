import { v4 as uuidV4 } from 'uuid'
import { SheetSection } from './Section'
import { SheetStory } from './Story'
import { SheetItem } from './Item'
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

export interface RunningOrder {
	id: string
	name: string // namnet på sheeten
	expectedStart: number // unix time
	expectedEnd: number // unix time
}

export class SheetRunningOrder implements RunningOrder {
	// id: string
	// name: string // namnet på sheeten
	// expectedStart: number // unix time
	// expectedEnd: number // unix time
	// sections: Section[] = []
	constructor (
		public id: string,
		public name: string,
		public expectedStart: number,
		public expectedEnd: number,
		public sections: { [sectionId: string]: SheetSection } = {}
	) {}

	serialize (): RunningOrder {
		return {
			id:				this.id,
			name:			this.name,
			expectedStart:	this.expectedStart,
			expectedEnd:	this.expectedEnd
		}
	}
	addSections (sections: SheetSection[]) {
		sections.forEach(section => this.sections[section.id] = section)
	}

	private static parseRawData (cells: any[][]): {rows: ParsedRow[], meta: RundownMetaData} {
		let metaRow = cells[0] || []
		let runningOrderStartTime = metaRow[1]
		let runningOrderEndTime = metaRow[3]
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
							if (attr.startsWith('attr: ')) {
								if (!rowItem.data.attributes) {
									rowItem.data.attributes = {}
								}
								rowItem.data.attributes[attr.slice(6)] = cell
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
		let parsedStartTime = new Date(Date.parse(runningOrderStartTime)).getTime()
		let parsedEndTime = new Date(Date.parse(runningOrderEndTime)).getTime()
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

	private static parsedRowsIntoSections (sheetId: string, parsedRows: ParsedRow[]): {sections: SheetSection[], sheetUpdates: SheetUpdate[]} {
		let sections: SheetSection[] = []
		const implicitId = 'implicitFirst'
		let section = new SheetSection(sheetId,implicitId, 0,'Implicit First Section', false)
		let story: SheetStory | undefined
		let sheetUpdates: SheetUpdate[] = []

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
					if (story) {
						section.addStory(story)
						story = undefined
					}
					if (!(section.id === implicitId && _.keys(section.stories).length === 0)) {
						sections.push(section)
					}

					// TODO: if there is no ID we need to update the sheet.
					section = new SheetSection(sheetId, id, sections.length, row.data.name || '', row.data.float === 'TRUE')
					break
				case '':
				case undefined:
					// This is an item only, not a story even. Usually "graphics" or "video"
					if (!story) {
						// Then what?!
						currentSheetUpdate = undefined
					} else {
						if (row.data.objectType) {
							story.addItem(new SheetItem(id, row.data.objectType, Number(row.data.objectTime) || 0, Number(row.data.duration) || 0, row.data.clipName || '', row.data.attributes || {}, 'TBA'))
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
					if (story) {
						// We already have a story. We should add it to the section.
						section.addStory(story)
						story = undefined
					}
					story = new SheetStory(row.data.type, section.id, id, _.keys(section.stories).length, row.data.name || '', row.data.float === 'TRUE', row.data.script || '')
					if (row.data.objectType) {
						const firstItem = new SheetItem(id + '_item', row.data.objectType, Number(row.data.objectTime) || 0, Number(row.data.duration) || 0, row.data.clipName || '', row.data.attributes || {}, 'TBA')
						story.addItem(firstItem)
					}
					// TODO: ID issue. We can probably do "id + `_item`, or some shit"
					// TODO: figure out how to deal with object-time
					break
			}
			if (currentSheetUpdate) {
				// console.log('creating a new id for row', currentSheetUpdate.value)
				// console.log(row)

				sheetUpdates.push(currentSheetUpdate)
			}
		})

		if (story) {
			section.addStory(story)
		}
		sections.push(section)
		return { sections, sheetUpdates }
	}
	/**
	 * Data attributes
	 *
	 * Row 1: Meta data about the running order;
	 *  A2: Expected start
	 *  A4: Expected end
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
	static fromSheetCells (sheetId: string, name: string, cells: any[][], sheetManager?: SheetsManager): SheetRunningOrder {
		let parsedData = SheetRunningOrder.parseRawData(cells)
		let runningOrder = new SheetRunningOrder(sheetId, name, parsedData.meta.startTime, parsedData.meta.endTime)
		let results = SheetRunningOrder.parsedRowsIntoSections(sheetId, parsedData.rows)
		runningOrder.addSections(results.sections)

		if (sheetManager && results.sheetUpdates && results.sheetUpdates.length > 0) {
			sheetManager.updateSheetWithSheetUpdates(sheetId, results.sheetUpdates).catch(console.error)
		}
		return runningOrder
	}
}
