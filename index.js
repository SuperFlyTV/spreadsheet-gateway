const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

// If modifying these scopes, delete token.json.
// const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Drive API.
    // authorize(JSON.parse(content), listFiles);
    getAuthClient(JSON.parse(content)).then(authClient => {
        // manageSheet(authClient, '1MfdyCwGZ9iQhBCkH9zFM5oA1VLTzd-HYs_0pCxDoR2E')
        // changesInFile(authClient)
        
        // listMyFiles(authClient)
        // startPollFiles(authClient)
        addDriveFolder(authClient, 'testfolder')
        .then(folder => {
            console.log('Got this folder', folder)
        })
        // downloadFileTwo(authClient, '1MfdyCwGZ9iQhBCkH9zFM5oA1VLTzd-HYs_0pCxDoR2E', 'something.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        // downloadFileTwo(authClient, '1MfdyCwGZ9iQhBCkH9zFM5oA1VLTzd-HYs_0pCxDoR2E', 'something.pdf', 'application/pdf')
    })
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getAccessToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function getAuthClient(credentials) {
    return new Promise((resolve, reject) => {
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);

        // Check if we have previously stored a token.
        fs.readFile(TOKEN_PATH, (err, token) => {
            if (err) {
                return getAccessTokenPromise(oAuth2Client)
            }
            oAuth2Client.setCredentials(JSON.parse(token))
            resolve(oAuth2Client)
        });
    })
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessTokenPromise(oAuth2Client) {
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close()
            oAuth2Client.getToken(code, (err, token) => {
                if (err) {
                    return reject(err)
                }
                oAuth2Client.setCredentials(token)
                // Store the token to disk for later program executions
                fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                    if (err) {
                        return reject(err)
                    }
                    console.log('Token stored to', TOKEN_PATH);
                })
                resolve(oAuth2Client)
            })
        })
    })
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listFiles(auth) {
    const drive = google.drive({ version: 'v3', auth });
    drive.files.list({
        pageSize: 10,
        fields: 'nextPageToken, files(*)',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        const files = res.data.files;
        if (files.length) {
            console.log('Files:');
            files.map((file) => {
                console.log(`${file.name} (${file.id})`);
                // console.log(`${JSON.stringify(file)}`);
            });
        } else {
            console.log('No files found.');
        }
    })

    drive.files.watch({
        // fileId: '1xckYQMLBf5CkE3z65bO-cooosTLLFipzJeyjIrAOqTc',
        // fileId: '1xckYQMLBf5CkE3z65bO-cooosTLLFipzJeyjIrAOqTc',
        fileId: '1MfdyCwGZ9iQhBCkH9zFM5oA1VLTzd-HYs_0pCxDoR2E',
        // kind: "api#channel",//  "api#channel",
        resource: {
            id: 'my-channel3',//  string,
            // resourceId: '1',//  string,
            // resourceUri: '1',//  string,
            // token: 'testToken',//  string,
            // expiration: (Date.now() + 10000).toString(),//  long,
            type: 'web_hook',//  string,
            address: 'https://142.93.235.207/google',//  string,
            // payload: true,//  boolean,
            //   params: ,//  {
            //     (key): string
            //   }
        }
    }, (err, res) => {
        console.log('response from watch')
        if (err) {
            console.log('error from watch')
            console.error(err)
            console.error(err.stack)
        }
        console.log('success from watch')
        console.log(res)
    })
}

