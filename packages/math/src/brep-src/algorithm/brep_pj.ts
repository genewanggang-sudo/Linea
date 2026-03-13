import { Vec3, Tol, alg, Plane, MathError, Interval, Vec2, Util } from '../..';
import { BrepBody } from '..';
import { Face } from '../brep/face';
import { BrepBodyPJ, BrepBodyPositionType } from './podition_judge/body_pj';
import { ExtrudeBodyPJ, ExtrudeInfo } from './podition_judge/extrude_pj';
import { PtBodyPosition, PtBodyPositionType } from './podition_judge/pt_body_pj';



export class BrepPJ {
    /**
     * 点是否在Face内
     *
     * @param point 任意一点
     * @param face
     */
    public static isPtInFace(point: Vec3, face: Face, tolerance: number = Tol.LENGTH): boolean {
        const surf = face.getSurface();
        const uv = surf.getUVAt(point);
        if (!surf.getPtAt(uv).equals(point, tolerance)) {
            return false;
        }
        // 跨周期的情况下, 尝试几次
        const polygon = face.calcPolygon();
        const box = polygon.getBBox();
        const adjustNumber = (cur: number, min: number, max: number, interval: Interval) => {
            const ll = interval.getLength();
            if (Util.isNearlyBigger(max, interval.max)) {
                return [cur, cur + ll];
            }
            if (Util.isNearlySmaller(min, interval.min)) {
                return [cur, cur - ll];
            }
            return [cur];
        };
        const xs = surf.isUPeriodic() ? adjustNumber(uv.x, box.min.x, box.max.x, surf.getDomainU()) : [uv.x];
        const ys = surf.isVPeriodic() ? adjustNumber(uv.y, box.min.y, box.max.y, surf.getDomainV()) : [uv.y];
        for (const x of xs) {
            for (const y of ys) {
                if (
                    alg.PtLoopPJType.OUT !==
                    alg.PJ.ptToPolygon(new Vec2(x, y), polygon, tolerance)
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 点是否在Face的上侧
     *
     * 规定：点在平面法线一侧为上侧，否则为下侧
     *
     * @param point 任意一点
     * @param plane 任意平面
     */
    public static isPtAboveFace(point: Vec3, face: Face): boolean {
        const pl = face.getSurface().clone();
        if (face.getSurface().isPlane()) {
            if (!face.getSameDirWithSurface()) {
                pl.reverse();
            }
            return alg.PJ.isPtAbovePlane(point, pl as Plane);
        }

        MathError.warn('只支持平面');
        return false;
    }

    /**
     * 点和brep的位置关系判断
     * 通过（1,0,0）方向将射线与face求交，判断点位置
     * @param point
     * @param body 默认自封闭的body
     * @param tol
     * @param useBoundBox 使用包围盒计算，快速判断，如果此项为true，点在body上统一为ON_FACE
     */
    public static pointBrepBodyPositionJudge(
        point: Vec3,
        body: BrepBody,
        eps: number = Tol.DEFAULT.lengthEps,
        useBoundBox: boolean = false,
    ): PtBodyPositionType {
        return PtBodyPosition.PJ(point, body, eps, useBoundBox);
    }

    /**
     * brep体之间的位置关系判断，一般来说直接采用包围和计算能满足大多数情况，如果需要较为精确的关系，例如已知某个物件的大致形状以及可能关系，可以采用一个brep为包围盒点情况
     * 对于均不采用包围盒的情况，存在曲面的情况下求交可能会导致比较慢
     * @param body1 默认自封闭body
     * @param body2 默认自封闭body
     * @param eps
     * @param useBoundBox1 body1是否使用包围盒计算
     * @param useBoundBox2 body2是否使用包围盒计算
     * @returns
     */
    public static BrepBodiesPositionJudge(
        body1: BrepBody,
        body2: BrepBody,
        eps: number = Tol.DEFAULT.lengthEps,
        useBoundBox1: boolean = false,
        useBoundBox2: boolean = false,
    ): BrepBodyPositionType {
        return BrepBodyPJ.PJ(body1, body2, eps, useBoundBox1, useBoundBox2);
    }

    public static ExtrudeBodiesPositionJudge(
        body1: ExtrudeInfo,
        body2: ExtrudeInfo,
        info?: { tol: Tol },
    ): BrepBodyPositionType {
        return ExtrudeBodyPJ.PJ(body1, body2, info);
    }
}