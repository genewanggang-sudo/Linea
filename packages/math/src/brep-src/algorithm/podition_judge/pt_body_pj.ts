import {
    Ln3,
    Tol,
    Vec3,
    Box3,
    Util,
    alg,
    Polygon,
    Vec2,
    Surface,
    CONST,
    Loop,
} from '../../..';
import { BrepBody, Edge, Face, Vertex } from '../..';

export enum PtBodyPositionType {
    INSIDE,
    OUTSIDE,
    ON_VERTEX,
    ON_EDGE,
    ON_FACE,
}

export interface IPtBodyPositionContext {
    bodyBox: Box3;
    faceBoxMap: Map<Face, Box3>;
}

export class PtBodyPosition {
    /**
     * 通过（1,0,0）方向将射线与face求交，判断点位置
     * @param point
     * @param body 默认自封闭的body
     * @param tol
     * @param useBoundBox 使用包围盒计算，快速判断，如果点在body上，统一为ON_FACE
     * @param context 缓存信息，避免重复计算
     */
    public static PJ(
        point: Vec3,
        body: BrepBody,
        eps: number = Tol.DEFAULT.lengthEps,
        useBoundBox: boolean = false,
        context?: IPtBodyPositionContext,
    ): PtBodyPositionType {
        const boundingBox = context ? context.bodyBox : body.getBBox();
        if (!boundingBox.containsPt(point, eps)) {
            return PtBodyPositionType.OUTSIDE;
        }
        if (useBoundBox) {
            const sqrDis = boundingBox.getSquareDistanceTo(point);
            if (Util.isNearly0(sqrDis, eps)) {
                return PtBodyPositionType.ON_FACE;
            }
            return PtBodyPositionType.INSIDE;
        }

        // 获取可能相交的face，避免过多无效计算
        const rayLine = new Ln3(point, new Vec3(boundingBox.max.x, point.y, point.z));
        let xFaceBox: Face[] = [];
        const faceBoxMap = context?.faceBoxMap;
        for (const f of body.getFaces()) {
            const box = faceBoxMap?.get(f) || f.getBBox();
            if (this._isIntersectBox(rayLine, box, eps)) {
                xFaceBox.push(f);
            }
        }

        const allXVertices: Set<Vertex> = new Set();
        const allXEdges: Set<Edge> = new Set();
        for (const xFace of xFaceBox) {
            for (const v of xFace.getVertexes()) {
                if (!allXVertices.has(v)) {
                    allXVertices.add(v);
                }
            }
            for (const e of xFace.getEdges()) {
                if (!allXEdges.has(e)) {
                    allXEdges.add(e);
                }
            }
        }
        for (const v of allXVertices) {
            if (v.getPoint().equals(point, eps)) {
                return PtBodyPositionType.ON_VERTEX;
            }
        }
        for (const e of allXEdges) {
            if (e.getCurve().containsPt(point, eps)) {
                return PtBodyPositionType.ON_EDGE;
            }
        }

        let coPointFlag = false;
        let xPoints: Vec3[] = [];
        let count = 0;
        while (!coPointFlag) {
            coPointFlag = false;
            let pts: Vec3[] = [];
            for (const xFace of xFaceBox) {
                const sur = xFace.getSurface();
                if (
                    sur.containsPt(point, eps) &&
                    sur.isPlane() &&
                    (sur).getNorm().isPerpendicular(rayLine.getDirection(), eps)
                ) {
                    coPointFlag = true;
                    pts = [];
                    break;
                }
                const tol = new Tol(eps);
                const xInfo = alg.X.curveSurfaceAll(rayLine, sur, tol);
                const polygon = new Polygon(xFace.getWires().map(_ => _.calcLoop()));
                for (const info of xInfo) {
                    // 对于有重合段的情况，暂时只处理重合段是类似拐点的情况，其他情况不考虑
                    if (info.overlapRange) {
                        coPointFlag = true;
                        continue;
                    }
                    // todo::处理跨参数域情况
                    const uvPt = info.surfaceUV;
                    const res = this._calUVPosition(new Vec2(uvPt), polygon, sur, eps);
                    if (res !== alg.PtLoopPJType.OUT) {
                        pts.push(info.point);
                    }
                }
            }
            xPoints = pts;

            // 重合点特殊处理,存在重合点时，将射线随机方向，直到没有重合点为止
            for (let i = 0; i < xPoints.length; ++i) {
                if (point.equals(xPoints[i], eps)) {
                    return PtBodyPositionType.ON_FACE;
                }
                for (let j = i + 1; j < xPoints.length; ++j) {
                    if (xPoints[i].equals(xPoints[j], eps)) {
                        coPointFlag = true;
                        break;
                    }
                }
                if (coPointFlag) {
                    break;
                }
            }
            if (coPointFlag) {
                xPoints = [];
                xFaceBox = body.getFaces().map(_ => _);
                const dis = this._farthestDis(point, boundingBox);
                rayLine.setDirection({ x: Math.random(), y: Math.random(), z: Math.random() });
                rayLine.setRange(0, dis);
                coPointFlag = false;
            }
            if (count > 10) {
                coPointFlag = true;
                break;
            }
            count++;
        }

        return xPoints.length % 2 === 0 ? PtBodyPositionType.OUTSIDE : PtBodyPositionType.INSIDE;

        // // 对于出现重合点的情况，先找过点的xoy平面与body求交，找出该平面的loop图，然后采用二维的射线法判断内外
        // const loop = Loop.createByRectangle(
        //     { x: boundingBox.min.x, y: boundingBox.min.y },
        //     { x: boundingBox.max.x, y: boundingBox.max.y },
        // );
        // const plane = new Plane(new Coord3(new Vec3(0, 0, point.z), Vec3.X(), Vec3.Y()));
        // const xoyPlaneFace = Face.createByBoundary2d(plane, [loop.getAllCurves()], true);
        // const faces = body.getFaces().map(_ => _);
        // const polygon = FaceFacesIntersect.execute(xoyPlaneFace, faces, eps);
        // const loops: Loop[] = [];
        // polygon.forEach(_ => {
        //     if (_ instanceof Loop) {
        //         loops.push(_);
        //     }
        // });
        // const res = alg.PJ.ptToPolygon(new Vec2(point), new Polygon(loops), eps);
        // return res === alg.PtLoopPJType.OUT ? PtBodyPositionType.OUTSIDE : PtBodyPositionType.INSIDE;
    }

