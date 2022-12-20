import { SheetRundown } from './classes/Rundown'
import { IngestRundown, IngestSegment, IngestPart } from '@sofie-automation/blueprints-integration'
import { SheetSegment } from './classes/Segment'
import { SheetPart } from './classes/Part'

/** These are temorary mutation functions to convert sheet types to ingest types */
export function mutateRundown(rundown: SheetRundown): IngestRundown {
	const { segments, ...payload } = rundown
	return {
		externalId: rundown.externalId,
		name: rundown.name,
		type: 'external',
		payload: payload,
		segments: segments.map(mutateSegment),
	}
}
export function mutateSegment(segment: SheetSegment): IngestSegment {
	const { parts, ...payload } = segment
	return {
		externalId: segment.externalId,
		name: segment.name,
		rank: segment.rank,
		payload,
		parts: parts.map(mutatePart),
	}
}
export function mutatePart(part: SheetPart): IngestPart {
	return {
		externalId: part.externalId,
		name: part.name,
		rank: part.rank,
		payload: part,
	}
}
