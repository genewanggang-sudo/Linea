import {
    Arc3,
    Coord3,
    Curve2,
    Curve3,
    MathError,
    Plane,
    alg,
    Loop,
    Polygon,
    EN_GEO_TYPE,
    Ln3,
    SmoothPoly3,
    CONST,
    DiscreteParam,
    // Util,
    Tol,
} from '../../..';
// import { BrepPJ } from '..';
import { BrepBody } from '../../brep/brep_body';
import { Face } from '../../brep/face';
import { IProjectInfo } from '../alg_types';
import { FaceProject } from './face_project';

enum BodyPosition {
    UP, // 在投影方向上
    ON, // 横跨投影面
    DOWN, // 在投影方向反向上，不投影
}

const ANGLE = (6 / 180) * CONST.PI; // 斜面角度容差，偏差大于此角度的认为是斜面，需要特殊计算投影

/**
 * 投影求取body对应的polygon与距离
 * 目前仅支持brep面为平面的情况，同时对于body上面有内孔的平面支持不完善，接口兼容
 */
export class SpaceProject {
    private _canProjectedBody: BrepBody[] = [];

    private _baseLoop!: Loop[];

    private _projectPlane: Plane;

    private _onPlaneBody: Set<BrepBody> = new Set();

    private _tol = new Tol(
        Tol.LENGTH,
        Tol.ANGLE,
        Tol.PROCESS_LENGTH_EPS,
        Tol.EDGE_LENGTH_EPS * 1e-2,
    );

    // face暂时只支持平面
    constructor(private _projectFace: Face, _projectCoord: Coord3, private _projectedBodies: BrepBody[]) {
        this._projectPlane = new Plane(_projectCoord);
    }

    // 执行之前先行判断，是否能生成投影brep体,快速检测
    public canProject(): boolean {
        if (!(this._projectFace.getSurface() instanceof Plane)) {
            MathError.warn(false, '投影平面暂时只支持平面');
            return false;
        }

        const coordNormal = this._projectPlane.getNorm();
        const faceNormal = (this._projectFace.getSurface() as Plane).getNorm();
        if (!coordNormal.isParallel(faceNormal)) {
            MathError.warn(false, '目前只支持平行投影的方式构造空间');
            return false;
        }

        const curvesOnPlane: Curve3[][] = this._projectFace
            .getWires()
            .map(w => w.getCoedge3ds().map(c => c.getCurve()));
        let curves2d = curvesOnPlane.map(crvs =>
            crvs.map(crv => alg.Project.curveToPlane(crv, this._projectPlane)),
        );
        curves2d = curves2d.map(crvs => crvs.filter(_ => _ !== undefined));
        for (const crvs of curves2d) {
            for (let i = 0; i < crvs.length; ++i) {
                const nextCrv = crvs[(i + 1) % crvs.length] as Curve2;
                const curCrv = crvs[i] as Curve2;
                if (curCrv.getEndPt().equals(nextCrv.getStartPt())) {
                    continue;
                } else if (curCrv.getEndPt().equals(nextCrv.getEndPt())) {
                    nextCrv.reverse();
                    continue;
                }
                MathError.warn(false, '投影平面边界不连续');
                return false;
            }
        }

        const baseLoop: Loop[] = (curves2d as Curve2[][]).map(_ => new Loop(_));
        for (const body of this._projectedBodies) {
            const pos = this._judgeBodyPosition(body);
            if (pos === BodyPosition.UP) {
                this._canProjectedBody.push(body);
            } else if (pos === BodyPosition.ON) {
                this._onPlaneBody.add(body);
                this._canProjectedBody.push(body);
            }
        }
        this._baseLoop = baseLoop;

        return this._canProjectedBody.length > 0;
    }

    public execute(): Map<Polygon, IProjectInfo> {
        MathError.assert(this._canProjectedBody.length > 0, '不存在可投影的brep体');

        const res = this._projectBodies(this._canProjectedBody, this._projectPlane);

        const polyDis = this._analyseLoop(this._baseLoop, res.poly, res.projInfo);

        // 将多个外框的polygon拆分
        for (const poly of polyDis) {
            if (poly[0].getLoops().length > 1) {
                const polys = alg.SearchGraph.polygonToPolygonExes(poly[0]);
                if (polys.length > 1) {
                    polyDis.delete(poly[0]);
                    polys.forEach(_ => polyDis.set(_, poly[1]));
                }
            }
        }

        // 过滤非法poly以及处理poly方向
        for (const poly of polyDis) {
            if (!poly[0].getLoops()[0].isAnticlockwise()) {
                poly[0].getLoops().forEach(loop => loop.reverse());
            }
            if (!poly[0].isValid(this._tol)) {
                polyDis.delete(poly[0]);
            }
        }

        // 处理斜面投影距离准确性
        for (const poly of polyDis) {
            if (
                !(poly[1].projFace.getSurface() as Plane).getNorm().isParallel(this._projectPlane.getNorm(), ANGLE)
            ) {
                const dis = this._getDistanceFromLoop(
                    poly[0],
                    this._projectPlane,
                    poly[1].projFace.getSurface() as Plane,
                );
                if (dis) {
                    poly[1].distance = dis.minDis;
                    poly[1].upDistance = dis.maxDis;
                }
            }
        }

        return polyDis;
    }

