import { Story, SheetStory, SheetStoryDiff, SheetStoryDiffWithType } from './Story'
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
export interface SheetSectionDiffWithType extends hasChangeType {
    /**
     * hasChanges indicates if there was a difference in the object or not
     */
    newValue?: Section

    runningOrderId?: string
    id?: string
    rank?: number
    name?: string
    float?: boolean
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

    diffTwo(otherSection?: SheetSection): SheetSectionDiffWithType {
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
                let storyDiff = existingStory.diffTwo(story)
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
                // sectionDiff.hasChanges = sectionDiff.hasChanges || storyDiff.hasChanges
                sectionDiff.stories.push(storyDiff)
            } else {
                let storyDiff: SheetStoryDiff = { hasChanges: true, newValue: newStory }
                // TODO: technically, all the values goes from undefined to something (potentially)
                // However; Not sure if we should care. We are just going to send the "newValue" anyway
                // sectionDiff.hasChanges = sectionDiff.hasChanges || storyDiff.hasChanges
                sectionDiff.stories.push(storyDiff)
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