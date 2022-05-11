import * as fs from 'fs'
import { ProcessConfig } from './connector'
import { logger } from './logger'

export class Process {
	public certificates: Buffer[] = []

	init(processConfig: ProcessConfig): void {
		if (processConfig.unsafeSSL) {
			logger.info('Disabling NODE_TLS_REJECT_UNAUTHORIZED, be sure to ONLY DO THIS ON A LOCAL NETWORK!')
			process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
		} else {
			// var rootCas = SSLRootCAs.create()
		}
		if (processConfig.certificates.length) {
			logger.info(`Loading certificates...`)
			for (const certificate of processConfig.certificates) {
				try {
					this.certificates.push(fs.readFileSync(certificate))
					logger.info(`Using certificate "${certificate}"`)
				} catch (error) {
					logger.error(`Error loading certificate "${certificate}"`, error)
				}
			}
		}
	}
}
