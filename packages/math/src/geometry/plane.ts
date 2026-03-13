import { Coord3 } from '../base/coord3';
import { Vec2 } from '../base/vec2';
import { Vec3 } from '../base/vec3';
import { Ln2 } from './ln2';
import { Ln3 } from './ln3';
import { CoordBasedSurface } from './coord_based_surface';
import { Curve2 } from './curve2';
import { Curve3 } from './curve3d';
import { Util } from '../util/util';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Arc2 } from './arc2d';
import { Arc3 } from './arc3d';
import { Tol } from '../base/tol';
import { Surface } from './surface';
import { SmoothPoly3 } from './smooth_poly3';
import { SmoothPoly2 } from './smooth_poly2';
import { Coord2 } from '../base/coord2';
import * as MatrixUtil from '../base/matrix_util';
import { NurbsCurve3 } from './nurbs_curve3';
import { OffsetCurve3 } from './offset_curve3';
import { NurbsCurve2 } from './nurbs_curve2';
import { OffsetCurve2 } from './offset_curve2';
import { Interval } from '../base/interval';
import { GeomUtil } from '../util/geom_util';



/**
 * 平面
 */
@registerGeo
class Plane extends CoordBasedSurface {
    public static XOY(z: number = 0) {
        return new Plane(new Vec3(0, 0, z), Vec3.X(), Vec3.Y());
    }

    public static YOZ(x: number = 0) {
        return new Plane(new Vec3(x, 0, 0), Vec3.Y(), Vec3.Z());
    }

    public static ZOX(y: number = 0) {
        return new Plane(new Vec3(0, y, 0), Vec3.Z(), Vec3.X());
    }

    /**
     * 通过三个点创建平面. 如果三点共线则为undefined
     */
    public static makeBy3Pts(pt1: types.IXYZ, pt2: types.IXYZ, pt3: types.IXYZ): Plane | undefined {
        const dx = new Vec3(pt2).subtract(pt1).normalize();
        const v = new Vec3(pt3).subtract(pt1);
        const dy = v.subtract(dx.multiplied(v.dot(dx))).normalize();

        if (Util.isNearly0(dx.getLength()) || Util.isNearly0(dy.getLength())) {
            return undefined;
        }

        return new Plane(pt1, dx, dy);
    }

    /**
     * 从一堆不重复的点集计算平面，请尽量保证所有点共面。如果这些点共线，则计算不出平面，返回undefined
     * @param points 一堆点集。根据一堆点集能计算出平面的法向
     * @param refXDir 平面参考的x方向
     */
    public static makeByPoints(points: Vec3[], refXDir?: Vec3): Plane | undefined {
        const normal = GeomUtil.createPlaneFromPts(points);
        if (normal) {
            const plane = Plane.makeByPtNormal(points[0], normal, refXDir);
            return plane;
        }
        return undefined;
    }

    /**
     * 通过点，法向创建一个平面
     * @param pt
     * @param normal
     * @param xDir（可选参数）如果不传，则会自动算出xy的方向
     */
    public static makeByPtNormal(pt: types.IXYZ, normal: types.IXYZ, xDir?: types.IXYZ): Plane {
        if (xDir && !new Vec3(xDir).isParallel(normal)) {
            const y = new Vec3(normal).cross(xDir);
            const x = y.cross(normal);
            return new Plane(pt, x, y);
        }
        return new Plane(pt, normal);
    }

    /**
     * 原点+UV方向,当uv方向不垂直时，以U向为准，调整v向
     * @param origin
     * @param dirU
     * @param dirV
     */
    constructor(origin: types.IXYZ, dirU: types.IXYZ, dirV: types.IXYZ);

    /**
     * 原点+法向， UV方向会自动计算出来
     * @param origin
     * @param norm
     */
    constructor(origin: types.IXYZ, norm: types.IXYZ);

    constructor(coordinate: Coord3);

    constructor(a?: any, b?: types.IXYZ, c?: types.IXYZ) {
        super();

        if (c) {
            this._coord = new Coord3(a, b!, c);
        } else if (b) {
            this._coord = new Coord3(a, b);
        } else if (a) {
            this._coord = (a as Coord3).clone();
        }
    }

    public getOrigin() {
        return this._coord.getOrigin();
    }

    public getNorm() {
        return this._coord.getDz();
    }

    public reverse(): this {
        this._coord.setDy(this._coord.getDy().multiply(-1));
        return this;
    }

    public getUDir() {
        return this._coord.getDx().clone();
    }

    public getVDir() {
        return this._coord.getDy().clone();
    }

    public getPtAt(uv: types.IXY): Vec3 {
        return this._coord.getWorldPtAt(uv);
    }

    public getNormAt(uv: Vec2) {
        return this._coord.getDz();
    }

