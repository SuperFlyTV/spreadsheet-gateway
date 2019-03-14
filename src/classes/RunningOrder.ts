import { Section, SheetSection, SheetSectionDiff } from './Section'
import { diff as diffFake } from 'deep-object-diff'
import { diff, Diff } from 'deep-diff'
import { RunningOrderWatcher } from '../runningOrderWatcher';

// import { diff, addedDiff, deletedDiff, updatedDiff, detailedDiff } from 'deep-object-diff'


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
    expectedStart: string | number // unix time
    expectedEnd: string | number // unix time



    //    position: string // ex A4:Z15
}

export interface RunningOrderWithSections extends RunningOrder {
    sections: Section[]
}







export interface SheetRunningOrderDiff {
    hasChanges: boolean
    newValue?: RunningOrder

    id?: string
    name?: string
    expectedStart?: number | string
    expectedEnd?: number | string
    sections?: SheetSectionDiff[]
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
        public expectedStart: number | string,
        public expectedEnd: number | string,
        public sections: SheetSection[] = []) { }

    addSections(sections: SheetSection[]) {
        this.sections = this.sections.concat(sections)
    }

    diffTwo(otherRunningOrder?: SheetRunningOrder): SheetRunningOrderDiff {
        let runningOrderDiff: SheetRunningOrderDiff = { hasChanges: false, newValue: otherRunningOrder }
        if(!otherRunningOrder) {
            runningOrderDiff.hasChanges = true
            return runningOrderDiff
        }
        for (const key in otherRunningOrder) {
            switch (key) {
                case 'id':
                case 'name':
                case 'expectedStart':
                case 'expectedEnd':
                    runningOrderDiff[key] = this[key] !== (otherRunningOrder as any)[key] ? (otherRunningOrder as any)[key] : undefined
                    break
                case 'sections':
                    break;
                default:
                    break;
            }
        }

        let storiesSize = Math.max(this.sections.length, otherRunningOrder.sections.length)

        runningOrderDiff.sections = []
        for (let sectionIndex = 0; sectionIndex < storiesSize; sectionIndex++) {
            const existingSection = this.sections[sectionIndex]
            const newSection = otherRunningOrder.sections[sectionIndex]
            if(existingSection) {
                const storyDiff = existingSection.diff(newSection)
                runningOrderDiff.hasChanges = runningOrderDiff.hasChanges || storyDiff.hasChanges
                runningOrderDiff.sections.push(storyDiff)
            } else {
                let sectionDiff: SheetSectionDiff = { hasChanges: true, newValue: newSection }
                // TODO: technically, all the values goes from undefined to something (potentially)
                // However; Not sure if we should care. We are just going to send the "newValue" anyway
                runningOrderDiff.hasChanges = runningOrderDiff.hasChanges || sectionDiff.hasChanges
                runningOrderDiff.sections.push(sectionDiff)
            }
        }        


        // let firstSections = this.sections
        // let secondSections = otherRunningOrder.sections

        // if(this.sections.length < otherRunningOrder.sections.length) {
        //     firstSections = otherRunningOrder.sections
        //     secondSections = this.sections
        // }
        // runningOrderDiff.sections = firstSections.map((section, index) => {
        //     return section.diff(secondSections[index])
        // })

        return runningOrderDiff
    }
    diff(otherRunningOrder: SheetRunningOrder) {
        let result = diffFake(this, otherRunningOrder)
        let resultTwo = diff(this, otherRunningOrder)
        // // console.log('result', result)
        // // console.log('resultTwo', resultTwo)
        // let newThis = deepCopy<SheetRunningOrder>(this)

        // let diffCopy = diffFake(this, newThis)
        // console.log('diffCopy', diffCopy);
        // let a = newThis.updateFromDiff(result)

        // let result2 = diffFake(this, a)
        // console.log('what is result2', result2)
        // // if (resultTwo) {
        // //     this.createDiffObjects(resultTwo)
        // // }

        // let diffCopyNsiep = diffFake(this, newThis)
        // console.log('diffCopyNsiep', diffCopyNsiep);

        return this.createDiffObjects(result, resultTwo)
    }

    updateFromDiff(diff: any) {
        return mergeDeep(this, diff)
    }
    private createDiffObjects(diffObject: any, diffs?: Diff<this, SheetRunningOrder>[]) {
        let runningOrderDiff = {}
        let sectionDiffs = []
        let storyDiffs = []
        if(diffs){
            diffs.forEach(diff => {
                switch (diff.kind) {
                    case 'N': // DiffNew
                        break
                    case 'D': // DiffDeleted
                        break
                    case 'E': // DiffEdit
                        break
                    case 'A': // DiffArray
                        break;
                    default:
                        break;
                }
                if (diff.path) {
                    let tempObject: any = this
                    diff.path.forEach(pathPart => {
                        if(tempObject){
                            tempObject = tempObject[pathPart]
                        } else {
                            // does not exists
                        }
                    })
                }
            })
        }

        // let resultDiffObject = {}
        // if(diffObject){
        //     diffObject.
        // } else {
        //     // Nothing has changed
        //     return {}
        // }

    }
}
