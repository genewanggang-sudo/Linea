import { Coord3 } from '../base/coord3';
import { Vec2 } from '../base/vec2';
import { Vec3 } from '../base/vec3';
import { MathAssert } from '../util/assert';
import { Ln2 } from './ln2';
import { Ln3 } from './ln3';
import { Curve2 } from './curve2';
import { Curve3 } from './curve3d';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Arc3 } from './arc3d';
import { Tol } from '../base/tol';
import { PeriodInterval } from '../base/period_inverval';
import { CircularSurface } from './circular_surface';
import { Surface } from './surface';
import { CONST } from '../type_define/const';
import { Interval } from '../base/interval';
import { CurvesColinear } from '../algorithm/overlap/curves_colinear';
import { Arc2 } from './arc2d';



/**
 *
 * 圆柱面, U向参数域[0, 2PI*r], V向参数域[-OO, +OO]
 * 构造整跨周期 Brep 圆柱面时，需添加 Edge 连接上下两侧 Edge，从而形成外环
 */
@registerGeo
class Cylinder extends CircularSurface {
    public static makeCylinderByArc3d(arc3: Arc3) {
        return new Cylinder(arc3.getCoord(), arc3.getA(), arc3.getB());
    }

    constructor();

    constructor(coord: Coord3, a: number);

    constructor(coord: Coord3, a: number, b: number);

    constructor(coord?: Coord3, a?: number, b?: number) {
        super();
        if (coord && a !== undefined) {
            this._coord = coord.clone();
            this._a = a;
            this._b = b === undefined ? a : b;
        }
    }

    public getRadius(): number {
        MathAssert.assert(this.isEqualAB(Tol.NUMBER_CALC_EPS), '椭圆柱调用了获取圆半径函数 getRadius()');
        return (this._a + this._b) / 2;
    }

    public getCenterAxis() {
        return this._coord.getDz();
    }

    public getPtAt(uv: types.IXY): Vec3 {
        return this.getCoord().getWorldPtAt({
            x: this._a * Math.cos(uv.x),
            y: this._b * Math.sin(uv.x),
            z: uv.y,
        });
    }

    public getNormAt(uv: Vec2) {
        const vec = {
            x: this._b * Math.cos(uv.x),
            y: this._a * Math.sin(uv.x),
            z: 0,
        };
        return this._coord.getWorldVectorAt(vec).normalize();
    }

    public isRuled(): boolean {
        return true;
    }

    /**
     *  获取某参数t处的n阶偏导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)，1阶偏导（包含偏u、偏v），2阶偏导（包含偏uu、偏uv、偏vv）
     */
    public getDerivatives(uv: types.IXY, n: number = 1): Vec3[] {
        const dvts: Vec3[] = [];
        const ra = this._a;
        const rb = this._b;

        const cosu = Math.cos(uv.x);
        const sinu = Math.sin(uv.x);
        const acos = ra * cosu;
        const bsin = rb * sinu;

        const pt = new Vec3(acos, bsin, uv.y);
        dvts.push(this._coord.getWorldPtAt(pt));
        if (n <= 0) return dvts;

        const du = new Vec3(-ra * sinu, rb * cosu, 0);
        dvts.push(this._coord.getWorldVectorAt(du));
        dvts.push(this._coord.getDz());
        if (n <= 1) return dvts;

        const duu = new Vec3(-acos, -bsin, 0);
        dvts.push(this._coord.getWorldVectorAt(duu));
        dvts.push(new Vec3(0, 0, 0));
        dvts.push(new Vec3(0, 0, 0));
        if (n <= 2) return dvts;

        const duuu = new Vec3(ra * sinu, -rb * cosu, 0);
        dvts.push(this._coord.getWorldVectorAt(duuu));
        dvts.push(new Vec3(0, 0, 0));
        dvts.push(new Vec3(0, 0, 0));
        dvts.push(new Vec3(0, 0, 0));
        if (n <= 3) return dvts;

        const duuuu = new Vec3(acos, bsin, 0);
        dvts.push(this._coord.getWorldVectorAt(duuuu));
        dvts.push(new Vec3(0, 0, 0));
        dvts.push(new Vec3(0, 0, 0));
        dvts.push(new Vec3(0, 0, 0));
        dvts.push(new Vec3(0, 0, 0));
        if (n <= 4) return dvts;

        throw new Error('n > 4高阶导数计算未实现！');
    }

    /**
     * 获取三维点处的uv值，（反求参数）
     * @param uv
     */
    public getUVAt(pt: types.IXYZ): Vec2 {
        const lp = this._coord.getLocalPtAt(pt);
        const u = Math.atan2(lp.y / this._b, lp.x / this._a);
        return new Vec2(PeriodInterval.RegularizeParam(u), lp.z);
    }

