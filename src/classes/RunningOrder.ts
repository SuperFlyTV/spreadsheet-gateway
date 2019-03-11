import { Section } from './Section'
import { diff as diffFake } from 'deep-object-diff'
import { diff } from 'deep-diff'

// import { diff, addedDiff, deletedDiff, updatedDiff, detailedDiff } from 'deep-object-diff'

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
        public sections: Section[]=[]){}
 
    addSections(sections: Section[]) {
        this.sections = this.sections.concat(sections)
    }

    diff(otherRunningOrder: SheetRunningOrder) {
        let result = diffFake(this, otherRunningOrder)
        let resultTwo = diff(this, otherRunningOrder)
        console.log('result', result)
        console.log('resultTwo', resultTwo)
    }
}