import { CONST, Ln2, Vec2 } from '@ccpc/math'

import type { SnapContext } from './snap_context'
import { EN_SNAP_HELP_OBJ } from './snap_context'
import type { PtSnap } from './point_snap_result'
import { EN_XY, SnapSetting } from './snap_setting'
import { EN_SNAP_TYPE } from './snap_type'
import { SnapUtil } from './snap_util'

/**
 * 方向捕捉
 */
export class SnapDirection {
    public static snapDirection(snapContext: SnapContext): PtSnap[] {
        const res: PtSnap[] = []

        const extensionPt = this.snapExtensionPoint(snapContext)
        if (extensionPt.length > 0) {
            res.push(...extensionPt)
        }

        const ptsOnHelperDir = this.snapHelperDirections(snapContext)
        if (ptsOnHelperDir.length > 0) {
            res.push(...ptsOnHelperDir)
        }

        const ptsOnVerticalDir = this.snapVerticalDir(snapContext)
        if (ptsOnVerticalDir.length > 0) {
            res.push(...ptsOnVerticalDir)
        }

        const ptsParallelToAxis = this.snapPointParallelToAxis(snapContext)
        if (ptsParallelToAxis.length > 0) {
            res.push(...ptsParallelToAxis)
        }

        const lastLineParallelToAxis = this.snapLastLineDir(snapContext)
        if (lastLineParallelToAxis.length > 0) {
            res.push(...lastLineParallelToAxis)
        }

        return res
    }

    /**
     * 捕捉过上一个点的水平/竖直方向
     */
    public static snapPointParallelToAxis(snapContext: SnapContext): PtSnap[] {
        const res: PtSnap[] = []
        if (!snapContext.previousPoint) {
            return res
        }

        if (SnapSetting.instance().getCanSnapParallelToAxis(EN_XY.X)) {
            const lineParallelToX = new Ln2(
                snapContext.previousPoint,
                Vec2.X(),
                [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH],
            )
            const ptSnap = SnapUtil.intersectCurve(
                snapContext.cursorWorld,
                lineParallelToX,
                EN_SNAP_TYPE.ParallelToX,
                snapContext.previousPoint,
            )
            if (ptSnap) {
                ptSnap.snappedDir = Vec2.X()
                return [ptSnap]
            }
        }

        if (SnapSetting.instance().getCanSnapParallelToAxis(EN_XY.Y)) {
            const lineParallelToY = new Ln2(
                snapContext.previousPoint,
                Vec2.Y(),
                [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH],
            )
            const ptSnap = SnapUtil.intersectCurve(
                snapContext.cursorWorld,
                lineParallelToY,
                EN_SNAP_TYPE.ParallelToY,
                snapContext.previousPoint,
            )
            if (ptSnap) {
                ptSnap.snappedDir = Vec2.Y()
                return [ptSnap]
            }
        }

        return res
    }

    /**
     * 捕捉延长线上的点
     */
    public static snapExtensionPoint(snapContext: SnapContext): PtSnap[] {
        const res: PtSnap[] = []
        if (!SnapSetting.instance().canSnapExtensionPoint) {
            return res
        }
        if (!snapContext.previousPoint || !snapContext.previousLineDir) {
            return res
        }

        const extensionLine = new Ln2(
            snapContext.previousPoint,
            snapContext.previousLineDir,
            [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH],
        )
        const ptSnap = SnapUtil.intersectCurve(
            snapContext.cursorWorld,
            extensionLine,
            EN_SNAP_TYPE.ExtensionPoint,
        )
        if (ptSnap) {
            ptSnap.snappedDir = extensionLine.getDirection()
            return [ptSnap]
        }

        return res
    }

    /**
     * 捕捉参考方向
     */
    public static snapHelperDirections(snapContext: SnapContext): PtSnap[] {
        const res: PtSnap[] = []
        if (!SnapSetting.instance().canSnapHelperDir) {
            return res
        }
        if (!snapContext.previousPoint || !snapContext.getSnapHelpers(EN_SNAP_HELP_OBJ.DIR)?.length) {
            return res
        }

        for (const dir of snapContext.getSnapHelpers(EN_SNAP_HELP_OBJ.DIR)! as Vec2[]) {
            const refLineParallel = new Ln2(
                snapContext.previousPoint,
                dir,
                [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH],
            )
            const ptSnap = SnapUtil.intersectCurve(
                snapContext.cursorWorld,
                refLineParallel,
                (dir.userData?.snapType || EN_SNAP_TYPE.ParallelToCurve) as EN_SNAP_TYPE,
            )
            if (ptSnap) {
                ptSnap.snappedDir = refLineParallel.getDirection()
                ptSnap.addSnappedObject(dir)
                return [ptSnap]
            }
        }
        return res
    }

    /**
     * 捕捉和上一个方向垂直的方向
     */
    public static snapVerticalDir(snapContext: SnapContext): PtSnap[] {
        if (!SnapSetting.instance().canSnapVertical) {
            return []
        }
        if (!snapContext.previousPoint || !snapContext.previousLineDir) {
            return []
        }

        const newDir = new Vec2(-snapContext.previousLineDir.y, snapContext.previousLineDir.x).normalize()
        const verticalLine = new Ln2(
            snapContext.previousPoint,
            newDir,
            [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH],
        )
        const ptSnap = SnapUtil.intersectCurve(
            snapContext.cursorWorld,
            verticalLine,
            EN_SNAP_TYPE.VerticalToCurve,
        )
        if (ptSnap) {
            ptSnap.snappedDir = newDir
            return [ptSnap]
        }
        return []
    }

    /**
     * 连续画线时，捕捉第一点与当前鼠标点连线，与坐标轴平行情况
     */
    public static snapLastLineDir(snapContext: SnapContext): PtSnap[] {
        const res: PtSnap[] = []
        if (
            !snapContext.firstPoint ||
            !snapContext.previousPoint ||
            snapContext.firstPoint.equals(snapContext.previousPoint)
        ) {
            return res
        }

        if (SnapSetting.instance().getCanSnapClosedLineParallelToAxis(EN_XY.X)) {
            const lineParallelToX = new Ln2(
                snapContext.firstPoint,
                Vec2.X(),
                [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH],
            )
            const ptSnap = SnapUtil.intersectCurve(
                snapContext.cursorWorld,
                lineParallelToX,
                EN_SNAP_TYPE.ClosedLineParallelToX,
                snapContext.firstPoint,
            )
            if (ptSnap) {
                ptSnap.snappedDir = Vec2.X()
                return [ptSnap]
            }
        }

        if (SnapSetting.instance().getCanSnapClosedLineParallelToAxis(EN_XY.Y)) {
            const lineParallelToY = new Ln2(
                snapContext.firstPoint,
                Vec2.Y(),
                [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH],
            )
            const ptSnap = SnapUtil.intersectCurve(
                snapContext.cursorWorld,
                lineParallelToY,
                EN_SNAP_TYPE.ClosedLineParallelToY,
                snapContext.firstPoint,
            )
            if (ptSnap) {
                ptSnap.snappedDir = Vec2.Y()
                return [ptSnap]
            }
        }

        return res
    }
}
