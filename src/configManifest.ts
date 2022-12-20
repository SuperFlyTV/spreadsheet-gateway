import { DeviceConfigManifest, ConfigManifestEntryType } from '@sofie-automation/server-core-integration'

export const SPREADSHEET_DEVICE_CONFIG_MANIFEST: DeviceConfigManifest = {
	deviceConfig: [
		{
			id: 'folderPath',
			name: 'Drive folder name',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'debugLogging',
			name: 'Activate Debug Logging',
			type: ConfigManifestEntryType.BOOLEAN,
		},
	],
	deviceOAuthFlow: {
		credentialsHelp: 'Upload Google Account credentials. For more instructions, visit spreadsheet-gateway repo README.',
		credentialsURL: 'https://github.com/SuperFlyTV/spreadsheet-gateway',
	},
}
