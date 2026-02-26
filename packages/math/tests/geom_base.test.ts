import { describe, expect, it } from 'vitest'

import { Vec2 } from '../src/core/vec2'

describe('GeomBase', () => {
    it('getType returns static type from constructor', () => {
        const v = new Vec2(1, 2)
        expect(v.getType()).toBe(Vec2.type)
    })
})
