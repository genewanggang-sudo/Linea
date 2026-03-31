import { Curve3 } from '../../geometry/curve3d';
import { Surface } from '../../geometry/surface';
import { Vec3 } from '../../base/vec3';
import { Ln3 } from '../../geometry/ln3';
import { Plane } from '../../geometry/plane';
import { Util } from '../../util/util';
import { Arc3 } from '../../geometry/arc3d';
import { SurfacesX } from './surfaces_x';
import { Cylinder } from '../../geometry/cylinder';
import { Matrix4 } from '../../base/matrix4';
import { Tol } from '../../base/tol';
import { CurveSurfaceXUtil } from './curve_surface_x_util';
import { CONST } from '../../type_define/const';
import { ICvSurfXInfo, ICurveSurfXPointInfo } from './x_info';
import { Interval } from '../../base/interval';
import { CurvesX } from './curves_x';
import { CurveSurfaceCoincide } from '../overlap/curve_surface_coincide';
import { types } from '../../type_define/i_types';
import { MathAssert } from '../../util/assert';
import { Coord3 } from '../../base/coord3';
import { Vec2 } from '../../base/vec2';
import { CoordBasedSurface } from '../../geometry/coord_based_surface';
import { CurveUtil } from '../../util/curve_util';
import { PJ } from '../position_judge';
import { PtLoopPJType } from '../pj/pj_type';
import { Polygon } from '../../topology/polygon';
import { Box2 } from '../../base/box2';

/**
 * 三维曲线与曲面的交点, 交点可能不止一个，故返回交点的数组
 * @returns
 */
class CurveSurfaceX {
    /**
     * 【注意：曲线有参数域，曲面没有，因此求交要判断是否在曲线参数域内】
     * 三维曲线与曲面的求交：直线+平面，直线+圆柱，（直线+圆锥；）圆弧+平面，（圆弧+圆柱，圆弧+圆锥；通用曲线+平面，通用曲线+圆柱，通用曲线+圆锥）
     * @param curve  曲线
     * @param surface 曲面
     * @returns 交点可能不止一个，故返回交点的数组
     */
    public static execute(
        curve: Curve3,
        surface: Surface,
        tol = Tol.DEFAULT,
        surfRangeUV?: Interval[],
    ): ICvSurfXInfo[] {
        const rets = this._preciseMethod(curve, surface, tol, surfRangeUV);
        if (rets) {
            return rets;
        }

        // todo：曲线曲面重合处理尚不完善
        if (CurveSurfaceCoincide.execute(curve, surface, tol)) {
            const pt = curve.getStartPt();
            const intersectPtInfo: ICvSurfXInfo = {
                point: pt,
                curveT: curve.getStartParam(),
                surfaceUV: surface.getUVAt(pt),
                overlapRange: curve.getRange(),
            };
            return [intersectPtInfo];
        }

        return this._complexMethod(curve, surface, tol, surfRangeUV);
    }

    public static allPoints(
        curve: Curve3,
        surface: Surface,
        tol = Tol.DEFAULT,
        surfRangeUV?: Interval[],
    ): Vec3[] {
        const rets = this._preciseMethod(curve, surface, tol);
        if (rets) {
            return rets.map(it => it.point);
        }

        if (CurveSurfaceCoincide.execute(curve, surface, tol)) {
            return [];
        }

        const rets2 = this._complexMethod(curve, surface, tol, surfRangeUV);
        return rets2.map(it => it.point);
    }

