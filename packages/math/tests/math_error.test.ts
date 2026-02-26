import { describe, expect, it, vi } from 'vitest'

import { MathError } from '../src/utils/math_error'

describe('MathError', () => {
    it('throw/assert/warn', () => {
        expect(() => MathError.throw('x')).toThrow('x')
        expect(() => MathError.assert(false, 'bad')).toThrow('bad')
        expect(() => MathError.assert(true, 'ok')).not.toThrow()

        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        MathError.warn('warn-msg')
        expect(spy).toHaveBeenCalledWith('[MathError] warn-msg')
        spy.mockRestore()
    })
})
