export function assertUnreachable(_unreachable: never, err: Error): Error {
	return err
}