    public static hasIntersect(curve: Curve3, surf: Surface, surfPoly?: Polygon, tol = Tol.DEFAULT): boolean {
        const rets = this._preciseMethod(curve, surf, tol);
        if (rets) {
            if (surfPoly === undefined) {
                return rets.length > 0;
            }

            for (const xInfo of rets) {
                const pos = PJ.ptToPolygon(new Vec2(xInfo.surfaceUV), surfPoly, tol.lengthEps);
                if (pos !== PtLoopPJType.OUT) {
                    return true;
                }
            }
            return false;
        }

        if (surfPoly === undefined) {
            const csUtil = new CurveSurfaceXUtil(curve, surf, tol);
            return csUtil.hasIntersect(surfPoly);
        }

        const boxToRangeUV = (rangeBox: Box2) => {
            const rangeU = surf.getDomainU();
            const rangeV = surf.getDomainV();
            rangeU.set(rangeBox.min.x, rangeBox.max.x);
            rangeV.set(rangeBox.min.y, rangeBox.max.y);
            return [rangeU, rangeV];
        };

        // 矩形参数域的polygon转化为range
        const isPolyRectangleRanges = (poly: Polygon) => {
            if (poly.getLoops().length > 1) {
                return [];
            }

            for (const cv of poly.getAllCurves()) {
                if (cv.isLine2d() || (cv.isNurbsCurve2d() && cv.isLineLike())) {
                    const dir = cv.getStartTangent();
                    if (
                        dir.isPerpendicular(Vec2.X(), tol.angleEps) ||
                        dir.isPerpendicular(Vec2.Y(), tol.angleEps)
                    ) {
                        continue;
                    } else {
                        return [];
                    }
                } else {
                    return [];
                }
            }

            const surfRangeBox = surfPoly.getBBox();
            const surfRangeUV = boxToRangeUV(surfRangeBox);
            return surfRangeUV;
        };

        const surfRanges = isPolyRectangleRanges(surfPoly);
        if (surfRanges.length > 0) {
            const csUtil = new CurveSurfaceXUtil(curve, surf, tol);
            return csUtil.hasIntersect(surfRanges);
        }

        const surfRangeBox = surfPoly.getBBox();
        const surfRangeUV = boxToRangeUV(surfRangeBox);
        const xRets = this._complexMethod(curve, surf, tol, surfRangeUV);
        for (const xInfo of xRets) {
            const pos = PJ.ptToPolygon(new Vec2(xInfo.surfaceUV), surfPoly, tol.lengthEps);
            if (pos !== PtLoopPJType.OUT) {
                return true;
            }
        }

        return false;
    }

    public static nearPoint(
        curve: Curve3,
        surf: Surface,
        refPoint: Vec3 | ICurveSurfXPointInfo,
        tol = Tol.DEFAULT,
    ): ICvSurfXInfo | undefined {
        const refPt = refPoint instanceof Vec3 ? refPoint : refPoint.point;
        let minDistPt: ICvSurfXInfo | undefined;
        let sqrDist = CONST.MAX_INTEGER;
        const rets = this._preciseMethod(curve, surf, tol);
        if (rets) {
            for (const pt of rets) {
                const tmpSqrDist = refPt.sqDistanceTo(pt.point);
                if (tmpSqrDist < sqrDist) {
                    minDistPt = pt;
                    sqrDist = tmpSqrDist;
                }
            }
            return minDistPt;
        }

        const simpleCurves = [curve];
        const simpleSurfs = [{ surface: surf }];
        for (const iCurv of simpleCurves) {
            for (const iSurf of simpleSurfs) {
                const rets1 = this._preciseMethod(iCurv, iSurf.surface, tol, undefined);
                if (rets1) {
                    for (const pt of rets1) {
                        const tmpSqrDist = refPt.sqDistanceTo(pt.point);
                        if (tmpSqrDist < sqrDist) {
                            minDistPt = pt;
                            sqrDist = tmpSqrDist;
                        }
                    }
                    continue;
                }

                const csUtil = new CurveSurfaceXUtil(iCurv, iSurf.surface, tol);
                const ret2 = csUtil.calSingleIntersect(refPoint, undefined);
                if (ret2) {
                    const tmpSqrDist = refPt.sqDistanceTo(ret2.point);
                    if (tmpSqrDist < sqrDist) {
                        minDistPt = ret2;
                        sqrDist = tmpSqrDist;
                    }
                }
            }
        }

        return minDistPt;
    }