    /**
     *  获取某参数t处的n阶偏导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)，1阶偏导（包含偏u、偏v），2阶偏导（包含偏uu、偏uv、偏vv）
     */
    public getDerivatives(uv: types.IXY, n: number = 1): Vec3[] {
        const dvts: Vec3[] = [];
        dvts.push(this.getPtAt(uv));

        if (n >= 1) {
            dvts.push(this.getUDir());
            dvts.push(this.getVDir());

            for (let i = 2; i <= n; i++) {
                for (let j = 0; j <= i; j++) {
                    dvts.push(Vec3.O());
                }
            }
        }

        return dvts;
    }

    public getUVAt(pt: types.IXYZ): Vec2 {
        const lp = this._coord.getLocalPtAt(pt);
        return new Vec2(lp.x, lp.y);
    }

    public getLine3DByPts(uv1: types.IXY, uv2: types.IXY): Ln3 {
        const p1 = this.getPtAt(uv1);
        const p2 = this.getPtAt(uv2);
        return new Ln3(p1, p2);
    }

    public getLine3D(line2d: Curve2): Ln3 {
        return this.getLine3DByPts(line2d.getStartPt(), line2d.getEndPt());
    }

    public isRuled(): boolean {
        return true;
    }

    public isParellel(other: Plane, tol = Tol.ANGLE): boolean {
        return this._coord.getDz().isParallel(other._coord.getDz(), tol);
    }

    public isPerpendicular(other: Plane, tol = Tol.ANGLE): boolean {
        return this._coord.getDz().isPerpendicular(other._coord.getDz(), tol);
    }

    public isCoplanar(other: Surface, tol = new Tol()): boolean {
        if (!other.isPlane()) {
            return false;
        }

        return (
            this._coord.getDz().isParallel(other._coord.getDz(), tol.angleEps) &&
            (this.containsPt(other._coord.getOrigin(), tol.lengthEps) ||
                other.containsPt(this._coord.getOrigin(), tol.lengthEps))
        );
    }

    public containsCurve(curve: Curve3, lengthTol = Tol.LENGTH, angleTol = Tol.ANGLE): boolean {
        const containsBaseCurve = (baseCurve: Curve3) => {
            if (baseCurve instanceof Ln3) {
                return (
                    this.containsPt(baseCurve.getStartPt(), lengthTol) &&
                    this.containsPt(baseCurve.getEndPt(), lengthTol)
                );
            }
            if (baseCurve instanceof Arc3) {
                let isOnPlane = this.containsPt(baseCurve.getCoord().getOrigin(), lengthTol);
                isOnPlane = isOnPlane && this._coord.getDz().isParallel(baseCurve.getCoord().getDz(), angleTol);
                return isOnPlane;
            }
            if (baseCurve instanceof NurbsCurve3) {
                const ctrlPts = baseCurve.getControlPoints();
                for (const it of ctrlPts) {
                    if (!this.containsPt(it, lengthTol)) {
                        return false;
                    }
                }
                return true;
            }

            return false;
        };

        if (curve.isLine3d() || curve.isArc3d() || curve.isNurbsCurve3d()) {
            return containsBaseCurve(curve);
        }
        if (curve instanceof OffsetCurve3) {
            const offDistZ = curve.getOffsetZ();
            const baseCv = curve.getBaseCurve();
            if (offDistZ < lengthTol) {
                return containsBaseCurve(baseCv);
            }

            const baseCvMove = baseCv.clone().translate(new Vec3(curve.getDz().multiply(offDistZ)));
            return containsBaseCurve(baseCvMove);
        }
        throw new Error('暂不支持该种类型');
    }

    /**
     * 获取等参曲线
     * @param param 等参曲线处的参数
     * @param useV true 时返回等 v 参数曲线，false 时返回等 u 参数曲线
     */
    public getIsoCurve(param: number, useV: boolean): Curve3 {
        if (useV) {
            const du = this.getUDir();
            const pt = this.getPtAt(new Vec2(0, param));
            return new Ln3(pt, du, Interval.infinitArray());
        }

        const dv = this.getVDir();
        const pt = this.getPtAt(new Vec2(param, 0));
        return new Ln3(pt, dv, Interval.infinitArray());
    }

    /**
     * 返回undefined说明line3d投影成了1个点
     * @param line3d
     */
    public getLine2D(line3d: Ln3): Ln2 | undefined {
        const p1 = this.getUVAt(line3d.getStartPt());
        const p2 = this.getUVAt(line3d.getEndPt());
        if (p1.equals(p2)) {
            return undefined;
        }

        return new Ln2(p1, p2);
    }

