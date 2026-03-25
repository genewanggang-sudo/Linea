import { Curve2, Plane, Vec2, alg } from '@ccpc/math'

import { PtSnap } from './point_snap_result'
import { SnapSetting } from './snap_setting'
import { EN_SNAP_TYPE } from './snap_type'

/**
 * 吸附计算公共方法
 */
export class SnapUtil {
    /**
     * 点吸附
     */
    public static intersectPoint(cursorWorld: Vec2, pt: Vec2, snapType: EN_SNAP_TYPE) {
        const dis = cursorWorld.distanceTo(pt)
        const tol = SnapSetting.instance().getSnapTolInWorld()
        if (dis > tol) {
            return undefined
        }

        return new PtSnap(snapType, pt.clone(), dis)
    }

    /**
     * 曲线吸附
     */
    public static intersectCurve(
        cursorWorld: Vec2,
        curve: Curve2,
        snapType: EN_SNAP_TYPE,
        anotherPt?: Vec2,
    ) {
        const footPt = new Vec2()
        const dis = alg.D.ptToCurve2d(cursorWorld, curve, footPt)
        const tol = SnapSetting.instance().getSnapTolInWorld()
        if (dis > tol) {
            return undefined
        }

        const ptSnap = new PtSnap(snapType, footPt.clone(), dis, undefined, anotherPt)
        ptSnap.addSnappedObject(curve)
        return ptSnap
    }

    /**
     * 判断吸附结果是否有效
     */
    public static isSnapResultValid(_snapPlane: Plane | undefined, _pt: Vec2) {
        return true
    }
}
