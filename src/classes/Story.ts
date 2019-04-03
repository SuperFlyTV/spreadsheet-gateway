import { Item, SheetItem } from './Item'
import { hasChangeType } from './hasChangeType'

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

export interface SheetStoryDiffFlat extends hasChangeType {
	newValue?: SheetStory

	type?: string
	sectionId?: string
	id?: string
	rank?: number
	name?: string
	float?: boolean
	script?: string
}
export interface SheetStoryDiffWithType extends SheetStoryDiffFlat, hasChangeType {
	items?: Item[]
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

	addItems (items: SheetItem[]) {
		this.items = this.items.concat(items)
	}
	addItem (item: SheetItem) {
		this.items.push(item)
	}

	diff (otherStory?: SheetStory): SheetStoryDiffWithType {
		let storyDiff: SheetStoryDiffWithType = { id: this.id, changeType: 'Unchanged', newValue: otherStory }
		if (!otherStory) {
			storyDiff.changeType = 'Deleted'
			return storyDiff
		}

		for (const key in otherStory) {
			switch (key) {
				case 'type':
				case 'sectionId':
				case 'id':
				case 'rank':
				case 'name':
				case 'float':
				case 'script':
					const isDifferent = this[key] !== otherStory[key]
					if (isDifferent) {
						storyDiff[key] = otherStory[key]
						storyDiff.changeType = 'Edited'
					}
					break
				case 'items':
					// Will tackle this separately
					break
				default:
					break
			}
		}

		storyDiff.items = otherStory.items
		if (this.items.length !== otherStory.items.length) {
			storyDiff.changeType = 'Edited'
		} else {
			let hasChanges = false
			this.items.forEach((existingItem, sectionIndex) => {
				hasChanges = hasChanges || !existingItem.equal(otherStory.items[sectionIndex])
			})
			if (hasChanges) {
				storyDiff.changeType = 'Edited'
			}
		}

		return storyDiff
	}

	/**
	 * Create a SheetStoryDiffWithType that indicates a new instance
	 * of a Story.
	 *
	 * @param story Existing SheetStory item to make "New" diff from
	 */
	static newStoryDiff (story: SheetStory): SheetStoryDiffWithType {
		let diff: SheetStoryDiffWithType = {
			changeType: 'New',
			id: story.id,
			newValue: story,
			items: story.items
		}
		return diff
	}
}
