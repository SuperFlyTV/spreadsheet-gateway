import * as _ from 'underscore'
import { SheetRundown } from './classes/Rundown'
import { IngestRundown, IngestSegment, IngestPart } from '@sofie-automation/blueprints-integration'
import { SheetSegment } from './classes/Segment'
import { SheetPart } from './classes/Part'

/** These are temorary mutation functions to convert sheet types to ingest types */
export function mutateRundown (rundown: SheetRundown): IngestRundown {
	return {
		externalId: rundown.externalId,
		name: rundown.name,
		type: 'external',
		payload: _.omit(rundown, 'segments'),
		segments: _.values(rundown.segments || {}).map(mutateSegment)
	}
}
export function mutateSegment (segment: SheetSegment): IngestSegment {
	return {
		externalId: segment.externalId,
		name: segment.name,
		rank: segment.rank,
		payload: _.omit(segment, 'parts'),
		parts: _.values(segment.parts || {}).map(mutatePart)
	}
}
export function mutatePart (part: SheetPart): IngestPart {
	return {
		externalId: part.externalId,
		name: part.name,
		rank: part.rank,
		payload: part
	}
}
