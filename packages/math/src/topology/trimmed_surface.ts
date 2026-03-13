import { Box3 } from '../base/box3';
import { Tol } from '../base/tol';
import { Vec2 } from '../base/vec2';
import { Vec3 } from '../base/vec3';
import { DiscreteParam } from '../base/discrete_param';
import { Coord3 } from '../base/coord3';
import { Surface } from '../geometry/surface';
import { Curve2 } from '../geometry/curve2';
import { Curve3 } from '../geometry/curve3d';
import { Cylinder } from '../geometry/cylinder';
import { Plane } from '../geometry/plane';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Loader } from '../loader/loader';
import { Polygon } from './polygon';
import { Loop } from './loop';
import { PtPolygonPJ } from '../algorithm/pj/pt_polygon_pj';
import { PtLoopPJType } from '../algorithm/pj/pj_type';
import { DiscreteUtil } from '../algorithm/discrete/discrete_util';
import { Interval } from '../base/interval';
import { ISurfaceTransformExtra } from '../type_define/i_geometry';



/**
 *
 * 裁剪曲面，描述无界曲面上的一个有边界的区域
 */
@registerGeo
class TrimmedSurface extends Surface {
    /**
     * 根据给定坐标系与边界半长，生成表示平面
     * @param coord
     * @param halfLength
     * @param halfWide
     */
    public static createPlane(coord: Coord3, halfLength: number, halfWide?: number): TrimmedSurface {
        const points = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ];
        const halfWideLength = halfWide || halfLength;
        const xys = points.map(p => {
            return { x: p[0] * halfLength, y: p[1] * halfWideLength };
        });
        return new TrimmedSurface(new Plane(coord), new Polygon(xys), true);
    }

    /**
     * 从uv边界创建
     * @param surface 底层的无限大曲面
     * @param uRange u的参数域
     * @param vRange v的参数域
     * @param isPositive 是否同向的标记
     */
    public static createByRangeUV(
        surface: Surface,
        uRange: Interval,
        vRange: Interval,
        isPositive: boolean = true,
    ): TrimmedSurface {
        const loopPts: Vec2[] = [
            new Vec2(uRange.min, vRange.min),
            new Vec2(uRange.max, vRange.min),
            new Vec2(uRange.max, vRange.max),
            new Vec2(uRange.min, vRange.max),
        ];
        const poly: Polygon = new Polygon(new Loop(loopPts));
        return new TrimmedSurface(surface, poly, isPositive);
    }

    /**
     * 从二维边界创建
     * @param surface 底层的无限大曲面
     * @param uvPolygon 无限大曲面上，二维区域的边界
     * @param isPositive 是否同向的标记
     */
    public static createByBoundary2d(surface: Surface, uvLoops: Curve2[][], isPositive: boolean): TrimmedSurface {
        const loop3ds = uvLoops.map(uvLoop => uvLoop.map(curve2d => surface.getCurve3d(curve2d)));
        const uvPolygon = new Polygon(uvLoops.map(loop => new Loop(loop)));
        const trimmed = new TrimmedSurface(surface, uvPolygon, isPositive, loop3ds);
        return trimmed;
    }

    /**
     * 从三维边界创建
     * @param surface 底层的无限大曲面
     * @param loop3ds 无限大曲面上，三维区域的边界
     * @param isPositive 是否同向的标记
     */
    public static createByBoundary3d(surface: Surface, loop3ds: Curve3[][], isPositive: boolean): TrimmedSurface {
        if (surface instanceof Plane || surface instanceof Cylinder) {
            const uvLoops = loop3ds.map(loop3d => new Loop(surface.wireToUV(loop3d).loop));
            const trimmed = new TrimmedSurface(surface, new Polygon(uvLoops), isPositive, loop3ds);
            return trimmed;
        }
        throw new Error('not implemented');
    }

    // 底层的无限大曲面
    private _surface: Surface;

    // 正反面标记
    private _bPositive: boolean = true;

    // 无限大曲面uv参数域上的边界
    private _uvPolygon: Polygon;

    // 无限大曲面三维上的边界（计算数据）
    private _loops: Curve3[][];

    constructor();

    constructor(surface: Surface, uvLoops: Polygon, isPositive: boolean, loops?: Curve3[][]);

    constructor(a?: Surface, b?: Polygon, c?: boolean, d?: Curve3[][]) {
        super();
        if (!a || !b || c === undefined) {
            return;
        }

        this._surface = a;
        this._uvPolygon = b;
        this._bPositive = c;
        this._loops =
            d ||
            this._uvPolygon.getLoops().map(loop => loop.getAllCurves().map(curve => this._surface.getCurve3d(curve)));
    }

    /**
     * 获取底层无限大的曲面
     */
    public getSurface(): Surface {
        return this._surface;
    }

    /**
     * 是否和无限大的曲面同向
     */
    public getSameDirWithSurface(): boolean {
        return this._bPositive;
    }

    /**
     * 获取无限大曲面uv参数域上的边界
     */
    public getUVPolygon(): Polygon {
        return this._uvPolygon;
    }

    /**
     * 获取无限大曲面三维上的边界
     */
    public getLoops(): ReadonlyArray<ReadonlyArray<Curve3>> {
        return this._loops;
    }

    public reverse(): this {
        this._bPositive = !this._bPositive;
        return this;
    }

    public getPtAt(uv: types.IXY): Vec3 {
        return this._surface.getPtAt(uv);
    }

    public getNormAt(uv: types.IXY) {
        return this._surface.getNormAt(uv).multiply(this._bPositive ? 1 : -1);
    }

    /**
     *  获取某参数t处的n阶偏导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)，1阶偏导（包含偏u、偏v），2阶偏导（包含偏uu、偏uv、偏vv）
     */
    public getDerivatives(uv: types.IXY, n: number = 1): Vec3[] {
        const baseSurface = this._surface;
        return baseSurface.getDerivatives(uv, n);
    }

    public getUVAt(pt: types.IXYZ): Vec2 {
        return this._surface.getUVAt(pt);
    }

    public containsPt(point: types.IXYZ, tol: number = Tol.LENGTH): boolean {
        if (!this._surface.containsPt(point, tol)) {
            return false;
        }

        const uv = this._surface.getUVAt(point);
        const ret = PtPolygonPJ.execute(uv, this._uvPolygon, tol);
        if (ret !== PtLoopPJType.OUT) {
            return true;
        }
        return false;
    }

    public containsCurve(curve: Curve3, tol: number = Tol.LENGTH): boolean {
        if (!this._surface.containsCurve(curve, tol)) {
            return false;
        }
        const curve2d = this.getCurve2d(curve);
        if (!curve2d) {
            return false;
        }

        // TODO... 实现二维曲线和环的位置关系判断
        throw new Error('not implemented');
    }

    public getDomainU(): Interval {
        return this._surface.getDomainU();
    }

    public getDomainV(): Interval {
        return this._surface.getDomainV();
    }

    /**
     * 获取等参曲线
     * @param param 等参曲线处的参数
     * @param useV true 时返回等 v 参数曲线，false 时返回等 u 参数曲线
     */
    public getIsoCurve(param: number, useV: boolean): Curve3 {
        // todo: 需要裁剪，暂时没做
        return this._surface.getIsoCurve(param, useV);
    }

    /**
     * 将三维曲线，转成参数域中的二维曲线
     * @param curveOnSurface
     */
    public getCurve2d(curveOnSurface: Curve3): Curve2 {
        // TODO... 处理跨周期的问题，保证curve2d在uvPolygon内部
        return this._surface.getCurve2d(curveOnSurface);
    }

    /**
     * 将参数域中的二维曲线转成三维曲线
     * @param curve
     */
    public getCurve3d(curve: Curve2): Curve3 {
        return this._surface.getCurve3d(curve);
    }

    /**
     *
     *  计算包围盒
     */
    public getBBox(): Box3 {
        const box = new Box3();
        if (this._loops.length < 1) {
            return box;
        }
        for (const curve3d of this._loops[0]) {
            box.union(curve3d.getBBox());
        }
        return box;
    }

    /**
     * 是否和另一个曲面面完全重叠
     * @param other
     * @param tol
     */
    public isCoplanar(other: Surface, tol: Tol): boolean {
        return this._surface.isCoplanar(other, tol);
    }

    /**
     * 乘上一个变换矩阵
     */
    public transform(mt: types.IMatrix4 | types.numberArrs4X4, extra?: ISurfaceTransformExtra): this {
        this._surface.transform(mt, extra);
        this._loops.forEach(loop => loop.forEach(c => c.transform(mt, { svd: extra?.svd })));
        this._updateUvs();
        return this;
    }

    /**
     * 几何变换，得到新的几何对象
     * @param m
     */
    public transformed(m: types.IMatrix4 | types.numberArrs4X4, extra?: ISurfaceTransformExtra): TrimmedSurface {
        return this.clone().transform(m, extra);
    }

    /**
     *  深拷贝
     */
    public clone(): TrimmedSurface {
        const loops = this._loops.map(lp => lp.map(crv => crv.clone()));
        const obj = new TrimmedSurface(this._surface.clone(), this._uvPolygon.clone(), this._bPositive, loops);
        obj.userData = this.userData;
        return obj;
    }

    public getType(): EN_GEO_TYPE.TRIM {
        return EN_GEO_TYPE.TRIM;
    }

    /**
     * 抽取元数据，用于序列化
     * @returns 返回js对象
     */
    public dump(): types.IDBTrimmedSur {
        return {
            type: this.getType(),
            data: [this._surface.dump(), this._bPositive, this._uvPolygon.dump()],
        };
    }

    public load({ data: [sur, flag, uvPolygon] }: types.IDBTrimmedSur): this {
        this._surface = Loader.load(sur) as Surface;
        this._bPositive = flag;
        this._uvPolygon = Loader.load(uvPolygon) as Polygon;
        this._loops = this._uvPolygon.getLoops().map(loop => loop.getAllCurves().map(c => this.getCurve3d(c)));

        return this;
    }

    public tessellate(
        params = DiscreteParam.NORMAL,
        tol = Tol.DEFAULT,
    ): types.IRenderNode {
        const mesh = this.discrete(params, tol);
        return {
            mesh,
        };
    }

    public discrete(params = DiscreteParam.NORMAL, tol = Tol.DEFAULT): types.IMesh {
        const uvLoops = this._uvPolygon.getLoops();
        const dLoops = uvLoops.map(loop => loop.getAllCurves().map(pCurve => ({ pCurve })));
        const mesh = DiscreteUtil.discreteSurface(this._surface, dLoops, this._bPositive, params, tol);
        return mesh;
    }

    private _updateUvs() {
        this._uvPolygon = new Polygon(this._loops.map(loop3d => new Loop(this._surface.wireToUV(loop3d).loop)));
    }
}

export { TrimmedSurface };