import {
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
    CONST,
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

interface IProjectLoop {
    loop: Polygon;
    projInfo: IProjectInfo;
}

/**
 * 视图投影，实现类似线框视图的效果
 */
export class ViewProject {
    private _canProjectedBody: BrepBody[] = [];

    private _baseLoop: Loop[];

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
        // for (const poly of polyDis) {
        //     if (!poly[0].getLoops()[0].isAnticlockwise()) {
        //         poly[0].getLoops().forEach(loop => loop.reverse());
        //     }
        //     if (!poly[0].isValid(this._tol)) {
        //         polyDis.delete(poly[0]);
        //     }
        // }

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
                let upperDis;
                if (norm.isParallel(this._projectPlane.getNorm())) {
                    minDis = alg.D.ptToSurfSigned(
                        face.getVertexes()[0].getPoint(),
                        this._projectPlane,
                    );
                    const poly = FaceProject.execute(face, this._projectPlane.getCoord());
                    if (poly instanceof Polygon) {
                        polygon = poly;
                    }
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
                            // t
                        } else if (outRes === alg.LoopsPJType.CONTAIN) {
                            polygon = new Polygon(this._baseLoop.map(_ => _.clone()));
                        } else if (outRes === alg.LoopsPJType.INTERSECT) {
                            polygon = alg.BoolOperateClipper.boolOperate([basePoly], 1, [polygon]);
                        }
                        const res = this._getDistanceFromLoop(polygon, this._projectPlane, face.getSurface() as Plane);
                        if (!res) continue;
                        minDis = res.minDis;
                        upperDis = res.maxDis;
                    }
                }

                if (shouldReverse) {
                    polygon.reverse();
                }
                // if (polygon.getLoops().length < 1) continue;
                if (isOnPlaneBody) minDis = 0;
                faceInfo.push({ distance: minDis, projFace: face, upDistance: upperDis });
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

    // 计算投影面上生成的loop环，进行拓扑分析，找到封闭的loops(初步仅仅找到loop以及最近的距离)
    // 接口兼容内环，但是初步不考虑内环
    private _analyseLoop(
        baseLoop: Loop[],
        allPoly: Polygon[][],
        polyInfo: IProjectInfo[][],
    ): Map<Polygon, IProjectInfo> {
        let outPolygon = new Polygon(baseLoop);

        const resMap: Map<Polygon, IProjectInfo> = new Map();
        const allOutLoops: Polygon[] = [];
        allPoly.map(bodyPoly => bodyPoly.map(facePoly => allOutLoops.push(facePoly)));
        const allLoopInfo: IProjectInfo[] = [];
        polyInfo.map(bodyInfo => bodyInfo.map(_ => allLoopInfo.push(_)));
        const loopInfosForSort: IProjectLoop[] = allOutLoops.map((p, idx) => {
            return { loop: p, projInfo: allLoopInfo[idx] };
        });

        const resLoopInfo = this._sortInfo(loopInfosForSort);
        // 先找出求交次数为0的loop，按面积排序后，走下面流程，然后找到部分求交为0的loop,走下面的流程
        for (const loopInfo of resLoopInfo) {
            if (loopInfo.loop instanceof Polygon) {
                const intersect = alg.BoolOperateClipper.boolOperate([outPolygon], 1, [loopInfo.loop]);
                if (intersect.getLoops().length > 0) {
                    resMap.set(intersect, loopInfo.projInfo);
                    outPolygon = alg.BoolOperateClipper.boolOperate([outPolygon], 2, [loopInfo.loop]);
                }
            }
            if (outPolygon.getLoops().length < 1) {
                return resMap;
            }
        }

        return resMap;
    }

    private _sortInfo(loopInfosForSort: IProjectLoop[]) {
        const front = [];
        const middle = [];
        const back = [];
        for (const loopInfo of loopInfosForSort) {
            const loop = loopInfo.loop.loops[0];
            const curFace = loopInfo.projInfo.projFace;
            let minDis = CONST.MAX_INTEGER;
            let maxDis = -CONST.MAX_INTEGER;
            let count = 0;
            for (const pt of loop.getAllPoints()) {
                const pt3d = this._projectPlane.getPtAt(pt);
                const rayLine = new Ln3(pt3d, this._projectPlane.getNorm(), [0, CONST.MODEL_MAX_LENGTH]);
                const xPt = alg.X.curveSurface(rayLine, curFace.getSurface());
                if (xPt.length > 0) {
                    const dis = pt3d.distanceTo(xPt[0]);
                    if (dis < minDis) minDis = dis;
                    if (dis > maxDis) maxDis = dis;
                    for (const f of loopInfosForSort) {
                        if (f === loopInfo) {
                            continue;
                        }
                        const res = alg.PJ.loopToLoop(loopInfo.loop.loops[0], f.loop.loops[0]);
                        if (res === alg.LoopsPJType.OUT) {
                            continue;
                        }
                        const d1 = alg.D.ptToSurfSigned(
                            pt3d,
                            f.projInfo.projFace.getSurface(),
                        );
                        const d2 = alg.D.ptToSurfSigned(
                            xPt[0],
                            f.projInfo.projFace.getSurface(),
                        );
                        if (d1 * d2 < -this._tol.lengthEps) {
                            count++;
                            break;
                        }
                    }
                }
            }
            loopInfo.projInfo.distance = minDis;
            loopInfo.projInfo.upDistance = maxDis;
            if (count === 0) {
                front.push(loopInfo);
            } else if (count !== loop.getAllPoints().length) {
                middle.push(loopInfo);
            } else {
                back.push(loopInfo);
            }
        }

        front.sort((a, b) => a.loop.calcArea() - b.loop.calcArea());
        middle.sort((a, b) => a.projInfo.distance - b.projInfo.distance);
        back.sort((a, b) => a.projInfo.distance - b.projInfo.distance);

        return front.concat(middle).concat(back);
    }

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