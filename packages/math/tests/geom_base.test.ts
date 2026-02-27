import { describe, expect, it } from 'vitest'

import { Circle2 } from '../src/curves/circle2'
import { Line2 } from '../src/curves/line2'
import { Vec2 } from '../src/core/vec2'

describe('GeomBase', () => {
    it('getType returns static type from constructor', () => {
        const v = new Vec2(1, 2)
        expect(v.getType()).toBe(Vec2.type)
    })

    it('isType acts as runtime type guard', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(1, 0))
        expect(line.isType(Line2)).toBe(true)
        expect(line.isType(Circle2)).toBe(false)
    })
})