    // 计算所有body对应面投影的polygon和距离
    private _projectBodies(
        projectBodies: BrepBody[],
        projectPlane: Plane,
    ): { poly: Polygon[][]; projInfo: IProjectInfo[][] } {
        const bodyPoly: Polygon[][] = [];
        const bodyInfo: IProjectInfo[][] = [];
        for (const body of projectBodies) {
            const facePolys: Polygon[] = [];
            const faceInfo: IProjectInfo[] = [];
            const isOnPlaneBody = this._onPlaneBody.has(body);
            for (const face of body.getFaces()) {
                if (face.getSurface().getType() !== EN_GEO_TYPE.PLANE) continue;
                const plane = face.getSurface() as Plane;
                const norm = plane.getNorm().clone();
                if (!face.getSameDirWithSurface()) norm.reverse();
                if (norm.dot(this._projectPlane.getNorm()) > 0 || norm.isPerpendicular(this._projectPlane.getNorm())) {
                    continue;
                }

                let polygon = new Polygon();
                const shouldReverse = false;
                let minDis = CONST.MAX_INTEGER;
                if (norm.isParallel(this._projectPlane.getNorm(), ANGLE)) {
                    minDis = alg.D.ptToSurfSigned(
                        face.getVertexes()[0].getPoint(),
                        this._projectPlane,
                    );
                } else {
                    const poly = FaceProject.execute(face, this._projectPlane.getCoord());
                    if (poly instanceof Polygon) {
                        polygon = poly;
                        const basePoly = new Polygon(this._baseLoop);
                        const outRes = this._polygonPosition(polygon, basePoly);
                        if (outRes === alg.LoopsPJType.OUT) {
                            continue;
                        } else if (
                            outRes === alg.LoopsPJType.IN ||
                            outRes === alg.LoopsPJType.EQUAL
                        ) {
                            face.getWires().forEach(w => {
                                for (const c of w.getCoedge3ds()) {
                                    const curve = c.getCurve();
                                    const curve2d = alg.Project.curveToPlane(curve, projectPlane);
                                    if (curve2d instanceof Curve2) {
                                        minDis = Math.min(minDis, this._GetMinDistance(curve, projectPlane));
                                    }
                                }
                            });
                        } else if (outRes === alg.LoopsPJType.CONTAIN) {
                            polygon = new Polygon(this._baseLoop.map(_ => _.clone()));
                            const res = this._getDistanceFromLoop(
                                polygon,
                                this._projectPlane,
                                face.getSurface() as Plane,
                            );
                            if (!res) continue;
                            minDis = res.minDis;
                        } else if (outRes === alg.LoopsPJType.INTERSECT) {
                            polygon = alg.BoolOperateClipper.boolOperate([basePoly], 1, [polygon]);
                            const res = this._getDistanceFromLoop(
                                polygon,
                                this._projectPlane,
                                face.getSurface() as Plane,
                            );
                            if (!res) continue;
                            minDis = res.minDis;
                        }
                    }
                }

                if (shouldReverse) {
                    polygon.reverse();
                }
                // if (polygon.getLoops().length < 1) continue;
                if (isOnPlaneBody) minDis = 0;
                faceInfo.push({ distance: minDis, projFace: face });
                facePolys.push(polygon);
            }
            bodyInfo.push(faceInfo);
            bodyPoly.push(facePolys);
        }
        return { poly: bodyPoly, projInfo: bodyInfo };
    }

    private _getDistanceFromLoop(polygon: Polygon, projectPlane: Plane, projectedPlane: Plane) {
        if (polygon.getLoops().length < 1) return undefined;
        const outLoop = polygon.getLoops()[0];
        let minDis = CONST.MAX_INTEGER;
        let maxDis = -CONST.MAX_INTEGER;
        let flag = false;
        for (const curve of outLoop.getAllCurves()) {
            const curve3d = projectPlane.getCurve3d(curve);
            const rayLine = new Ln3(curve3d.getStartPt(), projectPlane.getNorm(), [0, CONST.MODEL_MAX_LENGTH]);
            const xPt = alg.X.curveSurface(rayLine, projectedPlane);
            if (xPt.length > 0) {
                const dis = curve3d.getStartPt().distanceTo(xPt[0]);
                if (dis < minDis) minDis = dis;
                if (dis > maxDis) maxDis = dis;
                flag = true;
            }
        }

        if (!flag) {
            return undefined;
        }

        return { minDis, maxDis };
    }

