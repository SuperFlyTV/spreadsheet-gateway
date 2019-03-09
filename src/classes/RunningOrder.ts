import { Section } from './Section'
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
}