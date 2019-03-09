import { Item } from './Item'

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



export class SheetStory implements Story {
   
   constructor(
      public type: string,
      public sectionId: string,
      public id: string, // unique within the parent section
      public rank: number,
      public name: string,
      public float: boolean,
      public script: string,
      public items: Item[]=[]){}

   addItems(items: Item[]) { 
      this.items = this.items.concat(items)
   }
   addItem(item: Item) { 
      this.items.push(item)
   }
}


