import { SheetPart } from './Part'
// import { hasChangeType } from './hasChangeType';
export interface Segment {
	rundownId: string
	id: string // unique within the parent runningOrder
	rank: number
	name: string
	float: boolean
}

export class SheetSegment implements Segment {
	constructor (
		public rundownId: string,
		public id: string,
		public rank: number,
		public name: string,
		public float: boolean,
		public segments: { [ segmentId: string ]: SheetPart} = {}
	) {}
	serialize (): Segment {
		return {
			rundownId:		this.rundownId,
			id:					this.id,
			rank:				this.rank,
			name:				this.name,
			float:				this.float
		}
	}
	addSegment (segment: SheetPart) {
		this.segments[segment.id] = segment
	}
	addSegments (segments: SheetPart[]) {
		segments.forEach(story => this.addSegment(story))
	}
}
