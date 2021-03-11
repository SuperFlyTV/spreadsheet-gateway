import { DeviceConfigManifest, ConfigManifestEntryType } from '@sofie-automation/server-core-integration'

export const SPREADSHEET_DEVICE_CONFIG_MANIFEST: DeviceConfigManifest = {
	deviceConfig: [
		{
			id: 'folderPath',
			name: 'Drive folder name',
			type: ConfigManifestEntryType.STRING
		},
		{
			id: 'debugLogging',
			name: 'Activate Debug Logging',
			type: ConfigManifestEntryType.BOOLEAN
		}
	],
	deviceOAuthFlow: {
		credentialsHelp: 'Go to the url below and click on the "Enable the Drive API button". Then click on "Download Client configuration", save the credentials.json file and upload it here.',
		credentialsURL: 'https://developers.google.com/drive/api/v3/quickstart/nodejs'

	}
}