    // 获取曲线距离平面的最近距离，曲线与平面相交的情况下，结果不准确
    private _GetMinDistance(curve: Curve3, plane: Plane): number {
        if (curve instanceof Ln3) {
            const stPt = curve.getStartPt();
            const endPt = curve.getEndPt();
            const dis1 = alg.D.ptToSurf(stPt, plane);
            const dis2 = alg.D.ptToSurf(endPt, plane);
            return Math.min(dis1, dis2);
        }

        if (curve instanceof Arc3) {
            const arc = curve;
            const t = plane.getCoord().getDx().angleTo(arc.getCoord().getDx(), plane.getCoord().getDz());
            const stDis = plane.distanceToPoint(arc.getStartPt());
            const endDis = plane.distanceToPoint(arc.getEndPt());
            const d1 = plane.distanceToPoint(arc.getPtAt(t));
            const d2 = plane.distanceToPoint(arc.getPtAt(t + Math.PI * 0.5));
            const d3 = plane.distanceToPoint(arc.getPtAt(t + Math.PI));
            const d4 = plane.distanceToPoint(arc.getPtAt(t + Math.PI * 1.5));
            return Math.min(stDis, endDis, d1, d2, d3, d4);
        }

        const minDis = CONST.MAX_INTEGER;
        if (curve instanceof SmoothPoly3) {
            const pts = curve.getPoints();
            for (const pt of pts) {
                Math.min(minDis, plane.distanceToPoint(pt));
            }
            return minDis;
        }

        const polyCvs = alg.DiscreteUtil.discreteCurve3d(curve, DiscreteParam.NORMAL);
        for (const pt of polyCvs) {
            Math.min(minDis, plane.distanceToPoint(pt));
        }

        return minDis;
    }

    // private _findLoopFromPts(points: Vec2[]) {
    //     let left = CONST.MAX_INTEGER;
    //     let right = -CONST.MAX_INTEGER;
    //     let bottom = CONST.MAX_INTEGER;
    //     let top = -CONST.MAX_INTEGER;
    //     for (const pt of points) {
    //         if (pt.x < left) left = pt.x;
    //         if (pt.x > right) right = pt.x;
    //         if (pt.y < bottom) bottom = pt.y;
    //         if (pt.y > top) top = pt.y;
    //     }

    //     if (left >= right || top <= bottom) return undefined;

    //     return new Loop([
    //         new Vec2(left, bottom),
    //         new Vec2(right, bottom),
    //         new Vec2(right, top),
    //         new Vec2(left, top),
    //     ]);
    // }

    // 计算投影面上生成的loop环，进行拓扑分析，找到封闭的loops(初步仅仅找到loop以及最近的距离)
    // 接口兼容内环，但是初步不考虑内环
    private _analyseLoop(
        baseLoop: Loop[],
        allPoly: Polygon[][],
        polyInfo: IProjectInfo[][],
    ): Map<Polygon, IProjectInfo> {
        let outPolygon = new Polygon(baseLoop);

        const resMap: Map<Polygon, IProjectInfo> = new Map();
        let allOutLoops: Polygon[] = [];
        allPoly.map(bodyPoly => bodyPoly.map(facePoly => allOutLoops.push(facePoly)));
        let allLoopInfo: IProjectInfo[] = [];
        polyInfo.map(bodyInfo => bodyInfo.map(_ => allLoopInfo.push(_)));
        const loopInfosForSort = allOutLoops.map((p, idx) => {
            return { Loop: p, IProjectInfo: allLoopInfo[idx] };
        });
        loopInfosForSort.sort((a, b) => a.IProjectInfo.distance - b.IProjectInfo.distance);
        allOutLoops = loopInfosForSort.map(_ => _.Loop);
        allLoopInfo = loopInfosForSort.map(_ => _.IProjectInfo);
        for (let idx = 0; idx < allOutLoops.length; idx++) {
            const projOutLoop = FaceProject.execute(allLoopInfo[idx].projFace, this._projectPlane.getCoord());
            if (projOutLoop instanceof Polygon) {
                const intersect = alg.BoolOperateClipper.boolOperate([outPolygon], 1, [projOutLoop]);
                if (intersect.getLoops().length > 0) {
                    resMap.set(intersect, allLoopInfo[idx]);
                    outPolygon = alg.BoolOperateClipper.boolOperate([outPolygon], 2, [projOutLoop]);
                }
            }
            if (outPolygon.getLoops().length < 1) {
                return resMap;
            }
        }

        return resMap;
    }

