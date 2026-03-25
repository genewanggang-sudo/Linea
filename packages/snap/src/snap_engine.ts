import { DebugUtil, GCurve2d, GNODE_TYPE, GPoint2d, GPolygon, GPolycurve, type GNode } from '@ccpc/core'
import { CONST, Curve2, Ln2, alg } from '@ccpc/math'

import { PtSnap } from './point_snap_result'
import { SnapCandidates } from './snap_candidates'
import type { SnapContext } from './snap_context'
import { SnapDirection } from './snap_direction'
import { SnapPoint } from './snap_point'
import { SnapSetting } from './snap_setting'
import { EN_SNAP_TYPE } from './snap_type'
import { SnapUtil } from './snap_util'

/**
 * snap引擎，根据输入信息，计算得到捕捉结果
 */
export class SnapEngine {
    /**
     * 捕捉唯一入口方法
     * @param snapContext 捕捉输入信息
     * @returns 捕捉结果候选集合
     */
    public static snap(snapContext: SnapContext): SnapCandidates {
        DebugUtil.assert(snapContext, 'snapContext不应该为空', 'wg', '2026-03-25')

        const res = new SnapCandidates()
        if (SnapSetting.instance().isSnapOff) {
            return res
        }

        const snappableGNodes = snapContext.snappableGNodes

        // 1. 吸附到最上层的拾取对象
        if (snappableGNodes[0] && snappableGNodes[0].canSnap) {
            const gnode = snappableGNodes[0]
            res.addSnapResults(this._snapGNode(gnode.getType(), snapContext, gnode))
        }

        // 2. 吸附辅助对象
        const snapRefPts = SnapPoint.snapReferencePoint(snapContext)
        res.addSnapResults(snapRefPts)

        const snapPtOnRefCurve = SnapPoint.snapReferenceCurve(snapContext)
        res.addSnapResults(snapPtOnRefCurve)

        // 3. 方向吸附
        const snapDirs = SnapDirection.snapDirection(snapContext)
        res.addSnapResults(snapDirs)

        // 4. 交点和组合吸附
        const curvesXs = SnapPoint.snapCurvesXPoint(snapContext, snappableGNodes)
        res.addSnapResults(curvesXs)

        const combinedSnaps = this._combineSnaps(
            snapContext,
            snapDirs,
            res.snapResults.filter(_ => !snapDirs.includes(_ as PtSnap)) as PtSnap[],
        )
        res.addSnapResults(combinedSnaps)

        // 5. 排序
        res.sort(snapContext.snapSort)
        if (res.snapResults.length) {
            return res
        }

        // 6. 无吸附结果时，吸附当前工作平面上的点
        const ptSnap = new PtSnap(EN_SNAP_TYPE.PointOnSnapPlane, snapContext.cursorWorld.clone(), 0)
        res.addSnapResult(ptSnap)
        res.sort(snapContext.snapSort)
        return res
    }

    private static _snapGNode(gnodeType: GNODE_TYPE, snapContext: SnapContext, originGNode: GNode): PtSnap[] {
        let res: PtSnap[] = []
        switch (gnodeType) {
            case GNODE_TYPE.GPoint2d:
                res = SnapPoint.snapGPoint(snapContext, originGNode as GPoint2d)
                break
            case GNODE_TYPE.GCurve2d:
                res = SnapPoint.snapCurveFeaturePoint(snapContext, originGNode as GCurve2d)
                break
            case GNODE_TYPE.GPolycurve:
                res = SnapPoint.snapCurveFeaturePoint(snapContext, originGNode as GPolycurve)
                break
            case GNODE_TYPE.GPolygon:
                res = SnapPoint.snapPointOnFace(snapContext, originGNode as GPolygon)
                break
            default:
                break
        }

        return res
    }

    private static _combineIntersects(snapContext: SnapContext, snapDirs: PtSnap[], snaps: PtSnap[]): PtSnap[] {
        const snapRes: PtSnap[] = []
        if (!snapDirs.length || !snaps.length) {
            return snapRes
        }

        const getSnapCurve = (tmpSnap: PtSnap): Curve2 | undefined => {
            if (tmpSnap.snappedPt && tmpSnap.snappedDir) {
                return new Ln2(tmpSnap.snappedPt, tmpSnap.snappedDir, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH])
            }

            const objs = tmpSnap.getSnappedObjects().filter(_ => _ instanceof Curve2)
            if (objs.length === 1) {
                return objs[0]
            }
            return undefined
        }