    public static nearParam(
        curve: Curve3,
        surf: Surface,
        refT: number,
        refUV: types.IXY,
        tol = Tol.DEFAULT,
    ): ICvSurfXInfo | undefined {
        const refPt = curve.getPtAt(refT).midTo(surf.getPtAt(refUV));
        let minDistPt: ICvSurfXInfo | undefined;
        let sqrDist = CONST.MAX_INTEGER;
        const rets = this._preciseMethod(curve, surf, tol);
        if (rets) {
            for (const pt of rets) {
                const tmpSqrDist = refPt.sqDistanceTo(pt.point);
                if (tmpSqrDist < sqrDist) {
                    minDistPt = pt;
                    sqrDist = tmpSqrDist;
                }
            }
            return minDistPt;
        }

        const refPtInfo = { point: refPt, curveT: refT, uvPara: refUV };
        const csUtil = new CurveSurfaceXUtil(curve, surf, tol);
        const ret = csUtil.calSingleIntersect(refPtInfo);
        return ret;
    }

    private static _complexMethod(
        curve: Curve3,
        surf: Surface,
        tol: Tol,
        surfRangeUV?: Interval[],
    ): ICvSurfXInfo[] {
        const simpleCurves = [curve];
        const simpleSurfs: { surface: Surface; rangeUV?: Interval[] | undefined }[] = [];
        simpleSurfs.push({ surface: surf, rangeUV: surfRangeUV });

        const rets = this._getCurveEndPtIntersects(curve, surf, tol, surfRangeUV);
        for (const iCurv of simpleCurves) {
            for (const iSurf of simpleSurfs) {
                const rets1 = this._preciseMethod(iCurv, iSurf.surface, tol, iSurf.rangeUV); // 后面需要计算出交点的参数t和uv
                if (rets1) {
                    for (const ret of rets1) {
                        CurveSurfaceXUtil.dealRedundantIntersect(curve, surf, ret, rets, tol);
                        ret.surfaceUV = surf.getUVAt(ret.point); // 简化后uv发生了改变
                    }
                    continue;
                }

                const coord = this._getSurfaceLocalCoord(iSurf.surface);
                if (
                    !coord ||
                    coord.getDz().isParallel(Vec3.X()) ||
                    coord.getDz().isParallel(Vec3.Y()) ||
                    coord.getDz().isParallel(Vec3.Z())
                ) {
                    const cs = new CurveSurfaceXUtil(curve, iSurf.surface, tol);
                    const rets2 = cs.calAllIntersects(iSurf.rangeUV);
                    rets2.map(_p => CurveSurfaceXUtil.dealRedundantIntersect(curve, surf, _p, rets, tol));
                    continue;
                }

                // 将曲线曲面变换到局部坐标系下求交，因为局部坐标系下，计算的包围盒更小更紧凑，有利于包围盒加速
                const coordMat = coord.getWorldToLocalMatrix();
                const newSurf = iSurf.surface.transformed(coordMat);
                const newCurve = curve.transformed(coordMat);

                const cs = new CurveSurfaceXUtil(newCurve, newSurf, tol);
                const rets2 = cs.calAllIntersects(iSurf.rangeUV);
                for (const iter of rets2) {
                    iter.point = coord.getWorldPtAt(iter.point);
                }
                rets2.map(_p => CurveSurfaceXUtil.dealRedundantIntersect(curve, surf, _p, rets, tol));
            }
        }

        return rets;
    }

    private static _getSurfaceLocalCoord(surf: Surface) {
        if (surf instanceof CoordBasedSurface) {
            return surf.getCoord();
        }

        return undefined;
    }

