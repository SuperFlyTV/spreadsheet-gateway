import { v1 as uuidV1 } from 'uuid'

import { Section, SheetSection, SheetSectionDiffWithType } from './Section'
import { RunningOrderWatcher } from '../runningOrderWatcher'
import { hasChangeType } from './hasChangeType'
import { SheetStory } from './Story'
import { SheetItem } from './Item'
// import { diff, addedDiff, deletedDiff, updatedDiff, detailedDiff } from 'deep-object-diff'


interface RundownMetaData {
    startTime: Date
    endTime: Date
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


function deepCopy<T>(obj: T): T {
    // Handle the 3 simple types, and null or undefined
    if (null == obj || typeof obj !== 'object') {
        return obj
    }
    
    // Handle Date
    if (obj instanceof Date) {
        return (new Date(obj.getTime()) as any) as T
    }
    
    // Handle Array
    if (obj instanceof Array) {
        let arrayCopy = []
        for (var i = 0, len = obj.length; i < len; i++) {
            arrayCopy[i] = deepCopy(obj[i])
        }
        return (arrayCopy as any) as T
    }

    // Handle Object
    if (obj instanceof Object) {
        let copy: any = Object.create((obj  as any).__proto__)
        for (let attr in obj) {
            if (obj.hasOwnProperty(attr)) {
                copy[attr] = deepCopy(obj[attr])
            }
        }
        return copy as T
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}




/**
 * Simple is object check.
 * @param item
 * @returns {boolean}
 */
export function isObject(item: any) {
    return (item && typeof item === 'object' && !Array.isArray(item) && item !== null);
}

/**
 * Deep merge two objects.
 * @param target
 * @param source
 */
export function mergeDeep(target: any, source: any) {
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        });
    }
    return target;
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

export interface SheetRunningOrderDiffWithType extends hasChangeType {
    newValue?: RunningOrder // The full new value of the element

    id?: string // If defined, has the new, edited, value of the parameter
    name?: string
    expectedStart?: Date
    expectedEnd?: Date
    sections: SheetSectionDiffWithType[] // Contains a list of section-diffs. If empty, no changes.
}

export class SheetRunningOrder implements RunningOrder {
    // id: string
    // name: string // namnet på sheeten
    // expectedStart: number // unix time
    // expectedEnd: number // unix time
    // sections: Section[] = []
    constructor(
        public id: string,
        public name: string,
        public expectedStart: Date,
        public expectedEnd: Date,
        public sections: SheetSection[] = []) { }

    addSections(sections: SheetSection[]) {
        this.sections = this.sections.concat(sections)
    }
    diffWithTypeToFlatDiff(diffs: SheetRunningOrderDiffWithType) {
        let flatDiffRunningOrders: any[] = []
        let flatDiffSections: any[] = []
        let flatDiffStories: any[] = []

        if(diffs) {
            if(diffs.changeType !== 'Unchanged') {
                let diffObjectRunningOrder: any = {id: diffs.id, changeType: diffs.changeType}
                for (const key in diffs.newValue) {
                    if (diffs.newValue.hasOwnProperty(key)) {
                        const element: any = (diffs.newValue as any)[key]
                        if(element && key !== 'sections') {
                            diffObjectRunningOrder[key] = element
                        }
                    }
                }
                flatDiffRunningOrders.push(diffObjectRunningOrder)
            }
            // TODO: Parent relationship is not properly propagated
            diffs.sections.forEach(section => {
                if(section.changeType !== 'Unchanged') {
                    let diffObjectSection: any = {id: section.id, changeType: section.changeType}
                    for (const key in section.newValue) {
                        if (section.newValue.hasOwnProperty(key)) {
                            const element: any = (section.newValue as any)[key]
                            if(element && key !== 'stories') {
                                diffObjectSection[key] = element
                            }
                        }
                    }
                    flatDiffSections.push(diffObjectSection)
                }
                section.stories.forEach(story => {
                    if(story.changeType !== 'Unchanged') {
                        let diffObjectStory: any = {id: story.id, changeType: story.changeType}
                        for (const key in story.newValue) {
                            if (story.newValue.hasOwnProperty(key)) {
                                const element: any = (story.newValue as any)[key]
                                if(element && key !== 'items') {
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
    diff(otherRunningOrder?: SheetRunningOrder): SheetRunningOrderDiffWithType {
        let runningOrderDiff: SheetRunningOrderDiffWithType = { id: this.id, changeType: 'Unchanged', newValue: otherRunningOrder, sections: []}
        if(!otherRunningOrder) {
            runningOrderDiff.changeType = 'Deleted'
            return runningOrderDiff
        }
        for (const key in otherRunningOrder) {
            switch (key) {
                case 'id':
                case 'name':
                case 'expectedStart':
                case 'expectedEnd':
                    const isDifferent = this[key] !== otherRunningOrder[key]
                    if(isDifferent) {
                        runningOrderDiff[key] = otherRunningOrder[key]
                        runningOrderDiff.changeType = 'Edited'
                    }
                    break
                case 'sections':
                    break;
                default:
                    break;
            }
        }

        let sectionCache: {[sectionId: string]: SheetSection } = {}
        
        this.sections.forEach(section => {
            sectionCache[section.id] = section
        })
        otherRunningOrder.sections.forEach(section => {
            let existingSection = sectionCache[section.id]
            if(!existingSection) {
                runningOrderDiff.sections.push(SheetSection.newSectionDiff(section)) // new section
            } else {
                let sectionDiff = existingSection.diff(section)
                delete sectionCache[section.id]
                if(sectionDiff && sectionDiff.changeType !== 'Unchanged') {
                    runningOrderDiff.sections.push(sectionDiff)
                }
            }
        })

        // The remaining is deleted
        for (const key in sectionCache) {
            if (sectionCache.hasOwnProperty(key)) {
                const element = sectionCache[key]
                runningOrderDiff.sections.push({ id: element.id, changeType: 'Deleted', stories: []})
            }
        }
        return runningOrderDiff
    }
   
    private static parseRawData(cells: any[][]): {rows: ParsedRow[], meta: RundownMetaData} {
        let metaRow = cells[0] || []
        let runningOrderStartTime = metaRow[1]
        let runningOrderEndTime = metaRow[3]
        let tablesRow = cells[1] || []
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
        for(let i = 3; i < cells.length; i++) {
            let row = cells[i]
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
    private static parsedRowsIntoSections(sheetId: string, parsedRows: ParsedRow[]): SheetSection[] {
        let sections: SheetSection[] = []
        const implicitId = 'implicitFirst'
        let section = new SheetSection(sheetId,implicitId, 0,'Implicit First Section', false)
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
                    section = new SheetSection(sheetId, row.id || uuidV1(), sections.length, row.name || '', row.float === 'TRUE')
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
    static fromSheetCells(sheetId: string, name: string, cells: any[][]): SheetRunningOrder {
        let parsedData = SheetRunningOrder.parseRawData(cells)
        let runningOrder = new SheetRunningOrder(sheetId, name, parsedData.meta.startTime, parsedData.meta.endTime)
        let sections = SheetRunningOrder.parsedRowsIntoSections(sheetId, parsedData.rows)
        runningOrder.addSections(sections)
        return runningOrder
    }
}