    /**
     * x正方向平行线与box求交，特殊处理
     * @param line
     * @param box
     */
    private static _isIntersectBox(line: Ln3, box: Box3, eps: number) {
        const min = box.min;
        const max = box.max;
        const start = line.getStartPt();
        const end = line.getEndPt();
        if (Util.isNearlyBigger(start.x, max.x, eps) || Util.isNearlySmaller(end.x, min.x, eps)) {
            return false;
        }
        if (Util.isNearlySmaller(start.y, min.y, eps) || Util.isNearlyBigger(start.y, max.y, eps)) {
            return false;
        }
        if (Util.isNearlySmaller(start.z, min.z, eps) || Util.isNearlyBigger(start.z, max.z, eps)) {
            return false;
        }
        return true;
    }

    private static _calUVPosition(uvPt: Vec2, polygon: Polygon, sur: Surface, eps: number) {
        if (sur.isCylinder()) {
            const pts = polygon.getAllCurves().map(_ => _.getStartPt());
            let min = CONST.MAX_INTEGER;
            let max = -CONST.MAX_INTEGER;
            for (const pt of pts) {
                if (min > pt.x) min = pt.x;
                if (max < pt.x) max = pt.x;
            }
            while (uvPt.x > max) {
                uvPt.x -= Math.PI * 2;
            }
            while (uvPt.x < min) {
                uvPt.x += Math.PI * 2;
            }
        }

        const newLoops: Loop[] = [];
        for (const loop of polygon.getLoops()) {
            const newloop = new Loop(
                loop
                    .getAllCurves()
                    .map(_ => _.discrete())
                    .flat(),
            );
            newLoops.push(newloop);
        }

        return alg.PJ.ptToPolygon(uvPt, new Polygon(newLoops), eps);
    }

    private static _farthestDis(point: Vec3, box: Box3) {
        const pts = box.getCornerPts();
        let farDis = 0;
        for (const pt of pts) {
            const dis = point.distanceTo(pt);
            if (farDis < dis) {
                farDis = dis;
            }
        }
        return farDis;
    }
}
