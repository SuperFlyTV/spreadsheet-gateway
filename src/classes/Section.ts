import { Story, SheetStory, SheetStoryDiff } from './Story'
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

export interface SheetSectionDiff {
    /**
     * hasChanges indicates if there was a difference in the object or not
     */
    hasChanges: boolean
    newValue?: Section

    runningOrderId?: string
    id?: string
    rank?: number
    name?: string
    float?: boolean
    stories?: SheetStoryDiff[]
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
        public stories: SheetStory[]=[]
    ){}
    addStory(story: SheetStory) {
        this.stories.push(story)
    }
    addStories(stories: SheetStory[]) { 
        this.stories = this.stories.concat(stories)
    }

    diff(otherSection?: SheetSection): SheetSectionDiff {
        let sectionDiff: SheetSectionDiff = { hasChanges: false, newValue: otherSection }
        if(!otherSection) {
            sectionDiff.hasChanges = true
            return sectionDiff
        }
        for (const key in otherSection) {
            switch (key) {
                case 'runningOrderId':
                case 'id':
                case 'rank':
                case 'name':
                case 'float':
                    const isDifferent = this[key] !== (otherSection as any)[key]
                    sectionDiff[key] = isDifferent ? (otherSection as any)[key] : undefined
                    sectionDiff.hasChanges = sectionDiff.hasChanges || isDifferent
                    break
                case 'stories':
                    // Will tackle this separately
                    break;
                default:
                    break;
            }
        }


        let storiesSize = Math.max(this.stories.length, otherSection.stories.length)
        sectionDiff.stories = []
        for (let sectionIndex = 0; sectionIndex < storiesSize; sectionIndex++) {
            const existingStory = this.stories[sectionIndex]
            const newStory = otherSection.stories[sectionIndex]
            if(existingStory) {
                const storyDiff = existingStory.diff(newStory)
                sectionDiff.hasChanges = sectionDiff.hasChanges || storyDiff.hasChanges
                sectionDiff.stories.push(storyDiff)
            } else {
                let storyDiff: SheetStoryDiff = { hasChanges: true, newValue: newStory }
                // TODO: technically, all the values goes from undefined to something (potentially)
                // However; Not sure if we should care. We are just going to send the "newValue" anyway
                sectionDiff.hasChanges = sectionDiff.hasChanges || storyDiff.hasChanges
                sectionDiff.stories.push(storyDiff)
            }
        }

        return sectionDiff
    }
 }