    private static _getCurveEndPtIntersects(
        curve: Curve3,
        surf: Surface,
        tol: Tol,
        surfRangeUV?: Interval[],
    ): ICvSurfXInfo[] {
        const rets: ICvSurfXInfo[] = [];
        const endPtInfos: { pt: Vec3; param: number }[] = [];
        endPtInfos.push({ pt: curve.getStartPt(), param: curve.getStartParam() });

        endPtInfos.push({ pt: curve.getEndPt(), param: curve.getEndParam() });
        for (const ptInfo of endPtInfos) {
            const uv = surf.getUVAt(ptInfo.pt);
            if (surfRangeUV) {
                if (
                    !surfRangeUV[0].containsPt(uv.x, tol.numberEps) ||
                    !surfRangeUV[1].containsPt(uv.y, tol.numberEps)
                ) {
                    continue;
                }
            }

            if (surf.getPtAt(uv).sqDistanceTo(ptInfo.pt) < tol.lengthEps2) {
                const xPtInfo = {
                    point: ptInfo.pt,
                    curveT: ptInfo.param,
                    surfaceUV: uv,
                };

                CurveSurfaceXUtil.dealRedundantIntersect(curve, surf, xPtInfo, rets);
            }
        }

        return rets;
    }

    private static _preciseMethod(
        curve: Curve3,
        surface: Surface,
        tol = Tol.DEFAULT,
        surfRangeUV?: Interval[],
    ): ICvSurfXInfo[] | undefined {
        let rets: ICvSurfXInfo[] = [];
        if (curve.isLine3d()) {
            const line = curve;
            if (surface.isPlane()) {
                const plane = surface;
                rets = this._line3dPlane(line, plane, tol);
            } else if (surface.isCylinder()) {
                const cly = surface;
                rets = this._line3dCylinder(line, cly, tol);
            } else {
                return undefined;
            }
        } else if (curve instanceof Arc3 && surface.isPlane()) {
            const pts = this._circle3dPlane(curve, surface, tol);

            rets = pts.filter(p => curve.getRange().containsPt(p.curveT));
        } else {
            return undefined;
        }

        if (surfRangeUV) {
            const filterRets = rets.filter(
                p => surfRangeUV[0].containsPt(p.surfaceUV.x) && surfRangeUV[1].containsPt(p.surfaceUV.y),
            );
            return filterRets;
        }
        return rets;
    }

    private static _line3dPlane(line: Ln3, plane: Plane, tol: Tol): ICvSurfXInfo[] {
        const dir = line.getDirection();

        if (Util.isNearly0(dir.dot(plane.getNorm()))) {
            return [];
        }

        const OP = new Vec3(line.getOrigin(), plane.getOrigin());

        const t = OP.dot(plane.getNorm()) / dir.dot(plane.getNorm());

        if (!line.getRange().containsPt(t)) {
            return [];
        }

        const pt = line.getPtAt(t);
        const intersectPtInfo: ICvSurfXInfo = {
            point: pt,
            curveT: line.getParamAt(pt),
            surfaceUV: plane.getUVAt(pt),
        };
        return [intersectPtInfo];
    }

    private static _circle3dPlane(arc3: Arc3, plane: Plane, tol: Tol): ICvSurfXInfo[] {
        // 先求2平面交点
        const arcPlane = new Plane(arc3.getCoord());
        const ssRet = SurfacesX.allIntersections(plane, arcPlane);
        if (ssRet.length === 0) {
            return [];
        }

        const rets: ICvSurfXInfo[] = [];
        const line = ssRet[0].curve as Ln3;
        const curveRets = CurvesX.curve3ds(arc3, line);
        for (const it of curveRets) {
            const csRet: ICvSurfXInfo = {
                point: it.point,
                curveT: it.param1,
                surfaceUV: plane.getUVAt(it.point),
            };
            rets.push(csRet);
        }

        return rets;
    }

