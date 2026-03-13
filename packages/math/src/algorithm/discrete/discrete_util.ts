import * as poly2tri from 'poly2tri';
import { LibtessVertex, tessTriangulate } from './libtess';



import { types } from '../../type_define/i_types';
import { Vec } from '../../base/vec';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { Tol } from '../../base/tol';
import { DiscreteParam } from '../../base/discrete_param';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';
import { Surface } from '../../geometry/surface';
import { Ln2 } from '../../geometry/ln2';
import { Util } from '../../util/util';
import { MathAssert } from '../../util/assert';

import { IMesh2d, DiscreteRefiner } from './discrete_refiner';
import { Curve } from '../../geometry/curve';
import { DiscreteSurface, IDirectedCurve } from './discrete_surface';
import { DiscreteCurve, IParamedPoint } from './discrete_curve';

interface IXYWithID extends types.IXY {
    id: number;
}

/**
 * @author tiansk
 * 离散算法，对曲线、曲面离散算法进行了封装
 */
class DiscreteUtil {
    private static readonly _POLY2TRI_ANGLE_EPS = 1e-10;

    /**
     * 调用 Libtess 进行离散，适用于直纹面
     * @param loops
     * @param stepLenth
     * @param startIdx
     */
    public static tessVector2(loops: types.IXY[][]): IMesh2d {
        // 所有的顶点
        const ret: IMesh2d = {
            vertices: [],
            faces: [],
        };

        const inputs: LibtessVertex[][] = loops.map(loop =>
            loop.map(p => {
                const tessV = new LibtessVertex(p, ret.vertices.length);
                ret.vertices.push(p);
                return tessV;
            }),
        );

        let tessVertices: number[][];
        try {
            tessVertices = tessTriangulate(inputs, [0, 0, 1]);
        } catch (error) {
            MathAssert.warn(true, '离散化错误', loops);
            return ret;
        }

        // libtess 在离散过程中，有可能会新增加一些二维点
        const getVertexIndex = (vData: any) => {
            if (vData.index !== undefined) {
                return (vData as LibtessVertex).index;
            }
            ret.vertices.push(new Vec2(vData));
            return ret.vertices.length - 1;
        };

        ret.faces = tessVertices.map(v => getVertexIndex(v));
        return ret;
    }

    /**
     * 调用 poly2tri 进行离散，适用一般曲面
     * @param loops
     * @param points
     * @returns
     */
    public static tessByPoly2tri(loops: types.IXY[][], points: types.IXY[] = []): IMesh2d {
        // 预处理，直线化
        for (const loop of loops) {
            let st = 0;
            while (st < loop.length - 2) {
                let ed = st + 1;
                for (let i = st + 2; i < loop.length; i++) {
                    const dp = new Vec2(loop[i - 1]).subtract(loop[st]);
                    const dir = new Vec2(loop[i]).subtract(loop[st]);
                    const angle = dp.angle(dir);
                    if (Math.abs(angle) < DiscreteUtil._POLY2TRI_ANGLE_EPS) {
                        ed = i;
                    } else {
                        break;
                    }
                }
                if (ed > st + 1) {
                    const dir = new Vec2(loop[ed]).subtract(loop[st]).normalize();
                    const dirX = new Vec2(-dir.y, dir.x);
                    for (let i = st + 1; i < ed; i++) {
                        const dp = new Vec2(loop[i]).subtract(loop[st]);
                        loop[i] = new Vec2(loop[i]).subtract(dirX.multiplied(dp.dot(dirX)));
                    }
                }
                st = ed;
            }
        }

        let id = 0;
        const vertices: IXYWithID[] = [];
        const eps = Tol.NUMBER;
        const mul = 1 / eps;
        const newLoops = loops.map(loop =>
            loop.map(p => {
                const np = { x: Math.round(p.x * mul) * eps, y: Math.round(p.y * mul) * eps, id: id++ }; // trim to avoid poly2tri bug
                vertices.push(np);
                return np;
            }),
        );
        const newPoints = points.map(p => {
            const np = { x: p.x, y: p.y, id: id++ };
            vertices.push(np);
            return np;
        });
        const swctx = new poly2tri.SweepContext(newLoops[0]);
        swctx.addHoles(newLoops.slice(1));
        swctx.addPoints(newPoints);
        swctx.triangulate();
        const triangles = swctx.getTriangles();
        const faces: number[] = [];
        triangles.forEach(tri => tri.getPoints().forEach(p => faces.push((p as IXYWithID).id)));
        return { vertices, faces };
    }

    /**
     * 离散二维直线段，按照给定的步距
     * @param line2d
     * @param stepLenth
     */
    public static discreteLine2d(line2d: Ln2, stepLenth: number): Ln2[] {
        const curve2ds: Ln2[] = [];
        const range = line2d.getRange();
        const count = Math.floor(range.getLength() / stepLenth);
        let startPt2d = line2d.getStartPt();
        for (let i = 1; i <= count; i++) {
            const pt = line2d.getPtAt(range.min + stepLenth * i);
            curve2ds.push(new Ln2(startPt2d, pt));
            startPt2d = pt;
        }
        if (!startPt2d.equals(line2d.getEndPt(), Tol.LENGTH)) {
            curve2ds.push(new Ln2(startPt2d, line2d.getEndPt()));
        }
        return curve2ds;
    }