        const isCurveParallel = (c1: Curve2, c2: Curve2) => {
            return c1 instanceof Ln2 && c2 instanceof Ln2 && c1.getDirection().isParallel(c2.getDirection())
        }

        const isPerpendicularSnap = (dir: PtSnap, snapCurve: Curve2) => {
            return dir.snappedDir !== undefined &&
                snapCurve instanceof Ln2 &&
                dir.snappedDir.isPerpendicular(snapCurve.getDirection())
        }

        for (const dir of snapDirs) {
            const dirCurve = getSnapCurve(dir)
            if (!dirCurve) {
                continue
            }

            for (const snap of snaps) {
                if (dir === snap) {
                    continue
                }

                const type = snap.getSnapType()
                switch (type) {
                    case EN_SNAP_TYPE.PointOnCurve: {
                        const snappedGNodes = snap.getSnappedGNodes()
                        if (snappedGNodes.length !== 1) {
                            break
                        }
                        const intersects = SnapUtil.curveIntersectGNode(dirCurve, snappedGNodes[0])
                        for (const intersect of intersects) {
                            const res = SnapUtil.intersectPoint(
                                snapContext.cursorWorld,
                                intersect.pt,
                                type,
                            )
                            if (!res || isCurveParallel(dirCurve, intersect.c)) {
                                continue
                            }
                            if (
                                dir.getSnapType() === EN_SNAP_TYPE.VerticalToCurve &&
                                dir.snappedDir &&
                                intersect.c instanceof Ln2 &&
                                dir.snappedDir.isPerpendicular(intersect.c.getDirection())
                            ) {
                                res.setSnapType(EN_SNAP_TYPE.PerpendicularPoint)
                            }
                            res.addSnappedGNodes([...dir.getSnappedGNodes(), ...snap.getSnappedGNodes()])
                            res.addSnappedObjects([...dir.getSnappedObjects(), ...snap.getSnappedObjects()])
                            res.anotherSnapType = dir.getSnapType()
                            if (dir.snappedDir) {
                                res.snappedDir = dir.snappedDir.clone()
                            }
                            snapRes.push(res)
                        }
                        break
                    }
                    default: {
                        const snapCurve = getSnapCurve(snap)
                        if (!snapCurve || isCurveParallel(dirCurve, snapCurve)) {
                            break
                        }

                        const intersects = alg.X.curve2ds(dirCurve, snapCurve)
                        for (const intersect of intersects) {
                            const res = SnapUtil.intersectPoint(
                                snapContext.cursorWorld,
                                intersect.point,
                                type,
                            )
                            if (!res) {
                                continue
                            }

                            res.addSnappedGNodes([...dir.getSnappedGNodes(), ...snap.getSnappedGNodes()])
                            res.addSnappedObjects([...dir.getSnappedObjects(), ...snap.getSnappedObjects()])
                            res.anotherSnapType = dir.getSnapType()
                            if (dir.snappedDir) {
                                res.snappedDir = dir.snappedDir.clone()
                            }
                            if (
                                dir.getSnapType() === EN_SNAP_TYPE.VerticalToCurve &&
                                !snap.snappedDir &&
                                isPerpendicularSnap(dir, snapCurve)
                            ) {
                                res.setSnapType(EN_SNAP_TYPE.PerpendicularPoint)
                            }
                            snapRes.push(res)
                        }
                        break
                    }
                }
            }
        }

        return snapRes
    }

    /**
     * 组合捕捉结果
     */
    private static _combineSnaps(snapContext: SnapContext, snapDirs: PtSnap[], snaps: PtSnap[]): PtSnap[] {
        const snapRes: PtSnap[] = []

        // 组合吸附结果，生成交点
        snapRes.push(...this._combineIntersects(snapContext, snapDirs, snaps))

        return snapRes
    }
}