    // 解析法求解方程的解at^2 + bt + c =0：变到标准形式（局部坐标系下），求解，变回到原形（世界坐标系下）
    private static _line3dCylinder(line: Ln3, cylinder: Cylinder, tol: Tol): ICvSurfXInfo[] {
        const clyCoord = cylinder.getCoord();
        const ra = cylinder.getA();
        const rb = cylinder.getB();

        const transform: Matrix4 = clyCoord.getLocalToWorldMatrix();
        const invTransform = transform.inversed();
        if (!invTransform) {
            MathAssert.warn('transform matrix error!');
            return [];
        }

        const transLine = line.clone().transform(invTransform);
        const tLineDir = transLine.getDirection();
        const tLineOrig = transLine.getOrigin();

        const ra2 = ra * ra;
        const rb2 = rb * rb;
        const a = rb2 * tLineDir.x * tLineDir.x + ra2 * tLineDir.y * tLineDir.y;
        const b = 2 * (rb2 * tLineDir.x * tLineOrig.x + ra2 * tLineDir.y * tLineOrig.y);
        const c = rb2 * tLineOrig.x * tLineOrig.x + ra2 * tLineOrig.y * tLineOrig.y - ra2 * rb2;

        // 柱面与直线平行的情况
        const intersctPts: ICvSurfXInfo[] = [];
        if (a < tol.lengthEps) {
            if (Math.abs(c) < tol.lengthEps) {
                const pt = line.getStartPt();
                const intersectPtInfo: ICvSurfXInfo = {
                    point: pt,
                    curveT: line.getStartParam(),
                    surfaceUV: cylinder.getUVAt(pt),
                    overlapRange: line.getRange(),
                };
                intersctPts.push(intersectPtInfo); // 整条直线都在柱面上
                return intersctPts;
            }

            return [];
        }

        // 柱面与直线不平行的情况
        const sqrTol = tol.lengthEps * tol.lengthEps;
        const discrm = b * b - 4 * a * c;
        const den = (Math.abs(a * c) + b * b) / 2;
        if (discrm / den > sqrTol) {
            const t: number[] = [NaN, NaN];
            t[0] = (-b + Math.sqrt(discrm)) / (2 * a);
            t[1] = (-b - Math.sqrt(discrm)) / (2 * a);

            const r = (ra + rb) / 2;
            if (Math.abs(t[0] - t[1]) / r < tol.numberEps) {
                // 如果半径特别大，但是两个交点距离又大于1e-6，还是认为是相切的
                const tt = -b / (2 * a); // Ray is tangent to side
                if (transLine.getRange().containsPt(tt)) {
                    const pt = transLine.getPtAt(tt).transformed(transform);
                    const intersectPtInfo: ICvSurfXInfo = {
                        point: pt,
                        curveT: tt,
                        surfaceUV: cylinder.getUVAt(pt),
                    };
                    intersctPts.push(intersectPtInfo);
                    return intersctPts;
                }
            }

            if (transLine.getRange().containsPt(t[0])) {
                const pt0 = transLine.getPtAt(t[0]).transformed(transform);
                const intersectPtInfo0: ICvSurfXInfo = {
                    point: pt0,
                    curveT: t[0],
                    surfaceUV: cylinder.getUVAt(pt0),
                };
                intersctPts.push(intersectPtInfo0);
            }
            if (transLine.getRange().containsPt(t[1])) {
                const pt1 = transLine.getPtAt(t[1]).transformed(transform);
                const intersectPtInfo: ICvSurfXInfo = {
                    point: pt1,
                    curveT: t[1],
                    surfaceUV: cylinder.getUVAt(pt1),
                };
                intersctPts.push(intersectPtInfo);
            }

            return intersctPts;

        } else if (Math.abs(discrm / den) <= sqrTol) {
            const t = -b / (2 * a); // Ray is tangent to side
            if (transLine.getRange().containsPt(t)) {
                const pt = transLine.getPtAt(t).transformed(transform);
                const intersectPtInfo: ICvSurfXInfo = {
                    point: pt,
                    curveT: t,
                    surfaceUV: cylinder.getUVAt(pt),
                };
                intersctPts.push(intersectPtInfo);
            }

            return intersctPts;
        }

        return []; // 无解，无交点
    }
}

export { CurveSurfaceX };
