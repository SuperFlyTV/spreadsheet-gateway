import { v4 as uuidV4 } from 'uuid'
import { Section, SheetSection, SheetSectionDiffWithType } from './Section'
import { hasChangeType } from './hasChangeType'
import { SheetStory, SheetStoryDiffFlat } from './Story'
import { SheetItem } from './Item'
import { SheetUpdate, SheetsManager } from './SheetManager'

interface RundownMetaData {
	startTime: Date
	endTime: Date
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
	expectedStart: Date // unix time (when sending over-the-wire)
	expectedEnd: Date // unix time

	//    position: string // ex A4:Z15
}

export interface RunningOrderWithSections extends RunningOrder {
	sections: Section[]
}

export interface SheetRunningOrderDiffFlat extends hasChangeType {
	newValue?: RunningOrder // The full new value of the element

	id: string // If defined, has the new, edited, value of the parameter
	name?: string
	expectedStart?: Date
	expectedEnd?: Date
}
export interface SheetRunningOrderDiffWithType extends SheetRunningOrderDiffFlat, hasChangeType {
	sections: SheetSectionDiffWithType[] // Contains a list of section-diffs. If empty, no changes.
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
		public expectedStart: Date,
		public expectedEnd: Date,
		public sections: SheetSection[] = []) { }

	addSections (sections: SheetSection[]) {
		this.sections = this.sections.concat(sections)
	}
	static DiffWithTypeToFlatDiff (diffs: SheetRunningOrderDiffWithType) {
		let flatDiffRunningOrders: SheetRunningOrderDiffFlat[] = []
		let flatDiffSections: SheetSectionDiffWithType[] = []
		let flatDiffStories: SheetStoryDiffFlat[] = []

		if (diffs) {
			if (diffs.changeType !== 'Unchanged') {
				let diffObjectRunningOrder: any = { id: diffs.id, changeType: diffs.changeType }
				for (const key in diffs.newValue) {
					if (diffs.newValue.hasOwnProperty(key)) {
						const element: any = (diffs.newValue as any)[key]
						if (element && key !== 'sections') {
							diffObjectRunningOrder[key] = element
						}
					}
				}
				flatDiffRunningOrders.push(diffObjectRunningOrder)
			}
			// TODO: Parent relationship is not properly propagated
			diffs.sections.forEach(section => {
				if (section.changeType !== 'Unchanged') {
					let diffObjectSection: any = { id: section.id, changeType: section.changeType }
					for (const key in section.newValue) {
						if (section.newValue.hasOwnProperty(key)) {
							const element: any = (section.newValue as any)[key]
							if (element && key !== 'stories') {
								diffObjectSection[key] = element
							}
						}
					}
					flatDiffSections.push(diffObjectSection)
				}
				section.stories.forEach(story => {
					if (story.changeType !== 'Unchanged') {
						let diffObjectStory: any = { id: story.id, changeType: story.changeType }
						for (const key in story.newValue) {
							if (story.newValue.hasOwnProperty(key)) {
								const element: any = (story.newValue as any)[key]
								if (element && key !== 'items') {
									diffObjectStory[key] = element
								}
							}
						}
						flatDiffStories.push(diffObjectStory)
					}
				})
			})
		}

		return {
			runningOrders: flatDiffRunningOrders,
			sections: flatDiffSections,
			stories: flatDiffStories
		}
	}
	diff (otherRunningOrder?: SheetRunningOrder): SheetRunningOrderDiffWithType {
		let runningOrderDiff: SheetRunningOrderDiffWithType = { id: this.id, changeType: 'Unchanged', newValue: otherRunningOrder, sections: [] }
		if (!otherRunningOrder) {
			runningOrderDiff.changeType = 'Deleted'
			return runningOrderDiff
		}
		for (const key in otherRunningOrder) {
			switch (key) {
				case 'id':
				case 'name':
					const isDifferent = this[key] !== otherRunningOrder[key]
					if (isDifferent) {
						runningOrderDiff[key] = otherRunningOrder[key]
						runningOrderDiff.changeType = 'Edited'
					}
					break
				case 'expectedStart':
				case 'expectedEnd':
					const isDifferentTime = this[key].getTime() !== otherRunningOrder[key].getTime()
					if (isDifferentTime) {
						runningOrderDiff[key] = otherRunningOrder[key]
						runningOrderDiff.changeType = 'Edited'
					}
					break
				case 'sections':
					break
				default:
					break
			}
		}

		let sectionCache: {[sectionId: string]: SheetSection } = {}

		this.sections.forEach(section => {
			sectionCache[section.id] = section
		})
		otherRunningOrder.sections.forEach(section => {
			let existingSection = sectionCache[section.id]
			if (!existingSection) {
				runningOrderDiff.sections.push(SheetSection.newSectionDiff(section)) // new section
			} else {
				let sectionDiff = existingSection.diff(section)
				delete sectionCache[section.id]
				if (sectionDiff && sectionDiff.changeType !== 'Unchanged') {
					runningOrderDiff.sections.push(sectionDiff)
				}
			}
		})

		// The remaining is deleted
		for (const key in sectionCache) {
			if (sectionCache.hasOwnProperty(key)) {
				const element = sectionCache[key]
				runningOrderDiff.sections.push({ id: element.id, changeType: 'Deleted', stories: [] })
			}
		}
		return runningOrderDiff
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
				let rowItem: ParsedRow = { meta: { rowPosition: rowNumber, propColPosition: {} }, data: { float: 'FALSE' } }
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
				parsedRows.push(rowItem)
			}
		}
		let parsedStartTime = new Date(Date.parse(runningOrderStartTime))
		let parsedEndTime = new Date(Date.parse(runningOrderEndTime))
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
				let rowPosition = row.meta.rowPosition
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
					if (!(section.id === implicitId && section.stories.length === 0)) {
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
					story = new SheetStory(row.data.type, section.id, id, section.stories.length, row.data.name || '', row.data.float === 'TRUE', row.data.script || '')
					if (row.data.objectType) {
						const firstItem = new SheetItem(id + '_item', row.data.objectType, Number(row.data.objectTime) || 0, Number(row.data.duration) || 0, row.data.clipName || '', row.data.attributes || {}, 'TBA')
						story.addItem(firstItem)
					}
					// TODO: ID issue. We can probably do "id + `_item`, or some shit"
					// TODO: figure out how to deal with object-time
					break
			}
			if (currentSheetUpdate) {
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
			sheetManager.updateSheetWithSheetUpdates(sheetId, results.sheetUpdates)
		}
		return runningOrder
	}
}
