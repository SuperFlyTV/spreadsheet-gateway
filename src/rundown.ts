import { SheetRunningOrder } from './classes/RunningOrder'
import { SheetSection } from './classes/Section'
import { v1 as uuidV1 } from 'uuid'
import { SheetItem } from './classes/Item';
import { SheetStory } from './classes/Story';

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

interface RundownMetaData {
    startTime: string
    endTime: string
}

interface ParsedRow {
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
    // [key: string]: string | undefined // Can't enforce formatting here; https://github.com/Microsoft/TypeScript/issues/6579
}

export class Rundown {
    constructor(private cells: any[][], private name: string, private sheetId: string) { }
    private parseRawData(): {rows: ParsedRow[], meta: RundownMetaData}{
        let metaRow = this.cells[0] || []
        let runningOrderStartTime = metaRow[1]
        let runningOrderEndTime = metaRow[3]
        let tablesRow = this.cells[1] || []
        let tablePositions: any = {}
        let inverseTablePositions: {[key: number]: string} = {}
        tablesRow.forEach((cell, index) => {
            if(typeof cell === 'string' && cell !== '') {
                tablePositions[cell] = index
                inverseTablePositions[index] = cell
            }
        })
        let tablePositionTuples = Object.keys(tablePositions).map(key => {
            return {name: key, pos: tablePositions[key]}
        })
        let parsedRows: ParsedRow[] = []
        for(let i = 3; i < this.cells.length; i++) {
            let row = this.cells[i]
            if(row) {
                let rowItem: ParsedRow = {float: 'FALSE'}
                row.forEach((cell, index) => {
                    const attr = inverseTablePositions[index]
                    if(cell === undefined || cell === ''){ return }
                    switch(attr){
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
                            rowItem[attr] = cell
                            break;
                        case '':
                        case undefined:
                            break;
                        default:
                            if(attr.startsWith('attr: ')) {
                                if(!rowItem.attributes) {
                                    rowItem.attributes = {}
                                }
                                rowItem.attributes[attr.slice(6)] = cell
                            }
                            break
                    }
                })
                parsedRows.push(rowItem) 
            }
        }
        return {
            rows: parsedRows,
            meta: {
                startTime: runningOrderStartTime,
                endTime: runningOrderEndTime
            }
        }
    }
    private parsedRowsIntoSections(parsedRows: ParsedRow[]): SheetSection[] {
        let sections: SheetSection[] = []
        const implicitId = 'implicitFirst'
        let section = new SheetSection(this.sheetId,implicitId, 0,'Implicit First Section', false)
        let story: SheetStory | undefined
        // let items: SheetItem[] = []
        parsedRows.forEach(row => {
            switch (row.type) {
                case 'SECTION':
                    if(story) {
                        section.addStory(story)
                        story = undefined
                    }
                    if(!(section.id === implicitId && section.stories.length === 0)) {
                        sections.push(section)
                    }

                    // TODO: if there is no ID we need to update the sheet.
                    section = new SheetSection(this.sheetId, row.id || uuidV1(), sections.length, row.name || '', row.float === 'TRUE')
                    break;
                case '':
                case undefined:
                    // This is an item only, not a story even. Usually "graphics" or "video"
                    if(!story) {
                        // Then what?!
                    } else {
                        if(row.objectType){
                            story.addItem(new SheetItem(row.id || uuidV1(), row.objectType, Number(row.objectTime) || 0, Number(row.duration) || 0, row.clipName || '', row.attributes || {}, 'TBA'))
                        }
                    }
                    break;
                case 'SPLIT':
                    // Not sure what to do there
                    // For now; assuming this is a type of story
                    // break;
                default:
                    // It is likely a story
                    if(story) {
                        // We already have a story. We should add it to the section.
                        section.addStory(story)
                        story = undefined
                    }
                    const id = row.id || uuidV1()
                    story = new SheetStory(row.type, section.id, id, section.stories.length, row.name || '', row.float === 'TRUE', row.script || '')
                    if(row.objectType){
                        const firstItem = new SheetItem(id + '_item', row.objectType, Number(row.objectTime) || 0, Number(row.duration) || 0, row.clipName || '', row.attributes || {}, 'TBA')
                        story.addItem(firstItem)
                    }
                    // TODO: ID issue. We can probably do "id + `_item`, or some shit"
                    // TODO: figure out how to deal with object-time
                    break;
            }
        })
        
        if(story) {
            section.addStory(story)
        }
    
        sections.push(section)
        return sections
    }
    toRunningOrder() {
        let parsedData = this.parseRawData()

        let runningOrder = new SheetRunningOrder(this.sheetId, this.name, parsedData.meta.startTime, parsedData.meta.endTime)

        let sections = this.parsedRowsIntoSections(parsedData.rows)
        runningOrder.addSections(sections)
        console.log('runningOrder')
        console.log(runningOrder)
        console.log(JSON.stringify(runningOrder))
        // let section = new SheetSection(this.sheetId,'implicitFirst', 0,'Implicit First Section', false)
        // parsedData.rows.forEach(row => {

        // })
    }
}