    // 是否和另一个圆柱面完全重叠
    public isCoplanar(other: Surface, tol = new Tol()): boolean {
        if (!other.isCylinder()) {
            return false;
        }

        const surf2 = other as Cylinder;
        const coord1 = this.getCoord();
        const coord2 = surf2.getCoord();
        const axisLine1 = new Ln3(coord1.getOrigin(), coord1.getDz(), Interval.infinitArray());
        const axisLine2 = new Ln3(coord2.getOrigin(), coord2.getDz(), Interval.infinitArray());
        if (!CurvesColinear.lines(axisLine1, axisLine2, tol)) {
            return false;
        }

        const a1 = this.getA();
        const b1 = this.getB();

        const a2 = surf2.getA();
        const b2 = surf2.getB();

        if (Math.abs(a1 - b1) < tol.lengthEps) {
            return Math.abs(a2 - b2) < tol.lengthEps && Math.abs(a1 + b1 - a2 - b2) < tol.lengthEps * 2; // 圆
        }
        if (Math.abs(a1 - a2) < tol.lengthEps) {
            return Math.abs(b1 - b2) < tol.lengthEps && coord1.getDx().isParallel(coord2.getDx(), tol.angleEps); // aa 对齐
        }
        if (Math.abs(a1 - b2) < tol.lengthEps) {
            return Math.abs(a2 - b1) < tol.lengthEps && coord1.getDx().isPerpendicular(coord2.getDx(), tol.angleEps); // ab 对齐
        }
        return false;
    }

    public containsCurve(curve: Curve3, eps: number = Tol.NUMBER): boolean {
        if (curve instanceof Ln3) {
            const stPt = curve.getStartPt();
            const uv1 = this.getUVAt(stPt);
            const stSqrDist = this.getPtAt(uv1).sqDistanceTo(stPt);
            if (stSqrDist > eps * eps) {
                return false;
            }

            const endPt = curve.getEndPt();
            const uv2 = this.getUVAt(endPt);
            const endSqrDist = this.getPtAt(uv2).sqDistanceTo(endPt);
            if (endSqrDist > eps * eps) {
                return false;
            }
            return PeriodInterval.areEqual(uv1.x, uv2.x, CONST.PI2, eps);
        }
        if (curve instanceof Arc3) {
            const arc = curve as Arc3;
            return (
                this.containsPt(arc.getPtAt(0)) &&
                this.containsPt(arc.getPtAt(CONST.PI_2)) &&
                this.containsPt(arc.getPtAt(CONST.PI2)) &&
                this.containsPt(arc.getPtAt(CONST.PI * 1.5))
            );
        }

        return false;
    }

    public getDomainU(): PeriodInterval {
        return new PeriodInterval(0, CONST.PI2);
    }

    /**
     * 获取等参曲线
     * @param param 等参曲线处的参数
     * @param useV true 时返回等 v 参数曲线，false 时返回等 u 参数曲线
     */
    public getIsoCurve(param: number, useV: boolean): Curve3 {
        if (useV) {
            const coord = this._coord.translated(this._coord.getDz().multiply(param));
            return new Arc3(coord, this._a, this._b, [0, CONST.PI2]);
        }

        const pt = this.getPtAt(new Vec2(param, 0));
        return new Ln3(pt, this.getCenterAxis(), Interval.infinitArray());
    }

    /**
     * 将参数域中的二维曲线转成三维曲线
     * 暂时只支持直线(横平竖直，斜的需要定义椭圆)
     * @param curve
     */
    public getCurve3d(curve: Curve2): Curve3 {
        if (curve.getType() === EN_GEO_TYPE.LN_2) {
            const line = curve as Ln2;
            const dir = line.getDirection();
            const st = line.getStartPt();
            const ed = line.getEndPt();

            if (dir.isParallel(Vec2.X())) {
                // 转换成三维圆弧
                const o = this._coord.getWorldPtAt({ x: 0, y: 0, z: (st.y + ed.y) / 2 });
                const dx = this._coord.getDx();
                const dy = this._coord.getDy();

                if (dir.x > 0) {
                    return new Arc3(new Coord3(o, dx, dy), this._a, this._b, [st.x, ed.x]);
                }
                return new Arc3(new Coord3(o, dx, dy.multiply(-1)), this._a, this._b, [-st.x, -ed.x]);
            }
            if (dir.isParallel(Vec2.Y())) {
                // 转换成直线
                return new Ln3(this.getPtAt(st), this.getPtAt(ed));
            }
        }
        return super.getCurve3d(curve);
    }

    /**
     * 乘上一个变换矩阵
     * 注意：柱面若是镜像，若想镜像后u参数不变，点正好镜像，则v参数一定会相反（z轴会反了）；反之，若想v参数不变，点正好镜像，则u参数一定会相反（x或者y轴会反了）
     *      为了保持一致，统一让v参数不变。因为考虑到镜像锥面，如果做了yoz镜像之后，z轴反了，锥面会明显倒过来。而考虑到u向是周期的，直接反u参数会更好
     *      【原来的点镜像之后到新的点，新的点和原来的点的v参数相同，但是u参数变成了-u。这个地方curve2d相关的处理时需要注意。】
     */
    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        // const _svd = svd || Matrix4.make(m, false).decompose();
        // const equalScale =
        //     Math.abs(Math.abs(_svd.scale.y / _svd.scale.x) - 1) < Tol.NUMBER &&
        //     Math.abs(Math.abs(_svd.scale.z / _svd.scale.x) - 1) < Tol.NUMBER;
        // if (equalScale) {
        //     const vec = this._coord.getWorldPtAt({ x: this._a, y: this._b, z: 0 });
        //     this._coord.transform(m);
        //     const newVec = this._coord.getLocalPtAt(vec.transform(m));
        //     this._a = newVec.x;
        //     this._b = newVec.y;

