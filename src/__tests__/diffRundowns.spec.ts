import { SheetPart } from '../classes/Part'
import { SheetSegment } from '../classes/Segment'
import { SheetRundown } from '../classes/Rundown'
import { diffRundowns, RundownChangeType } from '../diffRundowns'

function createEmptySegment(rundownId: string, externalId: string, name: string, rank: number): SheetSegment {
	return new SheetSegment(rundownId, externalId, rank, name, false, [])
}

function createSegmentWithParts(
	rundownId: string,
	externalId: string,
	name: string,
	rank: number,
	parts: SheetPart[]
): SheetSegment {
	return new SheetSegment(rundownId, externalId, rank, name, false, parts)
}

function createEmptyPart(segmentId: string, externalId: string, name: string, rank: number): SheetPart {
	return new SheetPart('test', segmentId, externalId, rank, name, false, '', [])
}

describe('Diff Rundowns', () => {
	it('Does nothing if passed null rundowns', () => {
		expect(diffRundowns(null, null)).toEqual([])
	})

	it('Identifies created Rundowns', () => {
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [])
		expect(diffRundowns(null, newRundown)).toEqual([
			{
				type: RundownChangeType.RundownCreate,
				rundownId: 'test-rundown',
			},
		])
	})

	it('Identifies deleted Rundowns', () => {
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [])
		expect(diffRundowns(oldRundown, null)).toEqual([
			{
				type: RundownChangeType.RundownDelete,
				rundownId: 'test-rundown',
			},
		])
	})

	it('Identifies changed Rundowns', () => {
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [])
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown Changed', 'v0.0', 0, 0, [])
		expect(diffRundowns(oldRundown, newRundown)).toEqual([
			{
				type: RundownChangeType.RundownUpdate,
				rundownId: 'test-rundown',
			},
		])
	})

	it('Identifies created Segments', () => {
		const oldSegments = [createEmptySegment('test-rundown', 'test-segment-3', 'Test Segment 3', 2)]
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, oldSegments)
		const newSegments = [
			createEmptySegment('test-rundown', 'test-segment-1', 'Test Segment 1', 0),
			createEmptySegment('test-rundown', 'test-segment-2', 'Test Segment 2', 1),
			createEmptySegment('test-rundown', 'test-segment-3', 'Test Segment 3', 2),
		]
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, newSegments)
		expect(diffRundowns(oldRundown, newRundown)).toEqual([
			{
				type: RundownChangeType.SegmentCreate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-1',
			},
			{
				type: RundownChangeType.SegmentCreate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
			},
		])
	})

	it('Identifies deleted Segments', () => {
		const oldSegments = [
			createEmptySegment('test-rundown', 'test-segment-1', 'Test Segment 1', 0),
			createEmptySegment('test-rundown', 'test-segment-2', 'Test Segment 2', 1),
			createEmptySegment('test-rundown', 'test-segment-3', 'Test Segment 3', 2),
		]
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, oldSegments)
		const newSegments = [createEmptySegment('test-rundown', 'test-segment-2', 'Test Segment 2', 1)]
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, newSegments)
		expect(diffRundowns(oldRundown, newRundown)).toEqual([
			{
				type: RundownChangeType.SegmentDelete,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-1',
			},
			{
				type: RundownChangeType.SegmentDelete,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-3',
			},
		])
	})

	// When a rundown_update event is sent, Segments will be re-evaluated anyway
	it('Prioritises created Rundown events over created Segment events', () => {
		const newSegments = [
			createEmptySegment('test-rundown', 'test-segment-1', 'Test Segment 1', 0),
			createEmptySegment('test-rundown', 'test-segment-2', 'Test Segment 2', 1),
			createEmptySegment('test-rundown', 'test-segment-3', 'Test Segment 3', 2),
		]
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, newSegments)
		expect(diffRundowns(null, newRundown)).toEqual([
			{
				type: RundownChangeType.RundownCreate,
				rundownId: 'test-rundown',
			},
		])
	})

	it('Identifies updated Segments', () => {
		const oldSegments = [
			createEmptySegment('test-rundown', 'test-segment-1', 'Test Segment 1', 0),
			createEmptySegment('test-rundown', 'test-segment-2', 'Test Segment 2', 1),
			createEmptySegment('test-rundown', 'test-segment-3', 'Test Segment 3', 2),
		]
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, oldSegments)
		const newSegments = [
			createEmptySegment('test-rundown', 'test-segment-1', 'Test Segment 1', 0),
			createEmptySegment('test-rundown', 'test-segment-3', 'Test Segment 3', 1),
			createEmptySegment('test-rundown', 'test-segment-2', 'Test Segment 2', 2),
		]
		const newRundowns = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, newSegments)
		expect(diffRundowns(oldRundown, newRundowns)).toEqual([
			{
				type: RundownChangeType.SegmentUpdate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-3',
			},
			{
				type: RundownChangeType.SegmentUpdate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
			},
		])
	})

	it('Identifies created Parts', () => {
		const oldPartsSegment1 = [createEmptyPart('test-segment-1', 'test-part-1', 'Test Part 1', 0)]
		const oldSegment1 = createSegmentWithParts('test-rundown', 'test-segment-1', 'Test Segment 1', 0, oldPartsSegment1)
		const oldPartsSegment2 = [createEmptyPart('test-segment-2', 'test-part-5', 'Test Part 5', 1)]
		const oldSegment2 = createSegmentWithParts('test-rundown', 'test-segment-2', 'Test Segment 2', 1, oldPartsSegment2)
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [oldSegment1, oldSegment2])
		const newPartsSegment1 = [
			createEmptyPart('test-segment-1', 'test-part-1', 'Test Part 1', 0),
			createEmptyPart('test-segment-1', 'test-part-2', 'Test Part 2', 1),
			createEmptyPart('test-segment-1', 'test-part-3', 'Test Part 3', 2),
		]
		const newSegment1 = createSegmentWithParts('test-rundown', 'test-segment-1', 'Test Segment 1', 0, newPartsSegment1)
		const newPartsSegment2 = [
			createEmptyPart('test-segment-2', 'test-part-4', 'Test Part 4', 0),
			createEmptyPart('test-segment-2', 'test-part-5', 'Test Part 5', 1),
			createEmptyPart('test-segment-2', 'test-part-6', 'Test Part 6', 2),
		]
		const newSegment2 = createSegmentWithParts('test-rundown', 'test-segment-2', 'Test Segment 2', 1, newPartsSegment2)
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [newSegment1, newSegment2])
		expect(diffRundowns(oldRundown, newRundown)).toEqual([
			{
				type: RundownChangeType.PartCreate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-1',
				partId: 'test-part-2',
			},
			{
				type: RundownChangeType.PartCreate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-1',
				partId: 'test-part-3',
			},
			{
				type: RundownChangeType.PartCreate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
				partId: 'test-part-4',
			},
			{
				type: RundownChangeType.PartCreate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
				partId: 'test-part-6',
			},
		])
	})

	it('Ientifies deleted Parts', () => {
		const oldPartsSegment1 = [
			createEmptyPart('test-segment-1', 'test-part-1', 'Test Part 1', 0),
			createEmptyPart('test-segment-1', 'test-part-2', 'Test Part 2', 1),
			createEmptyPart('test-segment-1', 'test-part-3', 'Test Part 3', 2),
		]
		const oldSegment1 = createSegmentWithParts('test-rundown', 'test-segment-1', 'Test Segment 1', 0, oldPartsSegment1)
		const oldPartsSegment2 = [
			createEmptyPart('test-segment-2', 'test-part-4', 'Test Part 4', 0),
			createEmptyPart('test-segment-2', 'test-part-5', 'Test Part 5', 1),
			createEmptyPart('test-segment-2', 'test-part-6', 'Test Part 6', 2),
		]
		const oldSegment2 = createSegmentWithParts('test-rundown', 'test-segment-2', 'Test Segment 2', 1, oldPartsSegment2)
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [oldSegment1, oldSegment2])
		const newPartsSegment1 = [createEmptyPart('test-segment-1', 'test-part-2', 'Test Part 2', 1)]
		const newSegment1 = createSegmentWithParts('test-rundown', 'test-segment-1', 'Test Segment 1', 0, newPartsSegment1)
		const newPartsSegment2: SheetPart[] = []
		const newSegment2 = createSegmentWithParts('test-rundown', 'test-segment-2', 'Test Segment 2', 1, newPartsSegment2)
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [newSegment1, newSegment2])
		expect(diffRundowns(oldRundown, newRundown)).toEqual([
			{
				type: RundownChangeType.PartDelete,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-1',
				partId: 'test-part-1',
			},
			{
				type: RundownChangeType.PartDelete,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-1',
				partId: 'test-part-3',
			},
			{
				type: RundownChangeType.PartDelete,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
				partId: 'test-part-4',
			},
			{
				type: RundownChangeType.PartDelete,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
				partId: 'test-part-5',
			},
			{
				type: RundownChangeType.PartDelete,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
				partId: 'test-part-6',
			},
		])
	})

	it('Identifies updated Parts', () => {
		const oldPartsSegment1 = [
			createEmptyPart('test-segment-1', 'test-part-1', 'Test Part 1', 0),
			createEmptyPart('test-segment-1', 'test-part-2', 'Test Part 2', 1),
			createEmptyPart('test-segment-1', 'test-part-3', 'Test Part 3', 2),
		]
		const oldSegment1 = createSegmentWithParts('test-rundown', 'test-segment-1', 'Test Segment 1', 0, oldPartsSegment1)
		const oldPartsSegment2 = [
			createEmptyPart('test-segment-2', 'test-part-4', 'Test Part 4', 0),
			createEmptyPart('test-segment-2', 'test-part-5', 'Test Part 5', 1),
			createEmptyPart('test-segment-2', 'test-part-6', 'Test Part 6', 2),
		]
		const oldSegment2 = createSegmentWithParts('test-rundown', 'test-segment-2', 'Test Segment 2', 1, oldPartsSegment2)
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [oldSegment1, oldSegment2])
		const newPartsSegment1 = [
			createEmptyPart('test-segment-1', 'test-part-1', 'Test Part 1', 0),
			createEmptyPart('test-segment-1', 'test-part-3', 'Test Part 3', 2),
			createEmptyPart('test-segment-1', 'test-part-2', 'Changed Test Part 2', 4),
		]
		const newSegment1 = createSegmentWithParts('test-rundown', 'test-segment-1', 'Test Segment 1', 0, newPartsSegment1)
		const newPartsSegment2 = [
			createEmptyPart('test-segment-2', 'test-part-4', 'Test Part 4 Changed', 0),
			createEmptyPart('test-segment-2', 'test-part-6', 'Test Part 6', 1),
			createEmptyPart('test-segment-2', 'test-part-5', 'Test Part 5', 2),
		]
		const newSegment2 = createSegmentWithParts('test-rundown', 'test-segment-2', 'Test Segment 2', 1, newPartsSegment2)
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [newSegment1, newSegment2])
		expect(diffRundowns(oldRundown, newRundown)).toEqual([
			{
				type: RundownChangeType.PartUpdate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-1',
				partId: 'test-part-2',
			},
			{
				type: RundownChangeType.PartUpdate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
				partId: 'test-part-4',
			},
			{
				type: RundownChangeType.PartUpdate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
				partId: 'test-part-6',
			},
			{
				type: RundownChangeType.PartUpdate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
				partId: 'test-part-5',
			},
		])
	})

	// When a segment_update event is sent, Parts will be re-evaluated anyway
	it('Prioritises Segment updates over Part updates', () => {
		const oldPartsSegment1 = [
			createEmptyPart('test-segment-1', 'test-part-1', 'Test Part 1', 0),
			createEmptyPart('test-segment-1', 'test-part-2', 'Test Part 2', 1),
			createEmptyPart('test-segment-1', 'test-part-3', 'Test Part 3', 2),
		]
		const oldSegment1 = createSegmentWithParts('test-rundown', 'test-segment-1', 'Test Segment 1', 0, oldPartsSegment1)
		const oldPartsSegment2 = [
			createEmptyPart('test-segment-2', 'test-part-4', 'Test Part 4', 0),
			createEmptyPart('test-segment-2', 'test-part-5', 'Test Part 5', 1),
			createEmptyPart('test-segment-2', 'test-part-6', 'Test Part 6', 2),
		]
		const oldSegment2 = createSegmentWithParts('test-rundown', 'test-segment-2', 'Test Segment 2', 1, oldPartsSegment2)
		const oldRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [oldSegment1, oldSegment2])
		const newPartsSegment1 = [
			createEmptyPart('test-segment-1', 'test-part-1', 'Test Part 1', 0),
			createEmptyPart('test-segment-1', 'test-part-3', 'Test Part 3', 2),
			createEmptyPart('test-segment-1', 'test-part-2', 'Changed Test Part 2', 4),
		]
		const newSegment1 = createSegmentWithParts('test-rundown', 'test-segment-1', 'Test Segment 1', 2, newPartsSegment1)
		const newPartsSegment2 = [
			createEmptyPart('test-segment-2', 'test-part-4', 'Test Part 4 Changed', 0),
			createEmptyPart('test-segment-2', 'test-part-6', 'Test Part 6', 1),
			createEmptyPart('test-segment-2', 'test-part-5', 'Test Part 5', 2),
		]
		const newSegment2 = createSegmentWithParts(
			'test-rundown',
			'test-segment-2',
			'Test Segment 2 Changed',
			1,
			newPartsSegment2
		)
		const newRundown = new SheetRundown('test-rundown', 'Test Rundown', 'v0.0', 0, 0, [newSegment1, newSegment2])
		expect(diffRundowns(oldRundown, newRundown)).toEqual([
			{
				type: RundownChangeType.SegmentUpdate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-1',
			},
			{
				type: RundownChangeType.SegmentUpdate,
				rundownId: 'test-rundown',
				segmentId: 'test-segment-2',
			},
		])
	})
})
