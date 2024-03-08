import fastClone = require('fast-clone')
import { ReadonlyDeep } from 'type-fest'

export function clone<T>(o: ReadonlyDeep<T> | Readonly<T> | T): T {
	// Use this instead of fast-clone directly, as this retains the type
	return fastClone(o as any)
}
