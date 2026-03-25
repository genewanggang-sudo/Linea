import { GNode } from '@ccpc/core'
import { EN_SNAP_TYPE } from '@ccpc/snap'
import { Curve2, Plane, Vec2, Vec3 } from '@ccpc/math'

/**
 * 拾取结果类型
 */
export type IPickedResult = {
    /** pick到的点 */
    point: Vec3,
    /** 屏幕坐标 */
    screenPt?: Vec2,
    /** pick到的平面 */
    pickedPlane?: Plane,
    /** pick到的GNode */
    pickedGNodes?: Array<GNode>
    /** pick到的参考对象 */
    pickedRefObject?: (Curve2 | Vec2)[]
    /** 吸附类型 */
    snapType?: EN_SNAP_TYPE
}

export enum EN_SNAP_PT_COLOR {
    POINT_ON_FACE = 0x1c1c1c,
    END_POINT = 0x3dffc5,
    POINT_ON_CURVE = 0x1c1c1c,
    MIDDLE_POINT = 0x3dffc5,
    PARALLEL_TO_AXIS = 0x3dffc5,
    INTERSECT_POINT = 0x3dffc5,
    VERTICAL_PARALLEL = 0x3dffc5,
}
