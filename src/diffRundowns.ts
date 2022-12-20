import { isDeepStrictEqual } from 'util'
import { SheetRundown } from './classes/Rundown'

export enum RundownChangeType {
	RundownCreate = 'rundown_create',
	RundownDelete = 'rundown_delete',
	RundownUpdate = 'rundown_update',
	SegmentCreate = 'segment_create',
	SegmentDelete = 'segment_delete',
	SegmentUpdate = 'segment_update',
	PartCreate = 'part_create',
	PartDelete = 'part_delete',
	PartUpdate = 'part_update',
}

interface RundownChangeBase {
	type: RundownChangeType
	rundownId: string
}

interface RundownChangeRundownCreate extends RundownChangeBase {
	type: RundownChangeType.RundownCreate
}

interface RundownChangeRundownDelete extends RundownChangeBase {
	type: RundownChangeType.RundownDelete
}

interface RundownChangeRundownUpdate extends RundownChangeBase {
	type: RundownChangeType.RundownUpdate
}

interface RundownChangeSegmentCreate extends RundownChangeBase {
	type: RundownChangeType.SegmentCreate
	segmentId: string
}

interface RundownChangeSegmentDelete extends RundownChangeBase {
	type: RundownChangeType.SegmentDelete
	segmentId: string
}

interface RundownChangeSegmentUpdate extends RundownChangeBase {
	type: RundownChangeType.SegmentUpdate
	segmentId: string
}

interface RundownChangePartCreate extends RundownChangeBase {
	type: RundownChangeType.PartCreate
	segmentId: string
	partId: string
}

interface RundownChangePartDelete extends RundownChangeBase {
	type: RundownChangeType.PartDelete
	segmentId: string
	partId: string
}

interface RundownChangePartUpdate extends RundownChangeBase {
	type: RundownChangeType.PartUpdate
	segmentId: string
	partId: string
}

export type RundownChange =
	| RundownChangeRundownCreate
	| RundownChangeRundownDelete
	| RundownChangeRundownUpdate
	| RundownChangeSegmentCreate
	| RundownChangeSegmentDelete
	| RundownChangeSegmentUpdate
	| RundownChangePartCreate
	| RundownChangePartDelete
	| RundownChangePartUpdate

export function diffRundowns(oldRundown: SheetRundown | null, newRundown: SheetRundown | null): RundownChange[] {
	const changes: RundownChange[] = []

	if (oldRundown === null && newRundown === null) {
		return []
	}

	if (oldRundown === null && newRundown !== null) {
		return [
			{
				type: RundownChangeType.RundownCreate,
				rundownId: newRundown.externalId,
			},
		]
	}

	if (oldRundown !== null && newRundown === null) {
		return [
			{
				type: RundownChangeType.RundownDelete,
				rundownId: oldRundown.externalId,
			},
		]
	}

	// Not possible but typescript needs some help here
	if (oldRundown === null || newRundown === null) {
		return []
	}

	if (!isDeepStrictEqual(oldRundown.serialize(), newRundown.serialize())) {
		changes.push({
			type: RundownChangeType.RundownUpdate,
			rundownId: newRundown.externalId,
		})
	}

	const rundownId = newRundown.externalId

	const deletedSegments = oldRundown.segments.filter(
		(oldSegment) =>
			newRundown.segments.find((newSegment) => newSegment.externalId === oldSegment.externalId) === undefined
	)

	for (const deletedSegment of deletedSegments) {
		changes.push({
			type: RundownChangeType.SegmentDelete,
			rundownId,
			segmentId: deletedSegment.externalId,
		})
	}

	for (const newSegment of newRundown.segments) {
		const oldSegment = oldRundown.segments.find((s) => s.externalId === newSegment.externalId)
		if (!oldSegment) {
			changes.push({
				type: RundownChangeType.SegmentCreate,
				rundownId,
				segmentId: newSegment.externalId,
			})
			continue
		}

		if (!isDeepStrictEqual(newSegment.serialize(), oldSegment.serialize())) {
			changes.push({
				type: RundownChangeType.SegmentUpdate,
				rundownId,
				segmentId: newSegment.externalId,
			})
			continue
		}

		const deletedParts = oldSegment.parts.filter(
			(oldPart) => newSegment.parts.find((newPart) => newPart.externalId === oldPart.externalId) === undefined
		)

		for (const part of deletedParts) {
			changes.push({
				type: RundownChangeType.PartDelete,
				rundownId,
				segmentId: newSegment.externalId,
				partId: part.externalId,
			})
		}

		for (const newPart of newSegment.parts) {
			const oldPart = oldSegment.parts.find((p) => p.externalId === newPart.externalId)
			if (!oldPart) {
				changes.push({
					type: RundownChangeType.PartCreate,
					rundownId,
					segmentId: newSegment.externalId,
					partId: newPart.externalId,
				})
				continue
			}

			if (!isDeepStrictEqual(newPart.serialize(), oldPart.serialize())) {
				changes.push({
					type: RundownChangeType.PartUpdate,
					rundownId,
					segmentId: newSegment.externalId,
					partId: newPart.externalId,
				})
			}
		}
	}

	return changes
}