    // private _insertLoop(polygon: Polygon, insertLoopInfo: IProjectInfo, resMap: Map<Polygon, IProjectInfo>) {
    //     for (const disLoopMap of resMap) {
    //         const dis = disLoopMap[1].distance;
    //         const outRes = this._polygonPosition(polygon, disLoopMap[0]);
    //         if (outRes === alg.LoopsPJType.OUT) {
    //             continue;
    //         } else if (outRes === alg.LoopsPJType.IN || outRes === alg.LoopsPJType.EQUAL) {
    //             if (insertLoopInfo.distance < dis) {
    //                 const boolRes = alg.BoolOperateClipper.boolOperate([disLoopMap[0]], 2, [polygon]);
    //                 if (!boolRes.isEmpty()) {
    //                     resMap.delete(disLoopMap[0]);
    //                     resMap.set(boolRes, disLoopMap[1]);
    //                 } else {
    //                     resMap.delete(disLoopMap[0]);
    //                 }
    //             } else {
    //                 return true;
    //             }
    //         } else if (outRes === alg.LoopsPJType.CONTAIN) {
    //             if (insertLoopInfo.distance < dis) {
    //                 resMap.delete(disLoopMap[0]);
    //             } else {
    //                 const boolRes = alg.BoolOperateClipper.boolOperate([polygon], 2, [disLoopMap[0]]);
    //                 if (boolRes.isEmpty()) return true;
    //                 polygon = boolRes;
    //             }
    //         } else if (outRes === alg.LoopsPJType.INTERSECT) {
    //             if (insertLoopInfo.distance < dis) {
    //                 const boolRes = alg.BoolOperateClipper.boolOperate([disLoopMap[0]], 2, [polygon]);
    //                 resMap.delete(disLoopMap[0]);
    //                 if (!boolRes.isEmpty()) {
    //                     resMap.set(boolRes, disLoopMap[1]);
    //                 }
    //             } else {
    //                 const boolRes = alg.BoolOperateClipper.boolOperate([polygon], 2, [disLoopMap[0]]);
    //                 if (boolRes.isEmpty()) return true;
    //                 polygon = boolRes;
    //             }
    //         }
    //     }
    //     resMap.set(polygon, insertLoopInfo);
    //     return false;
    // }

    // polygon之间的位置判断，针对loops来判断
    private _polygonPosition(insertPolygon: Polygon, curPolygon: Polygon) {
        const insertLoops = insertPolygon.getLoops();
        const curLoops = curPolygon.getLoops();

        let res;
        let inCount = 1;
        let containCount = 1;
        for (const insertLoop of insertLoops) {
            for (const curLoop of curLoops) {
                const r = alg.PJ.loopToLoop(insertLoop, curLoop);
                if (r === alg.LoopsPJType.INTERSECT) {
                    return r;
                }
                if (!res) {
                    res = r;
                    continue;
                }
                if (res === r && r === alg.LoopsPJType.OUT) {
                    continue;
                }
                if (res === r && r === alg.LoopsPJType.IN) {
                    inCount++;
                    continue;
                }
                if (res === r && r === alg.LoopsPJType.EQUAL) {
                    continue;
                }
                if (res === r && r === alg.LoopsPJType.CONTAIN) {
                    containCount++;
                    continue;
                }
                return alg.LoopsPJType.INTERSECT;
            }
        }

        if (res === alg.LoopsPJType.IN) {
            if ((inCount / insertLoops.length) % 2 === 0) {
                return alg.LoopsPJType.OUT;
            }
        }

        if (res === alg.LoopsPJType.CONTAIN) {
            if ((containCount / curLoops.length) % 2 === 0) {
                return alg.LoopsPJType.OUT;
            }
        }

        if (res === alg.LoopsPJType.OUT) {
            return alg.LoopsPJType.OUT;
        }
        if (res === alg.LoopsPJType.EQUAL) {
            return alg.LoopsPJType.EQUAL;
        }
        if (res === alg.LoopsPJType.CONTAIN) {
            return alg.LoopsPJType.CONTAIN;
        }
        return res;
    }

    // 仅仅支持平面
    private _judgeBodyPosition(body: BrepBody): BodyPosition {
        const vertices = body.getVertexs();
        const points = vertices.map(_ => _.getPoint());
        let below = 0;
        let upper = 0;
        for (const pt of points) {
            // const ptOnPlane = this._projectPlane.getProjectedPtBy(pt);
            // const norm = ptOnPlane.subtract(pt);
            // if (Util.isNearlyBiggerOrEqual(norm.dot(this._projectPlane.getNorm()), 0)) {
            //     below++;
            // } else {
            //     upper++;
            // }
            if (alg.D.ptToSurfSigned(pt, this._projectPlane) > this._tol.lengthEps) {
                upper++;
            } else {
                below++;
            }
        }
        if (below > 0 && upper === 0) {
            return BodyPosition.DOWN;
        }
        if (upper > 0 && below === 0) {
            return BodyPosition.UP;
        }
        return BodyPosition.ON;
    }
}
