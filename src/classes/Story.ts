import { Item, SheetItem } from './Item'
// import { hasChangeType } from './hasChangeType';

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

	constructor (
		public type: string,
		public sectionId: string,
		public id: string, // unique within the parent section
		public rank: number,
		public name: string,
		public float: boolean,
		public script: string,
		public items: SheetItem[] = []) { }

	serialize () {
		return {
			type: 				this.type,
			sectionId: 			this.sectionId,
			id: 					this.id,
			rank: 				this.rank,
			name: 				this.name,
			float: 				this.float,
			script: 				this.script,
			items: 				this.items
		}
	}
	addItems (items: SheetItem[]) {
		this.items = this.items.concat(items)
	}
	addItem (item: SheetItem) {
		this.items.push(item)
	}
}
