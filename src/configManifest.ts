import { DeviceConfigManifest, JSONBlobStringify, JSONSchema } from '@sofie-automation/server-core-integration'
import * as ConfigSchema from './$schemas/options.json'
import * as ConfigSchemaSubDevice from './$schemas/devices.json'

export const SPREADSHEET_DEVICE_CONFIG_MANIFEST: DeviceConfigManifest = {
	deviceConfigSchema: JSONBlobStringify<JSONSchema>(ConfigSchema as any),

	subdeviceManifest: {
		default: {
			displayName: 'Spreadsheet',
			configSchema: JSONBlobStringify<JSONSchema>(ConfigSchemaSubDevice as any),
		},
	},
	deviceOAuthFlow: {
		credentialsHelp:
			'Go to the url below and click on the "Enable the Drive API button". Then click on "Download Client configuration", save the credentials.json file and upload it here.',
		credentialsURL: 'https://developers.google.com/drive/api/v3/quickstart/nodejs',
	},
}