async function listMyFiles(auth) {
    return new Promise(async (resolve, reject) => {
        const drive = google.drive({ version: 'v3', auth });
        drive.files.list({
            q: "mimeType='application/vnd.google-apps.spreadsheet' and '1etvwbtJek7h9OmIN4hf8m-hwI5YiGuGm' in parents",
            // q: "name='testfolder'",
            pageSize: 10,
            spaces: 'drive',
            fields: 'nextPageToken, files(*)',
        }, (err, res) => {
            if (err) return reject(err)
            const files = res.data.files;
            if (files.length) {
                console.log('Files/Folders:');
                files.map((file) => {
                    console.log(`${file.name} (${file.id} - ${file.mimeType} - ${file.modifiedTime})`);
                    // console.log(`${Object.keys(file)}`); 
                    // kind,id,name,mimeType,starred,trashed,explicitlyTrashed,parents,
                    // spaces,version,webViewLink,iconLink,hasThumbnail,thumbnailLink,
                    // thumbnailVersion,viewedByMe,viewedByMeTime,createdTime,modifiedTime,
                    // modifiedByMeTime,modifiedByMe,owners,lastModifyingUser,shared,
                    // ownedByMe,capabilities,viewersCanCopyContent,copyRequiresWriterPermission,
                    // writersCanShare,permissions,permissionIds,quotaBytesUsed,isAppAuthorized,exportLinks
                    
                    // console.log(`${JSON.stringify(file)}`);
                });
            } else {
                console.log('No files found.');
            }
            resolve(res)
        })
    })
}

async function listFilesInFolder(folderId, auth, mimeType) {
    return new Promise(async (resolve, reject) => {
        const drive = google.drive({ version: 'v3', auth });
        let query = `'${folderId}' in parents`
        if(mimeType) {
            query = `mimeType='${mimeType}' and ${query}`
        }
        drive.files.list({
            q: query,
            // pageSize: 10,
            spaces: 'drive',
            fields: 'nextPageToken, files(*)',
        }, (err, res) => {
            if (err) return reject(err)
            const files = res.data.files;
            if (files.length) {
                console.log('Files/Folders:');
                files.map((file) => {
                    console.log(`${file.name} (${file.id} - ${file.mimeType} - ${file.modifiedTime})`);
                    // console.log(`${Object.keys(file)}`); 
                    // kind,id,name,mimeType,starred,trashed,explicitlyTrashed,parents,
                    // spaces,version,webViewLink,iconLink,hasThumbnail,thumbnailLink,
                    // thumbnailVersion,viewedByMe,viewedByMeTime,createdTime,modifiedTime,
                    // modifiedByMeTime,modifiedByMe,owners,lastModifyingUser,shared,
                    // ownedByMe,capabilities,viewersCanCopyContent,copyRequiresWriterPermission,
                    // writersCanShare,permissions,permissionIds,quotaBytesUsed,isAppAuthorized,exportLinks
                    
                    // console.log(`${JSON.stringify(file)}`);
                });
            } else {
                console.log('No files found.');
            }
            resolve(res)
        })
    })
}


async function downloadFileTwo(auth, fileId, fileName, mimeType) {
    return new Promise(async (resolve, reject) => {
        const drive = google.drive({ version: 'v3', auth });
        // var fileId = '0BwwA4oUTeiV1UVNwOHItT0xfa2M';
        const dest = fs.createWriteStream('./downloads/' + fileName);
        const res = await drive.files.export(
            { fileId, mimeType },
            { responseType: 'stream' }
        );
        res.data
            .on('end', () => {
                console.log('Done downloading document.');
                resolve();
            })
            .on('error', err => {
                console.error('Error downloading document.');
                reject(err);
            })
            .pipe(dest);
    })
}

