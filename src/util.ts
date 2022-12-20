import { IOutputLayer } from '@sofie-automation/blueprints-integration'

export function assertUnreachable(_unreachable: never, err: Error): Error {
	return err
}

interface ShowTime {
	hour: number
	minute: number
	second: number
	millis: number
}

/**
 * Converts a 12/24 hour date string to a ShowTime
 * @param {string} timeString Time in the form `HH:MM:SS (AM|PM)`
 */
export function showTimeFromString(timeString: string): ShowTime {
	const [time, mod] = timeString.split(' ')
	// eslint-disable-next-line prefer-const
	let [hours, mins, seconds] = time.includes('.') ? time.split('.') : time.split(':')
	let h: number
	const m = Number(mins)
	const s = Number(seconds)

	if (hours === '12') {
		hours = '00'
	}

	if (mod === 'PM') {
		h = parseInt(hours, 10) + 12
	} else {
		h = parseInt(hours, 10)
	}

	const mil = 1000

	return {
		hour: h,
		minute: m,
		second: s,
		millis: s * mil + m * 60 * mil + h * 3600 * mil,
	}
}

/**
 * Converts the start and end times to milliseconds
 * @param {string} startString Start time in the form `HH:MM:SS (AM|PM)`
 * @param {string} endString End time in the form `HH:MM:SS (AM|PM)`
 */
export function showTimesToMillis(startString: string, endString: string): [number, number] {
	const startDay = new Date()
	const endDay = new Date()

	const startTime: ShowTime = showTimeFromString(startString)
	const endTime: ShowTime = showTimeFromString(endString)

	if (startTime.millis > endTime.millis) {
		endDay.setDate(startDay.getDate() + 1)
	}

	// Assume the show is happening today
	const targetStart = new Date(
		startDay.getFullYear(),
		startDay.getMonth(),
		startDay.getDate(),
		startTime.hour,
		startTime.minute,
		startTime.second
	)
	const targetEnd = new Date(
		endDay.getFullYear(),
		endDay.getMonth(),
		endDay.getDate(),
		endTime.hour,
		endTime.minute,
		endTime.second
	)
	return [targetStart.getTime(), targetEnd.getTime()]
}

export function getLayerByName(name: string, outputLayers: IOutputLayer[]): string {
	let id = ''
	outputLayers.forEach((layer) => {
		if (layer.name === name) id = layer._id
	})

	return id
}

export function HHMMSSToMs(input: string): number | undefined {
	if (!input || input.length <= 0) {
		return
	}

	const splitted = input.split(':')
	let sum = 0

	if (splitted.length !== 3) {
		return
	}

	for (let i = 0; i < splitted.length; i++) {
		const value = parseInt(splitted[i])
		if (i === 0) {
			sum += value * 60 * 60
		} else if (i === 1) {
			sum += value * 60
		} else if (i === 2) {
			sum += value
		}
	}
	return sum * 1000
}

export function getErrorMsg(error: unknown): string {
	const e = error as any

	if (e?.response?.data?.error_description) {
		return e.response.data.error_description
	} else if (e?.response?.data?.error?.errors && e?.response?.data?.error?.errors[0]?.message) {
		return e.response.data.error.errors[0].message
	} else if (e?.code) {
		return e.code
	}

	return 'An error occured'
}

export function getError(error: unknown): string {
	const e = error as any

	if (e?.response?.data?.error) {
		return e.response.data.error
	} else if (e?.code) {
		return e.code
	}

	return 'An error occured'
}

export function checkErrorType(error: unknown, suspiciousTypes: string[]): boolean {
	const e = error as any

	if (e?.response?.data?.error) {
		if (suspiciousTypes.includes(e.response.data.error)) {
			return true
		}
	}

	if (e?.response?.data?.error?.errors) {
		for (const singleError of e.response.data.error.errors) {
			if (suspiciousTypes.includes(singleError.reason)) {
				return true
			}
		}
	}

	return false
}
