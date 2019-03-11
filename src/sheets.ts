import { google, sheets_v4 } from 'googleapis'
import { OAuth2Client } from 'googleapis-common';
const sheets = google.sheets('v4')
// async function manageSheet(auth: any, spreadsheetId: string) {
//     console.log('managing', spreadsheetId)
//     const request = {
//         // The spreadsheet to request.
//         auth,
//         spreadsheetId,

//         // The ranges to retrieve from the spreadsheet.
//         range: 'A:B',

//         // True if grid data should be returned.
//         // This parameter is ignored if a field mask was set in the request.
//         // includeGridData: true,

//     };

//     sheets.spreadsheets.values.get(request, function (err, response) {
//         if (err) {
//             console.error(err);
//             return;
//         }
//         // console.log(Object.keys(response))
//         console.log(response.data)
//         console.log(JSON.stringify(response.data))
//         // console.log(response.data.sheets[0].data[0].rowData)
//         // console.log(JSON.stringify(response.data.sheets[0].data[0].rowData))
//         // TODO: Change code below to process the `response` object:
//         // console.log(JSON.stringify(response.data, null, 2));

//     })
// }
export async function downloadSheet(auth: OAuth2Client, spreadsheetId: string) {
    console.log('managing', spreadsheetId)

    const request = {
        // The spreadsheet to request.
        auth,
        spreadsheetId,

        // The ranges to retrieve from the spreadsheet.
        range: 'Rundown', // Get all cells in Rundown sheet

        // True if grid data should be returned.
        // This parameter is ignored if a field mask was set in the request.
        // includeGridData: true,

    }
    return Promise.all([
        sheets.spreadsheets.get({
            auth,
            spreadsheetId,
            fields: 'spreadsheetId,properties.title'
        }),
        sheets.spreadsheets.values.get(request)])
        .then(([meta, values])=> {
            return {
                meta: meta.data,
                values: values.data
            }
        })

}

export interface SheetUpdate {
    value: string
    cellPosition: string
}
export function createSheetValueChange(cell: string, newValue: any): sheets_v4.Schema$ValueRange {
    return {
        range: `${cell}:${cell}`, // Maybe we don't need the `:`?
        values: [[newValue]]
    }
}

export async function updateSheet(auth: OAuth2Client, spreadsheetId: string, sheetUpdates: sheets_v4.Schema$ValueRange[]) {
    let request: sheets_v4.Params$Resource$Spreadsheets$Values$Batchupdate = {
        spreadsheetId: spreadsheetId,
        requestBody: {
            valueInputOption: 'RAW',
            data: sheetUpdates
            // [{
            //     range: 'A1:A1',
            //     values: [[1]]
            // }]
        },
        auth
    }
    sheets.spreadsheets.values.batchUpdate(request)
}
