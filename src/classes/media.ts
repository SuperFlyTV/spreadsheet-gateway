export interface MediaDict {
	[id: string]: MediaInfo
}

export interface MediaInfo {
	name: string
	path: string
	duration: string
}