        //     if (Matrix4.isSvdMirror(_svd)) {
        //         this._coord.setDy(this._coord.getDy().multiply(-1));
        //     }

        //     return this;
        // }

        // 柱面，即使非等比缩放，柱面的z向就是原dz做了transform之后的dz
        // 柱面的方程和arc3d的一样？因为z与xy完全无关。所以原点和z轴变换后，根据圆柱中心轴得到一个坐标系tcoord。再将arc3d做transform后，然后投影到这个坐标系上的平面上就是圆柱面的xy
        const tOrigin = this._coord.getOrigin().transform(m);
        const A = this._coord.getDx().multiply(this._a).vecTransform(m);
        const B = this._coord.getDy().multiply(this._b).vecTransform(m);
        const tdz = this._coord.getDz().vecTransform(m).normalized();

        let tdx: Vec3;
        let tdy: Vec3;
        if (A.normalized().isPerpendicular(B.normalized())) {
            tdx = A; // 不旋转
            tdy = B;
        } else {
            const beta = Math.atan2(2 * A.dot(B), A.getSqLength() - B.getSqLength()) * 0.5;
            const sinx = Math.sin(beta);
            const cosx = Math.cos(beta);
            tdx = A.multiplied(cosx).add(B.multiplied(sinx)); // x轴旋转beta角度
            tdy = A.multiplied(-sinx).add(B.multiplied(cosx)); // y轴旋转beta角度
        }

        // tdz垂直xy平面的，不用投影
        if (tdz.isPerpendicular(tdx) && tdz.isPerpendicular(tdy)) {
            if (A.cross(B).dot(tdz) < 0) {
                tdy.multiply(-1); // 因为要保证u参数不变，x轴位置必须保持，这样才能保证u的起始点参数不变。tdx，tdy是圆弧变换后正确的x轴、y轴位置，保持x轴不变，反y轴
            }

            this._a = tdx.getLength();
            this._b = tdy.getLength();
            this._coord = new Coord3(tOrigin, tdx, tdy);
            return this;
        }

        // 将3d椭圆投影到平面内，计算投影的椭圆2d参数
        // // 这样直接投影不对，投影后可能椭圆的长短轴位置发生了改变，需要重新计算
        // const projTDx = tdy.cross(tdz);
        // const projTDy = tdz.cross(tdx);
        // const scaleX = Math.cos(projTDx.angle(tdx)); // 将tdx轴投影到平面上的projTDx轴缩短了scaleX
        // const scaleY = Math.cos(projTDy.angle(tdy)); // 将tdy轴投影到平面上的projTDy轴缩短了scaleY
        // this._a = tdx.getLength() * scaleX;
        // this._b = tdy.getLength() * scaleY;

        const arc3Coord = new Coord3(tOrigin, tdx, tdy);
        const a = tdx.getLength();
        const b = tdy.getLength();
        const arc3d = new Arc3(arc3Coord, a, b);
        const coord3 = new Coord3(tOrigin, tdz);
        const pts = [arc3d.getPtAt(0), arc3d.getPtAt(CONST.PI_4), arc3d.getPtAt(CONST.PI_2)];
        const localPts = pts.map(_p => coord3.getLocalPtAt(_p));
        const arc2 = Arc2.makeEllipseByCenterAndThreePoints(Vec2.O(), localPts);
        if (!arc2) {
            throw new Error('');
        }

        const worldDx = coord3.getWorldVectorAt(arc2.getCoord().getDx());
        const worldDy = coord3.getWorldVectorAt(arc2.getCoord().getDy());
        this._coord = new Coord3(tOrigin, worldDx, worldDy);
        this._a = arc2.getA();
        this._b = arc2.getB();
        return this;
    }

    /**
     *  深拷贝
     */
    public clone(): Cylinder {
        return super.clone();
    }

    public getType(): EN_GEO_TYPE.CYLINDER {
        return EN_GEO_TYPE.CYLINDER;
    }

    /**
     * 抽取元数据，用于序列化
     * @returns 返回js对象
     */
    public dump(): types.IDBCylinder {
        return {
            ...super.dump(),
            data: [this._coord.dump(), this._a, this._b],
        };
    }

    public load(json: types.IDBCylinder): this {
        const { data: [coord, a, b] } = json;
        this._coord.load(coord);
        this._a = a;
        this._b = b;
        return super.load(json);
    }
}

export { Cylinder };