import { GNode } from '@ccpc/core'
import { Plane, Vec2, Vec3 } from '@ccpc/math'

/**
 * 拾取结果类型
 */
export type IPickedResult = {
    /**pick到的点*/
    point: Vec3,
    /**屏幕坐标*/
    screenPt?: Vec2,
    /**pick到的平面*/
    pickedPlane?: Plane,
    /**pick到的GNode*/
    pickedGNodes?: Array<GNode>
}
