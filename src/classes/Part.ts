import { Piece, SheetPiece } from './Piece'

export interface Part {
	segmentId: string
	externalId: string // unique within the parent section
	rank: number
	name: string
	type: string //  Assume we want this
	// type: string
	float: boolean
	script: string

	pieces: Piece[]
}

export class SheetPart implements Part {
	constructor(
		public type: string,
		public segmentId: string,
		public externalId: string, // unique within the parent section
		public rank: number,
		public name: string,
		public float: boolean,
		public script: string,
		public pieces: SheetPiece[] = []
	) {}

	serialize(): object {
		return {
			type: this.type,
			segmentId: this.segmentId,
			id: this.externalId,
			rank: this.rank,
			name: this.name,
			float: this.float,
			script: this.script,
			pieces: this.pieces,
		}
	}
	addPieces(piece: SheetPiece[]): void {
		this.pieces.push(...piece)
	}
	addPiece(piece: SheetPiece): void {
		this.pieces.push(piece)
	}
}
