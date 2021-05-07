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
		credentialsHelp: 'Go to the url below and follow the prerequisite instructions for creating a Google Cloud Platform project with the API enabled and Authorization credentials for a Desktop Application. Save the credentials.json file you get from the last step and upload it here.',
		credentialsURL: 'https://developers.google.com/drive/api/v3/quickstart/nodejs'
	}
}
