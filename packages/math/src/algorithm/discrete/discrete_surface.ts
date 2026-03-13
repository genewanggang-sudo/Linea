import { Box2 } from '../../base/box2';
import { DiscreteParam } from '../../base/discrete_param';
import { Interval } from '../../base/interval';
import { PeriodInterval } from '../../base/period_inverval';
import { Tol } from '../../base/tol';
import { Vec } from '../../base/vec';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { Ln2 } from '../../geometry/ln2';
import { Curve } from '../../geometry/curve';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';
import { Surface } from '../../geometry/surface';
import { CONST } from '../../type_define/const';
import { types } from '../../type_define/i_types';
import { UvUtil } from '../../util/uv_util';
import { PtPolygonPositionJudger } from '../pj/pt_polygon_position_judger';
import { PtLoopPJType } from '../pj/pj_type';
import { IMesh2d } from './discrete_refiner';
import { DiscreteUtil } from './discrete_util';
import { DiscreteCurve } from './discrete_curve';
import { uniformGridDiscrete } from './uniform_grid_discrete';
import { Util } from '../../util/util';



interface IUvHint {
    us: number[];
    vs: number[];
}

export type IDirectedCurve = IDirectedCurve2d | IDirectedCurve3d;

export interface IDirectedCurve3d {
    curve: Curve3;
    isSameDirection: boolean;
    startPoint: Vec3;
    endPoint: Vec3;
    discretePts?: Vec3[];
}

export interface IDirectedCurve2d {
    pCurve: Curve2;
}

function isDirectedCurve2d(dCurve: IDirectedCurve): dCurve is IDirectedCurve2d {
    return !!(dCurve as IDirectedCurve2d).pCurve;
}

export class DiscreteSurface {
    /**
     * 根据各参数曲线的离散结果来离散曲面。圆柱、圆锥支持跨周期域造型，椭球暂不支持跨周期域造型（受插点时的内外判定算法限制）
     * @param surface 待离散的曲面
     * @param curveLoops 由有向曲线组成的 Loops。第一个 Loop 为外环，其余为内环。数据会根据需要优化
     * @param surfaceDirection 离散结果是否与曲面默认方向一致
     * @param params 离散参数
     * @param tol 计算容差
     * @param constrainPt3ds 边界约束点
     */
    public static execute(
        surface: Surface,
        curveLoops: IDirectedCurve[][],
        surfaceDirection: boolean = true,
        params = DiscreteParam.NORMAL,
        tol = Tol.DEFAULT,
        constrainPt3ds: Vec3[] = [],
    ): types.IMesh {
        if (constrainPt3ds.length > 0 && !isDirectedCurve2d(curveLoops[0][0])) {
            for (const loop of curveLoops) {
                const loop3d = loop as IDirectedCurve3d[];
                for (let i = 0; i < loop3d.length; i++) {
                    const dirctCv3d = loop3d[i] as IDirectedCurve3d;

                    const cvPts: Vec3[] = [];
                    for (const pt3d of constrainPt3ds) {
                        if (
                            !pt3d.equals(dirctCv3d.startPoint, tol.lengthEps) &&
                            !pt3d.equals(dirctCv3d.endPoint, tol.lengthEps) &&
                            dirctCv3d.curve.containsPt(pt3d, tol.lengthEps)
                        ) {
                            cvPts.push(pt3d);
                        }
                    }

                    if (cvPts.length === 0) {
                        continue;
                    }

                    const splitParams = cvPts.map(_p => dirctCv3d.curve.getParamAt(_p));
                    splitParams.sort();
                    const splitCvs = dirctCv3d.curve.split(splitParams);
                    const directCvs: IDirectedCurve3d[] = [];
                    splitCvs.forEach(_cv =>
                        directCvs.push({
                            curve: _cv,
                            isSameDirection: dirctCv3d.isSameDirection,
                            startPoint: _cv.getStartPt(),
                            endPoint: _cv.getEndPt(),
                        }),
                    );
                    loop3d.splice(i, 1, ...directCvs);
                }
            }
        }

        // 将边离散成点
        const uvEps = UvUtil.getSurfaceUvEps(surface, tol);
        const p2Loops = DiscreteSurface._discreteSurfaceLoops(surface, curveLoops, params, uvEps);
        return this.dircreteFromLoopPts(surface, p2Loops, surfaceDirection, params, uvEps);
    }

