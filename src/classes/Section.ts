import { SheetStory } from './Story'
// import { hasChangeType } from './hasChangeType';
export interface Section {
	runningOrderId: string
	id: string // unique within the parent runningOrder
	rank: number
	name: string
	float: boolean

   // stories: Story[]
}

export class SheetSection implements Section {
	constructor (
		public runningOrderId: string,
		public id: string,
		public rank: number,
		public name: string,
		public float: boolean,
		public stories: { [ storyId: string ]: SheetStory} = {}
	) {}
	serialize (): Section {
		return {
			runningOrderId:		this.runningOrderId,
			id:					this.id,
			rank:				this.rank,
			name:				this.name,
			float:				this.float
		}
	}
	addStory (story: SheetStory) {
		this.stories[story.id] = story
	}
	addStories (stories: SheetStory[]) {
		stories.forEach(story => this.addStory(story))
	}
}
