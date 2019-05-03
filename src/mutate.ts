import * as _ from 'underscore'
import { SheetRunningOrder } from './classes/RunningOrder'
import { IngestRundown, IngestSegment, IngestPart } from 'tv-automation-sofie-blueprints-integration'
import { SheetSection } from './classes/Section'
import { SheetStory } from './classes/Story'

/** These are temorary mutation functions to convert sheet types to ingest types */
export function mutateRundown (rundown: SheetRunningOrder): IngestRundown {
	return {
		externalId: rundown.id,
		name: rundown.name,
		type: 'external',
		payload: _.omit(rundown, 'sections'),
		segments: _.values(rundown.sections || {}).map(mutateSegment)
	}
}
export function mutateSegment (segment: SheetSection): IngestSegment {
	return {
		externalId: segment.id,
		name: segment.name,
		rank: segment.rank,
		payload: _.omit(segment, 'stories'),
		parts: _.values(segment.stories || {}).map(mutatePart)
	}
}
export function mutatePart (part: SheetStory): IngestPart {
	return {
		externalId: part.id,
		name: part.name,
		rank: part.rank,
		payload: part
	}
}