    /**
     * 离散二维曲线
     * @param curve 曲线
     * @param params 离散参数
     */
    public static discreteCurve2d(curve: Curve2, params = DiscreteParam.NORMAL): Vec2[] {
        const ret = DiscreteCurve.execute(curve, params);
        return ret.map(_ => _.point);
    }

    /**
     * 离散三维曲线
     * @param curve 曲线
     * @param params 离散参数
     */
    public static discreteCurve3d(curve: Curve3, params = DiscreteParam.NORMAL): Vec3[] {
        const ret = DiscreteCurve.execute(curve, params);
        return ret.map(_ => _.point);
    }

    /**
     * 离散三维曲线
     * @param curve 曲线
     * @param params 离散参数
     */
    public static discreteCurve<PointType extends Vec>(
        curve: Curve<PointType>,
        params: DiscreteParam,
    ): IParamedPoint<PointType>[] {
        return DiscreteCurve.execute(curve, params);
    }

    /**
     * 根据曲面曲率离散其参数曲线
     * @param curve 参数曲线
     * @param surface 曲面
     * @param params 离散参数
     */
    public static discreteCurve2dOnSurface(
        curve: Curve2,
        surface: Surface,
        params = DiscreteParam.NORMAL,
    ): { points: Vec3[]; uvs: Vec2[] } {
        const map = new Map<Vec3, Vec2>();
        const func = (t: number) => {
            const uv = curve.getPtAt(t);
            const pt = surface.getPtAt(uv);
            map.set(pt, uv);
            return pt;
        };

        const domainU = surface.getDomainU();
        const domainV = surface.getDomainV();
        const getTangentFunc = (t: number) => {
            const uv = curve.getPtAt(t);
            const pt = surface.getPtAt(uv);
            const uv2 = curve.getPtAt(t + 1e-5);
            if (domainU.containsPt(uv2.x) && domainV.containsPt(uv2.y)) {
                const pt2 = surface.getPtAt(uv2);
                return pt2.subtracted(pt).multiplied(1e5);
            }

            const uv3 = curve.getPtAt(t - 1e-5);
            const pt3 = surface.getPtAt(uv3);
            return pt3.subtracted(pt).multiplied(-1e5);
        };

        if (curve.isLine2d()) {
            const st = curve.getStartPt();
            const ed = curve.getEndPt();
            const ret = { points: [surface.getPtAt(st), surface.getPtAt(ed)], uvs: [st, ed] };

            if (surface.isPlane()) {
                return ret;
            }

            if (surface.isCylinder()) {
                if (Util.isNearlyEqual(st.x, ed.x)) {
                    return ret;
                }
            }
        }

        const sgls = curve.getSingularities();
        const pts = DiscreteUtil.discreteGeneralCurve(func, getTangentFunc, curve.getRange().toArray(), sgls, params);

        const points: Vec3[] = [];
        const uvs: Vec2[] = [];
        for (const pt of pts) {
            points.push(pt.point);
            uvs.push(map.get(pt.point)!);
        }
        return { points, uvs };
    }

    public static discreteGeneralCurve<PointType extends Vec>(
        getPoint: (t: number) => PointType,
        getTangent: (t: number) => PointType,
        range: types.IInterval,
        singularities: number[] = [],
        params: DiscreteParam,
    ): IParamedPoint<PointType>[] {
        return DiscreteCurve.general(getPoint, getTangent, range, singularities, params);
    }

    /**
     * 根据各参数曲线的离散结果来离散曲面。圆柱、圆锥支持跨周期域造型，椭球暂不支持跨周期域造型（受插点时的内外判定算法限制）
     * @param surface 待离散的曲面
     * @param curveLoops 由有向曲线组成的 Loops。第一个 Loop 为外环，其余为内环。数据会根据需要优化
     * @param surfaceDirection 离散结果是否与曲面默认方向一致
     * @param params 离散参数
     * @param tol 计算容差
     */
    public static discreteSurface(
        surface: Surface,
        curveLoops: IDirectedCurve[][],
        surfaceDirection: boolean = true,
        params = DiscreteParam.NORMAL,
        tol = Tol.DEFAULT,
        constrainPt3ds: Vec3[] = [],
    ): types.IMesh {
        return DiscreteSurface.execute(surface, curveLoops, surfaceDirection, params, tol, constrainPt3ds);
    }

    /**
     * 将面离散成点
     * @param surface
     * @param curveLoops
     * @param params
     * @param tol
     * @returns
     */
    public static discreteSurfaceIntoPoints(
        surface: Surface,
        curveLoops: IDirectedCurve[][],
        params = DiscreteParam.NORMAL,
        tol = Tol.DEFAULT,
    ): types.IXYZ[] {
        return DiscreteSurface.simplePoints(surface, curveLoops, params, tol);
    }

    /**
     * 使用细分三角边的方式对 Mesh 进行优化
     * @param surface 待离散的曲面
     * @param mesh2d 二维离散结果
     * @param params 离散参数
     */
    public static refineMesh3d(surface: Surface, mesh2d: IMesh2d, params = DiscreteParam.NORMAL): types.IMesh {
        return DiscreteRefiner.refine(surface, mesh2d, params);
    }
}

export { DiscreteUtil };