    /**
     * 根据已知曲面的loop2ds的离散点，计算surface的离散mesh数据
     * @param surface 曲面
     * @param pt2dsFromLoops loop2ds的离散点，二维数组。一个loop一个数组，多个loop就是二维数组
     * @param surfaceDirection face方向是否与surface同向
     * @param params 离散参数
     */
    public static dircreteFromLoopPts(
        surface: Surface,
        p2Loops: types.IXY[][],
        surfaceDirection: boolean = true,
        params = DiscreteParam.NORMAL,
        uvEps: types.IXY,
    ): types.IMesh {
        if (p2Loops.length === 0 || p2Loops[0].length < 3) return { vertices: [], faces: [], normals: [], uvs: [] };

        // 根据曲面类型离散
        let mesh: types.IMesh | undefined;
        const baseSrf = surface;

        try {
            if (
                baseSrf.isPlane() ||
                baseSrf.isCylinder()
            ) {
                // 离散 v 向直纹面
                const mesh2d = DiscreteUtil.tessVector2(p2Loops);
                mesh = DiscreteSurface.mesh2dto3d(surface, mesh2d);
            } else {
                // 一般情况,包括球面，TODO::开洞的nurbs曲面，网格算法已支持，还需要处理好边界问题后才能支持
                throw Error('暂时不支持的类型');
                // const uvHint = DiscreteSurface._getInnerPointHint(surface, p2Loops, params);
                // const st = performance.now();
                // const mesh2d = GridDiscrete.gridDiscrete(p2Loops, uvHint.us, uvHint.vs);
                // console.log(performance.now() - st);
                // mesh = DiscreteSurface.mesh2dto3d(surface, mesh2d);
            }
        } catch (e) {
            // console.time('uniformGridDiscrete');
            const mesh2d = uniformGridDiscrete(p2Loops, params.maxFaceletCount);
            // console.timeEnd('uniformGridDiscrete');
            mesh = DiscreteSurface.mesh2dto3d(surface, mesh2d);
            // // console.log(e);
            // // 快速离散失败的兜底流程，计算出包含在 loop 内的插值点
            // const uvHint = DiscreteSurface._getInnerPointHint(surface, p2Loops, params);
            // const pt2s = DiscreteSurface._getPointsInside(p2Loops, uvHint, uvEps);

            // try {
            //     // 三角化并优化
            //     const _mesh2d = DiscreteUtil.tessByPoly2tri(p2Loops, pt2s);
            //     mesh = DiscreteRefiner.refine(surface, _mesh2d, params);
            // } catch (w) {
            //     // 因为各种原因离散失败的兜底流程
            //     //
            //     console.warn(w);
            //     const _mesh2d = DiscreteUtil.tessVector2(p2Loops);
            //     mesh = DiscreteSurface.mesh2dto3d(surface, _mesh2d);
            // }
        }

        // 调整曲面朝向
        if (mesh.faces && !surfaceDirection) {
            mesh.faces.forEach(face => {
                [face[0], face[1]] = [face[1], face[0]];
            });
            mesh.normals.forEach(normal => {
                [normal[0], normal[1], normal[2]] = [-normal[0], -normal[1], -normal[2]];
            });
        }
        return mesh;
    }

    /**
     * 计算插值点，用于计算包围盒
     * @param surface
     * @param curveLoops
     * @param params
     * @param tol
     * @returns
     */
    public static simplePoints(
        surface: Surface,
        curveLoops: IDirectedCurve[][],
        params = DiscreteParam.NORMAL,
        tol = Tol.DEFAULT,
    ): types.IXYZ[] {
        const uvEps = UvUtil.getSurfaceUvEps(surface, tol);
        const p2Loops = DiscreteSurface._discreteSurfaceLoops(surface, curveLoops, params, uvEps);
        const retPt2s = p2Loops.flat();
        // 根据曲面类型离散
        if (!(surface.isPlane() || surface.isCylinder())) {
            const uvHint = DiscreteSurface._getInnerPointHint(surface, p2Loops, params);
            const pt2s = DiscreteSurface._getPointsInside(p2Loops, uvHint, uvEps);
            retPt2s.push(...pt2s);
        }

        return retPt2s.map(_ => surface.getPtAt(_));
    }

    public static mesh2dto3d(surface: Surface, mesh2d: IMesh2d): types.IMesh {
        const faces: types.numberArr3[] = [];
        for (let i = 0; i < mesh2d.faces.length; i += 3) {
            faces.push([mesh2d.faces[i], mesh2d.faces[i + 1], mesh2d.faces[i + 2]]);
        }

        return {
            vertices: mesh2d.vertices.map(uv => surface.getPtAt(uv).toArray3()),
            faces,
            normals: mesh2d.vertices.map(uv => surface.getNormAt(uv).toArray3()),
            uvs: mesh2d.vertices.map(uv => [uv.x, uv.y]),
        };
    }

    /**
     * 尝试快速离散类矩形无洞边界
     * @param p2Loops
     * @param faceDir
     * @param uvHint
     * @returns
     */

