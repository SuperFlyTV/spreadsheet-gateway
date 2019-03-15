import { Story, SheetStory, SheetStoryDiffWithType } from './Story'
import { hasChangeType } from './hasChangeType';
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

export interface SheetSectionDiffFlat extends hasChangeType {
    /**
     * hasChanges indicates if there was a difference in the object or not
     */
    newValue?: Section

    runningOrderId?: string
    id?: string
    rank?: number
    name?: string
    float?: boolean
}
export interface SheetSectionDiffWithType extends SheetSectionDiffFlat, hasChangeType {
    stories: SheetStoryDiffWithType[]
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

    diff(otherSection?: SheetSection): SheetSectionDiffWithType {
        let sectionDiff: SheetSectionDiffWithType = { changeType: 'Unchanged', newValue: otherSection, stories: [] }
        if(!otherSection) {
            sectionDiff.changeType = 'Deleted'
            return sectionDiff
        }
        for (const key in otherSection) {
            switch (key) {
                case 'runningOrderId':
                case 'id':
                case 'rank':
                case 'name':
                case 'float':
                    const isDifferent = this[key] !== otherSection[key]
                    if(isDifferent) {
                        sectionDiff[key] = otherSection[key]
                        sectionDiff.changeType = 'Edited'
                    }
                    break
                case 'stories':
                    // Will tackle this separately
                    break;
                default:
                    break;
            }
        }

        let storyCache: {[storyId: string]: SheetStory } = {}
        
        this.stories.forEach(story => {
            storyCache[story.id] = story
        })
        otherSection.stories.forEach(story => {
            let existingStory = storyCache[story.id]
            if(!existingStory) {
                sectionDiff.stories.push(SheetStory.newStoryDiff(story)) // new section
            } else {
                let storyDiff = existingStory.diff(story)
                delete storyCache[story.id]
                if(storyDiff && storyDiff.changeType !== 'Unchanged') {
                    sectionDiff.stories.push(storyDiff)
                }
            }
        })

        // The remaining is deleted
        for (const key in storyCache) {
            if (storyCache.hasOwnProperty(key)) {
                const element = storyCache[key]
                sectionDiff.stories.push({ id: element.id, changeType: 'Deleted'})
            }
        }

        return sectionDiff
    }

    static newSectionDiff(section: SheetSection): SheetSectionDiffWithType {
        let diff: SheetSectionDiffWithType = {
           changeType: 'New',
           id: section.id,
           newValue: section,
           stories: section.stories.map(SheetStory.newStoryDiff)
        }
        return diff
     }
 }