import { Section } from './Section'
import { diff as diffFake } from 'deep-object-diff'
import { diff, Diff } from 'deep-diff'

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
    expectedStart: number // unix time
    expectedEnd: number // unix time



    //    position: string // ex A4:Z15
}

export interface RunningOrderWithSections extends RunningOrder {
    sections: Section[]
}








export class SheetRunningOrder {
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
        public sections: Section[] = []) { }

    addSections(sections: Section[]) {
        this.sections = this.sections.concat(sections)
    }

    diff(otherRunningOrder: SheetRunningOrder) {
        let result = diffFake(this, otherRunningOrder)
        let resultTwo = diff(this, otherRunningOrder)
        // console.log('result', result)
        // console.log('resultTwo', resultTwo)
        let newThis = deepCopy<SheetRunningOrder>(this)

        let diffCopy = diffFake(this, newThis)
        console.log('diffCopy', diffCopy);
        let a = newThis.updateFromDiff(result)

        let result2 = diffFake(this, a)
        console.log('what is result2', result2)
        // if (resultTwo) {
        //     this.createDiffObjects(resultTwo)
        // }

        let diffCopyNsiep = diffFake(this, newThis)
        console.log('diffCopyNsiep', diffCopyNsiep);
    }

    updateFromDiff(diff: any) {
        return mergeDeep(this, diff)
    }
    private createDiffObjects(diffs: Diff<this, SheetRunningOrder>[]) {
        let runningOrderDiff = {}
        let sectionDiffs = []
        let storyDiffs = []

        diffs.forEach(diff => {
            if (diff.path) {
                if (diff.path.length === 1) {
                    // It should be on the runningOrder element

                }
            }
        })
    }
}
