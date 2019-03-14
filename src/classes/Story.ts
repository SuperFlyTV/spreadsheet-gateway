import { Item, SheetItem } from './Item'

export interface Story {
   sectionId: string
   id: string // unique within the parent section
   rank: number
   name: string
   type: string //  Assume we want this
   // type: string
   float: boolean
   script: string

   items: Item[]
}


export interface SheetStoryDiff {
   hasChanges: boolean
   newValue?: SheetStory

   type?: string
   sectionId?: string
   id?: string
   rank?: number
   name?: string
   float?: boolean
   script?: string
   items?: Item[]
}

export class SheetStory implements Story {
   
   constructor(
      public type: string,
      public sectionId: string,
      public id: string, // unique within the parent section
      public rank: number,
      public name: string,
      public float: boolean,
      public script: string,
      public items: SheetItem[]=[]){}

   addItems(items: SheetItem[]) { 
      this.items = this.items.concat(items)
   }
   addItem(item: SheetItem) { 
      this.items.push(item)
   }

   diff(otherStory?: SheetStory): SheetStoryDiff {
      let storyDiff: SheetStoryDiff = { hasChanges: false, newValue: otherStory }
      if(!otherStory) {
         storyDiff.hasChanges = true
         return storyDiff
      }

      storyDiff.items = otherStory.items
      if(this.items.length !== otherStory.items.length) {
         storyDiff.hasChanges = true
      } else {
         this.items.forEach((existingItem, sectionIndex) => {
            storyDiff.hasChanges = storyDiff.hasChanges || !existingItem.equal(otherStory.items[sectionIndex])
         })
      }

      return storyDiff
   }
}
