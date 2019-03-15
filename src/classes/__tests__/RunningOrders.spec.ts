
import { SheetRunningOrder } from '../RunningOrder'

import * as cellData from './cellValues.json'

describe('RunningOrders', () => {

    it('should exist', () => {
        let a = new SheetRunningOrder('test', 'some name', new Date(1), new Date(2))
        expect(a).toBeTruthy()
    })
    it('should correctly parse 2d cell array', () => {
        let a = SheetRunningOrder.fromSheetCells('sheetId123', 'name', (cellData as any).values)
        expect(a).toBeTruthy()

        expect(a.id).toEqual('sheetId123')
        expect(a.name).toEqual('name')
        expect(a.expectedStart).toEqual(new Date(1577685600000))
        expect(a.expectedEnd).toEqual(new Date(1577685600000 + 30*60*1000))
        expect(a.sections.length).toBe(10)
    })
    it('Diff undefined should return "Deleted" change', () => {
        let a = SheetRunningOrder.fromSheetCells('sheetId123', 'name', (cellData as any).values)
        let diff = a.diff(undefined)
        expect(diff.changeType).toEqual('Deleted')
    })
    it('Diff itself should return "Unchanged" change', () => {
        let a = SheetRunningOrder.fromSheetCells('sheetId123', 'name', (cellData as any).values)
        let diff = a.diff(a)
        expect(diff.changeType).toEqual('Unchanged')
        expect(diff.sections.length).toEqual(0)
    })
    it('Diff identical should return "Unchanged" change', () => {
        let a = SheetRunningOrder.fromSheetCells('sheetId123', 'name', (cellData as any).values)
        let b = SheetRunningOrder.fromSheetCells('sheetId123', 'name', (cellData as any).values)
        let diff = a.diff(b)
        expect(diff.changeType).toEqual('Unchanged')
        expect(diff.sections.length).toEqual(0) // Will not work right now as the id's are not set
    })
})  