const sheets = google.sheets('v4')
async function manageSheet(auth, spreadsheetId) {
    console.log('managing', spreadsheetId)
    const request = {
        // The spreadsheet to request.
        auth,
        spreadsheetId,  // TODO: Update placeholder value.

        // The ranges to retrieve from the spreadsheet.
        range: 'A:B',  // TODO: Update placeholder value.

        // True if grid data should be returned.
        // This parameter is ignored if a field mask was set in the request.
        // includeGridData: true,  // TODO: Update placeholder value.

    };

    sheets.spreadsheets.values.get(request, function (err, response) {
        if (err) {
            console.error(err);
            return;
        }
        // console.log(Object.keys(response))
        console.log(response.data)
        console.log(JSON.stringify(response.data))
        // console.log(response.data.sheets[0].data[0].rowData)
        // console.log(JSON.stringify(response.data.sheets[0].data[0].rowData))
        // TODO: Change code below to process the `response` object:
        // console.log(JSON.stringify(response.data, null, 2));

    })
}
// 1MfdyCwGZ9iQhBCkH9zFM5oA1VLTzd-HYs_0pCxDoR2E
let pageToken = '229982' // 229984
async function changesInFile(auth) { //, fileId, fileName, mimeType) {   
    return new Promise(async (resolve, reject) => {
        const drive = google.drive({ version: 'v3', auth });

        drive.changes.getStartPageToken({}, function (err, res) {
            if (err) { return }
            console.log('Start token:', res.data);
            // console.log('Start token:', res.startPageToken);
        });
        drive.changes.list({
            pageToken: pageToken,
            fields: '*'
        }, function (err, res) {
            if (err) { return reject(err) }

            console.log('Changes:', res.data)

            resolve(res)
        })

    })
}
async function getChanges(auth) { //, fileId, fileName, mimeType) {   
    return new Promise(async (resolve, reject) => {
        const drive = google.drive({ version: 'v3', auth });

        drive.changes.getStartPageToken({}, function (err, res) {
            if (err) { return }
            console.log('Start token:', res.data);
            // console.log('Start token:', res.startPageToken);
        });
        drive.changes.list({
            pageToken: pageToken,
            fields: '*'
        }, function (err, res) {
            if (err) { return reject(err) }

            console.log('Changes:', res.data)

            resolve(res.data)
        })

    })
}

let nsiep = {
    '1MfdyCwGZ9iQhBCkH9zFM5oA1VLTzd-HYs_0pCxDoR2E': true
}
let interval
function startPollFiles (auth) {
    interval = setInterval(() => {
        console.log('polling files')
        getChanges(auth)
        .then((changesObject) => {
            if(!changesObject) { return }
            console.log('allChanges', typeof changesObject, changesObject)
            pageToken = changesObject.newStartPageToken; // update page token
            (changesObject.changes || []).forEach(change => {
                if(change && nsiep[change.fileId]) {
                    // There was a change in one of our files.
                    if(change.removed) {
                        // file was removed
                        // removeSheet(change.fileId)ø
                        console.log('thing was deleted', change.fileId)
                        delete nsiep[change.fileId]
                    } else {
                        // file was updated
                        console.log('thing was updated', change.fileId)
                        manageSheet(auth, change.fileId)
                    }
                }
            })
        })
        .catch(error => {
            console.error(error)
        })
    }, 15000)
}
function stopPollFiles () {
    if(interval) {
        clearInterval(interval)
        interval = undefined
    }
}

async function addDriveFolder(auth, stringName) {
    return new Promise(async (resolve, reject) => {
        const drive = google.drive({ version: 'v3', auth });
        drive.files.list({
            // q: "mimeType='application/vnd.google-apps.spreadsheet' and '1etvwbtJek7h9OmIN4hf8m-hwI5YiGuGm' in parents",
            q: `mimeType='application/vnd.google-apps.folder' and name='${stringName}'`,
            pageSize: 10,
            spaces: 'drive',
            fields: 'nextPageToken, files(*)',
        }, (err, res) => {
            if (err) return reject(err)
            const files = res.data.files
            if (files.length) {
                console.log('Files/Folders:')
                files.map((file) => {
                    console.log(`${file.name} (${file.id} - ${file.mimeType} - ${file.modifiedTime})`);
                    // console.log(`${Object.keys(file)}`); 
                    // kind,id,name,mimeType,starred,trashed,explicitlyTrashed,parents,
                    // spaces,version,webViewLink,iconLink,hasThumbnail,thumbnailLink,
                    // thumbnailVersion,viewedByMe,viewedByMeTime,createdTime,modifiedTime,
                    // modifiedByMeTime,modifiedByMe,owners,lastModifyingUser,shared,
                    // ownedByMe,capabilities,viewersCanCopyContent,copyRequiresWriterPermission,
                    // writersCanShare,permissions,permissionIds,quotaBytesUsed,isAppAuthorized,exportLinks
                    
                    // console.log(`${JSON.stringify(file)}`);
                });
                resolve(files)
            } else {
                console.log('Folder not found.')
                reject(new Error('Folder not found'))
            }
        })
    })
}