import { describe, expect, it } from 'vitest'

import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'

describe('Mat3', () => {
    it('单位矩阵不改变点坐标', () => {
        const m = Mat3.identity()
        const p = new Vec2(3, 4)
        const r = m.transformPoint(p)
        expect(r.x).toBe(3)
        expect(r.y).toBe(4)
    })

    it('平移矩阵正确作用于点', () => {
        const m = Mat3.translation(10, -5)
        const r = m.transformPoint(new Vec2(1, 2))
        expect(r.x).toBe(11)
        expect(r.y).toBe(-3)
    })

    it('绕原点旋转 90°', () => {
        const m = Mat3.rotation(Math.PI / 2)
        const r = m.transformPoint(new Vec2(1, 0))
        expect(r.x).toBeCloseTo(0, 10)
        expect(r.y).toBeCloseTo(1, 10)
    })

    it('缩放矩阵正确作用于点', () => {
        const m = Mat3.scaling(2, 3)
        const r = m.transformPoint(new Vec2(2, 1))
        expect(r.x).toBe(4)
        expect(r.y).toBe(3)
    })

    it('右乘顺序：右侧先作用', () => {
        const m = Mat3.identity()
            .translate(10, 0)
            .rotate(Math.PI / 2)
        const r = m.transformPoint(new Vec2(1, 0))
        expect(r.x).toBeCloseTo(10, 10)
        expect(r.y).toBeCloseTo(1, 10)
    })

    it('可逆矩阵求逆后可还原', () => {
        const m = Mat3.translation(5, -2).rotate(0.3).scale(2, 3)
        const inv = m.invert()
        const p = new Vec2(7, 9)
        const r = inv.transformPoint(m.transformPoint(p))
        expect(r.x).toBeCloseTo(p.x, 9)
        expect(r.y).toBeCloseTo(p.y, 9)
        expect(m.determinant()).not.toBe(0)
    })

    it('克隆、相等与导出数组', () => {
        const m = new Mat3(
            1, 2, 3,
            4, 5, 6,
            7, 8, 9,
        )
        const c = m.clone()
        expect(c.equals(m)).toBe(true)
        expect(c.toArray()).toEqual(m.toArray())
    })

    it('左乘与右乘结果符合预期', () => {
        const t = Mat3.translation(2, 0)
        const r = Mat3.rotation(Math.PI / 2)
        const right = t.multiply(r)
        const left = t.premultiply(r)
        const p = new Vec2(1, 0)
        const pr = right.transformPoint(p)
        const pl = left.transformPoint(p)
        expect(pr.equals(pl)).toBe(false)
    })

    it('序列化与反序列化保持一致', () => {
        const m = new Mat3(
            1, 2, 3,
            4, 5, 6,
            7, 8, 9,
        )
        const dumped = m.dump()
        const restored = Mat3.load(dumped)
        expect(restored.toArray()).toEqual(m.toArray())
    })
})
