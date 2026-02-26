import { describe, expect, it } from 'vitest'

import { GeomMgr, RegisterGeom, geomMgr } from '../src/serialize/geom_mgr'
import { MathError } from '../src/utils/math_error'
import type { IDB } from '../src/serialize/dump_types'

type DummyDump = IDB & { value: number }

class DummyGeom {
    public static readonly type = '__dummy_geom_for_test__'

    public static load(data: DummyDump) {
        return { value: data.value }
    }
}

describe('GeomMgr', () => {
    it('register/load works and unknown type throws', () => {
        const mgr = new GeomMgr()
        mgr.register(DummyGeom)
        const loaded = mgr.load<{ value: number }>({ type: DummyGeom.type, value: 42 })
        expect(loaded.value).toBe(42)

        expect(() => mgr.load({ type: '__unknown__' } as IDB & Record<string, unknown>))
            .toThrow('GeomMgr.load: unknown type __unknown__')
    })

    it('RegisterGeom decorator registers ctor into global registry', () => {
        const type = '__dummy_geom_global__'
        class DummyGlobal {
            public static readonly type = type
            public static load(data: DummyDump) {
                return { value: data.value + 1 }
            }
        }

        // 覆盖 RegisterGeom 分支：直接调用装饰器函数。
        RegisterGeom(DummyGlobal)

        const loaded = geomMgr.load<{ value: number }>({ type, value: 9 })
        expect(loaded.value).toBe(10)
    })

    it('unknown type still throws MathError', () => {
        const local = new GeomMgr()
        expect(() => local.load({ type: '__missing__' } as IDB & Record<string, unknown>)).toThrow(MathError)
    })
})