    /**
     * 将三维曲线，转成参数域的二维曲线，保证曲线的精确性
     * @param curveOnSurface 在平面上的曲线 // 传入参数时，请保证曲线必须在平面上
     */
    public getCurve2d(curveOnSurface: Curve3): Curve2 {
        const coord3 = this._coord;
        if (curveOnSurface instanceof Ln3) {
            const p1 = coord3.getLocalPtAt(curveOnSurface.getStartPt());
            const p2 = coord3.getLocalPtAt(curveOnSurface.getEndPt());
            return new Ln2(p1, p2);
        }

        if (curveOnSurface instanceof Arc3) {
            const arc = curveOnSurface;
            const dx = coord3.getLocalVectorAt(arc.getCoord().getDx());
            const dy = coord3.getLocalVectorAt(arc.getCoord().getDy());
            const o = coord3.getLocalPtAt(arc.getCoord().getOrigin());
            const coord = new Coord2(o, dx);
            const range = arc.getRange().toArray();
            if (coord.getDy().dot(dy) > 0) {
                return new Arc2(coord, arc.getA(), arc.getB(), true, range);
            }
            return new Arc2(coord, arc.getA(), arc.getB(), false, [range[0], range[1]]);
        }

        if (curveOnSurface instanceof NurbsCurve3) {
            const knots = curveOnSurface.getKnots();
            const degree = curveOnSurface.getDegree();
            const weights = curveOnSurface.getWeights();
            const ctrlPts = curveOnSurface.getControlPoints();
            const ctrlPt2ds = ctrlPts.map(pt => coord3.getLocalPtAt(pt));

            const range = curveOnSurface.getRange();
            return NurbsCurve2.makeByControlPoints(ctrlPt2ds, degree, knots, weights, range.toArray());
        }

        if (curveOnSurface instanceof OffsetCurve3) {
            const baseCurve = curveOnSurface.getBaseCurve();
            const offDistXY = curveOnSurface.getOffsetXY();
            const curve2d = this.getCurve2d(baseCurve);
            const sign = Math.sign(curveOnSurface.getDz().dot(coord3.getDz()));
            return new OffsetCurve2(curve2d, offDistXY * sign, curveOnSurface.getRange().toArray());
        }

        if (curveOnSurface instanceof SmoothPoly3) {
            const pt2ds = curveOnSurface.getPoints().map(pt3d => coord3.getLocalPtAt(pt3d));
            return new SmoothPoly2(pt2ds);
        }

        throw new Error('暂不支持该种类型');
    }

    /**
     * 将参数域中的二维曲线映射到平面上的三维曲线
     * @param curve
     */
    public getCurve3d(curve: Curve2): Curve3 {
        const coord3 = this._coord;
        if (curve instanceof Ln2) {
            return this.getLine3D(curve);
        }

        if (curve instanceof Arc2) {
            const coord = new Coord3(
                coord3.getWorldPtAt(curve.getCoord().getOrigin()),
                coord3.getWorldVectorAt(curve.getCoord().getDx()),
                coord3.getWorldVectorAt(curve.getCoord().getDy()).multiply(curve.isCCW() ? 1 : -1),
            );
            return new Arc3(coord, curve.getA(), curve.getB(), curve.getRange().toArray());
        }

        if (curve instanceof NurbsCurve2) {
            const knots = curve.getKnots();
            const degree = curve.getDegree();
            const weights = curve.getWeights();
            const ctrlPts = curve.getControlPoints();
            const ctrlPt3ds = ctrlPts.map(pt => coord3.getWorldPtAt(pt));

            const range = curve.getRange();
            return NurbsCurve3.makeByControlPoints(ctrlPt3ds, degree, knots, weights, range.toArray());
        }

        if (curve instanceof OffsetCurve2) {
            const baseCurve = curve.getBaseCurve();
            const offDist = curve.getOffset();
            const baseCurve3d = this.getCurve3d(baseCurve);
            return new OffsetCurve3(baseCurve3d, coord3.getDz(), offDist, 0, curve.getRange().toArray());
        }

        if (curve instanceof SmoothPoly2) {
            const pt3ds = curve.getPoints().map(pt2d => this._coord.getWorldPtAt(pt2d));
            return new SmoothPoly3(pt3ds);
        }

        throw new Error('暂不支持该种类型');
    }

    /**
     * 乘上一个变换矩阵
     */
    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        this._coord.transform(m);

        // 处理镜像变换时，保留V向和法向
        const isMirror = MatrixUtil.isMirror(m);
        if (isMirror) {
            this._coord.setDx(this._coord.getDx().reverse());
        }
        return this;
    }

    /**
     *  深拷贝
     */
    public clone(): Plane {
        return super.clone();
    }

    public getType(): EN_GEO_TYPE.PLANE {
        return EN_GEO_TYPE.PLANE;
    }

    /**
     * 抽取元数据，用于序列化
     * @returns 返回js对象
     */
    public dump(): types.IDBPlane {
        return {
            ...super.dump(),
            data: [this._coord.dump()],
        };
    }

    public load(json: types.IDBPlane): this {
        const { data: [coord] } = json;
        this._coord.load(coord);
        return super.load(json);
    }
}

export { Plane };