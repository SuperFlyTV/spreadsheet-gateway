// Note: This file is just an initial example of the implementation, to be removed

import * as fs from 'fs'
import * as readline from 'readline'
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

// import { RunningOrderWatcher } from './classes/RunningOrderWatcher';

// const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
const SCOPES = [
	'https://www.googleapis.com/auth/drive.readonly',
	'https://www.googleapis.com/auth/spreadsheets'
]

const TOKEN_PATH = 'token.json'

// const BASE_FOLDER_PATH = 'superflytv-running-orders'

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
	if (err) return console.log('Error loading client secret file:', err)
	getAuthClient(JSON.parse(content.toString())).then(_authClient => {
		// let watcher = new RunningOrderWatcher(_authClient)
		// watcher.addSheetsFolderToWatch('superflytv-running-orders')
		// .then(result => {
		//     console.log('added folder to watch', result)
		// })
		// .catch(e => {
		//     console.log('Error in addSheetsFolderToWatch', e)
		// })
		// watcher.on('changes:full', (values) => {
		//     console.log('What do we have here?', values)
		// })

		// runningOrder:' + roDiff.changeType, [roDiff])
		// section:' + sectionDiff.changeType, [sectionDiff])
		// story:' + storiesDiff.changeType, [storiesDiff])
		// changes:flat', [flatDiff])
		// changes:full', [runningOrderDiff])
	}).catch(console.error)
})

interface Credentials {
	installed: {
		client_id: string
		project_id: string
		auth_uri: string
		token_uri: string
		auth_provider_x509_cert_url: string
		client_secret: string
		redirect_uris: string[]
	}

}

/**
 * Get an authentication client towards Google drive on behalf of the user,
 * or prompt for login.
 *
 * @param credentials Credentials from credentials.json which you get from Google
 */
function getAuthClient (credentials: Credentials): Promise<OAuth2Client> {
	return new Promise((resolve) => {
		const { client_secret, client_id, redirect_uris } = credentials.installed
		const oAuth2Client = new google.auth.OAuth2(
			client_id, client_secret, redirect_uris[0])

		// Check if we have previously stored a token.
		fs.readFile(TOKEN_PATH, (err, token) => {
			if (err) {
				getAccessTokenPromise(oAuth2Client)
				.then(() => {
					resolve(oAuth2Client)
				}).catch(console.error)
			} else {
				oAuth2Client.setCredentials(JSON.parse(token.toString()))
				resolve(oAuth2Client)
			}
		})
	})
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 */
function getAccessTokenPromise (oAuth2Client: OAuth2Client) {
	return new Promise((resolve, reject) => {
		const authUrl = oAuth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: SCOPES
		})
		console.log('Authorize this app by visiting this url:', authUrl)
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		})
		rl.question('Enter the code from that page here: ', (code) => {
			rl.close()
			oAuth2Client.getToken(code, (err, token) => {
				if (err) {
					return reject(err)
				}
				if (!token) {
					return reject(new Error('No token received'))
				}
				oAuth2Client.setCredentials(token)
				// Store the token to disk for later program executions
				fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
					if (err) {
						return reject(err)
					}
					console.log('Token stored to', TOKEN_PATH)
				})
				resolve(oAuth2Client)
			})
		})
	})
}