    /** 将三维曲线转化为二维点环 */
    private static _discreteSurfaceLoops(
        surface: Surface,
        curveLoops: IDirectedCurve[][],
        params: DiscreteParam,
        uvEps: types.IXY,
    ): types.IXY[][] {
        // 初步计算参数曲线点
        const discreteCurveLoops = curveLoops.map(loop =>
            DiscreteSurface._getPCurvePoints(surface, loop, params, uvEps),
        );

        // 计算极点信息
        const uHints: number[] = [];
        let getPoleDiscreteUvs;
        if (uHints.length > 0) {
            const uHintCache = [...uHints, ...uHints.slice(1).map(_ => _ + CONST.PI2)];
            getPoleDiscreteUvs = (pt1: types.IXY, pt2: types.IXY): types.IXY[] => {
                return DiscreteSurface._getPoleDiscreteUvs(pt1, pt2, uHintCache, uvEps.x);
            };
        }

        // 统一相邻曲线的 uv
        UvUtil.unifyUvBetweenCurves(surface, discreteCurveLoops, uvEps, getPoleDiscreteUvs);

        // merge 曲线的首末点
        const p2Loops = UvUtil.connectUvCurves(discreteCurveLoops, uvEps);

        // 跨 loop 统一 uv
        UvUtil.unifyUvBetweenLoops(surface, p2Loops, uvEps);

        return p2Loops;
    }

    /** 将三维曲线转为离散参数曲线点 */
    private static _getPCurvePoints(
        surface: Surface,
        loop: IDirectedCurve[],
        params: DiscreteParam,
        uvEps: types.IXY,
    ): Vec2[][] {
        const candidateMap = new Map<IDirectedCurve, Vec2[][]>();

        // 初始化极点 v 值
        const poleVs: number[] = [];
        // 计算曲线
        const pCurves = loop.map(dCurve => {
            if (isDirectedCurve2d(dCurve)) {
                let asAngle = false;
                if (!asAngle && dCurve.pCurve && (dCurve as any).curve) {
                    asAngle = Util.isNearly0((dCurve as any).curve.getLength());
                }

                if (asAngle) {
                    const cnt = dCurve.pCurve.getRange().getLength() / params.tolerance.angleEps;
                    return dCurve.pCurve.discreteBySegmentCount(cnt);
                }

                return DiscreteUtil.discreteCurve2dOnSurface(dCurve.pCurve, surface, params).uvs;
            }

            if (dCurve.discretePts && dCurve.discretePts.length >= 2) {
                const p2s = dCurve.discretePts.map(p3 => surface.getUVAt(p3));
                // 跨周期的处理
                UvUtil.unifyUvForCurvePts(surface, p2s, uvEps);

                // 优化极点前后的 uv 值
                if (poleVs.length > 0) {
                    if (poleVs.find(_ => Math.abs(p2s[0].y - _) < uvEps.y) !== undefined) {
                        p2s[0].x = p2s[1].x;
                    }
                    if (poleVs.find(_ => Math.abs(p2s[p2s.length - 1].y - _) < uvEps.y) !== undefined) {
                        p2s[p2s.length - 1].x = p2s[p2s.length - 2].x;
                    }
                }
                return p2s;
            }

            const pCurve = DiscreteSurface._getSimplePCurve(surface, dCurve, Tol.DEFAULT);
            if (pCurve) {
                const p = DiscreteCurve.getSpecificParams(dCurve.curve, params);
                return DiscreteUtil.discreteCurve2dOnSurface(pCurve, surface, p).uvs;
            }

            // 对于未提供参数曲线的，离散曲线，并反求参数
            const dCrv3d = dCurve as IDirectedCurve3d;
            let p3s: Vec3[];
            if (
                dCrv3d.curve.isLine3d() ||
                (dCrv3d.curve.isNurbsCurve() && dCrv3d.curve.getControlPoints().length === 2)
            ) {
                p3s = [dCrv3d.startPoint, dCrv3d.endPoint];
            } else {
                p3s = DiscreteUtil.discreteCurve3d(dCrv3d.curve, params);
                if (!p3s || p3s.length <= 1) {
                    p3s = [dCrv3d.curve.getStartPt(), dCrv3d.curve.getEndPt()];
                }
                if (!dCrv3d.isSameDirection) p3s.reverse();
                // p3s[0] = dCrv3d.startPoint;
                // p3s[p3s.length - 1] = dCrv3d.endPoint;
            }

            // p3s => p2s
            let p2s: Vec2[] = [];
            {
                p2s = p3s.map(p3 => surface.getUVAt(p3));

                // 优化极点前后的 uv 值
                if (poleVs.length > 0) {
                    if (poleVs.find(_ => Math.abs(p2s[0].y - _) < uvEps.y) !== undefined) {
                        p2s[0].x = p2s[1].x;
                    }
                    if (poleVs.find(_ => Math.abs(p2s[p2s.length - 1].y - _) < uvEps.y) !== undefined) {
                        p2s[p2s.length - 1].x = p2s[p2s.length - 2].x;
                    }
                }
            }
            return p2s;
        });

        // 处理扫掠面自交的情况
        if (candidateMap.size > 0) {
            for (let i = 0; i < loop.length; i++) {
                const nextPCurveStPt = pCurves[(i + 1) % loop.length][0];
                const tmpPCurve = pCurves[i];
                const tmpPCurveEndPt = tmpPCurve[tmpPCurve.length - 1];
                let tmpDist = tmpPCurveEndPt.sqDistanceTo(nextPCurveStPt);
                if (tmpDist > 1e-8) {
                    const candidates = candidateMap.get(loop[i]);
                    if (!candidates) {
                        continue;
                    }

                    for (let j = 1; j < candidates.length; j++) {
                        const candidate = candidates[j];
                        const stPt = candidate[candidate.length - 1];
                        const canDist = stPt.sqDistanceTo(nextPCurveStPt);
                        if (canDist < tmpDist) {
                            tmpDist = canDist;
                            pCurves[i] = candidates[j];
                        }
                    }
                }
            }
        }

        return pCurves;
    }

