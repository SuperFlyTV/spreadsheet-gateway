export interface Piece {
	id: string
	objectType: string
	objectTime: number
	duration: number
	clipName: string
	attributes: {
		[key: string]: string
	},
	script?: string,
	transition?: string
}
export interface SheetsPiece extends Piece {
	position: string // A3:A9
}

export class SheetPiece implements Piece {
	constructor (
		public id: string,
		public objectType: string,
		public objectTime: number,
		public duration: number,
		public clipName: string,
		public attributes: {
			[key: string]: string
		},
		public position: string,
		public script?: string,
		public transition?: string
	) { }
}
