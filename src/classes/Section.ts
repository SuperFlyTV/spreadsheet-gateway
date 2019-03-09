import { Story } from './Story'
export interface Section {
   runningOrderId: string
   id: string // unique within the parent runningOrder
   rank: number
   name: string
   float: boolean

   // stories: Story[]
}
export interface SectionWithStories extends Section{
    stories: Story[]
}

export class SheetSection implements Section {
    // runningOrderId: string
    // id: string // unique within the parent runningOrder
    // rank: number
    // name: string
    // float: boolean
 
    // stories: Story[]
    constructor(
        public runningOrderId: string,
        public id: string,
        public rank: number,
        public name: string,
        public float: boolean,
        public stories: Story[]=[]
    ){}
    addStory(story: Story) {
        this.stories.push(story)
    }
    addStories(stories: Story[]) { 
        this.stories = this.stories.concat(stories)
    }
 }