    /** 尝试获取一些复杂曲面的简单参数曲线，用于边面每次都反求参数，以提升离散速度 */
    private static _getSimplePCurve(surface: Surface, dCurve: IDirectedCurve3d, tol: Tol): Curve2 | undefined {
        return undefined;
    }

    /**
     * 给定极点处参数曲线的首尾端点，返回需要差值的点
     * @param pt1 首点
     * @param pt2 尾点
     * @param uHintCache 插值时的参考u值，范围为 [0～2 period]，包含首尾点
     * @param uEps u向容差
     */
    private static _getPoleDiscreteUvs(pi: types.IXY, pj: types.IXY, uHints: number[], uEps: number): types.IXY[] {
        const poleV = (pi.y + pj.y) / 2;
        const period = (uHints[uHints.length - 1] - uHints[0]) / 2;

        const [st0, ed0] = pi.x < pj.x ? [pi.x, pj.x] : [pj.x, pi.x];
        const base = Math.floor(st0 / period) * period;
        const st = st0 - base;
        const ed = ed0 - base;
        let sti = 0;
        while (st > uHints[sti] - uEps && sti < uHints.length) sti++;

        let edi = sti;
        while (ed > uHints[edi] + uEps && edi < uHints.length) edi++;

        const newUs = uHints.slice(sti, edi);
        if (pi.x > pj.x) newUs.reverse();
        return newUs.map(_ => {
            return { x: _, y: poleV };
        });
    }

    /** 根据曲面类型分别计算u向、v向插值点密度 */
    private static _getInnerPointHint(
        srf: Surface,
        p2Loops: types.IXY[][],
        hintParams: DiscreteParam,
        useFullHint = false,
    ): IUvHint {
        const params = hintParams.enableSurfaceRefiner ? hintParams.ratioed(2) : hintParams;

        if (srf.isPlane()) {
            return {
                us: [],
                vs: [],
            };
        }

        const box = new Box2();
        for (const loop of p2Loops) {
            box.expandByPoint(...loop);
        }
        const rangeU = new Interval(box.min.x, box.max.x);
        const rangeV = new Interval(box.min.y, box.max.y);
        let us: number[] = [];
        let vs: number[] = [];

        function getInnerHints<PointType extends Vec>(curve: Curve<PointType>, range?: Interval): number[] {
            const xBasePath0 = curve;
            const rets = DiscreteUtil.discreteCurve(xBasePath0, params).map(_ => _.param);

            if (!useFullHint) {
                const start = rets.shift()!;
                rets.unshift(start + (rets[0] - start) * DiscreteParam.BorderScale);
                const end = rets.pop()!;
                rets.push(end - (end - rets[rets.length - 1]) * DiscreteParam.BorderScale);
            }
            // rets.unshift();
            // rets.pop();
            return rets;
        }

        return { us, vs };
    }

    /** 筛选插值点，得到处于 loop 范围内的插值点 */
    private static _getPointsInside(p2Loops: types.IXY[][], hint: IUvHint, uvEps: types.IXY): types.IXY[] {
        const judger = new PtPolygonPositionJudger(p2Loops);
        const ret: types.IXY[] = [];
        for (const u of hint.us) {
            for (const v of hint.vs) {
                const uv = { x: u, y: v };
                if (judger.judge(uv, Math.max(uvEps.x, uvEps.y)) === PtLoopPJType.IN) {
                    ret.push(uv);
                }
            }
        }
        return ret;
    }
}