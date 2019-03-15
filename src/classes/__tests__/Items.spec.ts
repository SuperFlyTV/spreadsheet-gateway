
jest.mock('deep-equal')
import deepEqual = require('deep-equal')
import { SheetItem } from '../Item'

describe('Items', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })
    it('Should use deep-equal for comparison', () => {
        let a = new SheetItem('test', 'whatever', 1, 2, 'name', {}, 'A1')
        let b = new SheetItem('test', 'whatever', 1, 2, 'name', {}, 'A1');
        (deepEqual as jest.Mock).mockReturnValue('valueFromMock')
        expect(a.equal(b)).toBe('valueFromMock')
        expect(deepEqual).toHaveBeenCalledTimes(1)
        expect(deepEqual).toHaveBeenCalledWith(a, b)
    })
})
