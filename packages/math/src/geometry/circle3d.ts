import { CONST } from '../type_define/const';
import { Curve3 } from './curve3d';
import { types } from '../type_define/i_types';
import { Vec3 } from '../base/vec3';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Interval } from '../base/interval';
import { registerGeo } from '../loader/register_geo';
import { Coord3 } from '../base/coord3';
import { Box3 } from '../base/box3';
import { Plane } from './plane';
import { Tol } from '../base/tol';
import { DiscreteParam } from '../base/discrete_param';
import { DiscreteUtil } from '../algorithm/discrete/discrete_util';
import { geom } from '../verb/verb';



/**
 *
 * @deprecated 使用 Arc3 代替
 * 三维整圆
 */
@registerGeo
export class Circle3d extends Curve3 {
    /**
     * 创建整圆：使用圆心，局部坐标系x方向，局部坐标系y方向，半径
     */
    public static makeCircleByCCSRadius(
        origin: types.IXYZ,
        xDir: types.IXYZ,
        yDir: types.IXYZ,
        radius: number,
    ): Circle3d {
        return new Circle3d(new Coord3(origin, xDir, yDir), radius);
    }

    /**
     * 创建整圆：使用起点，中点，终点
     * @param point1
     * @param point2
     * @param point3
     * @return 创建出来的圆或者为空（如果三点共线）
     */
    public static makeCircleByThreePoints(
        point1: types.IXYZ,
        point2: types.IXYZ,
        point3: types.IXYZ,
    ): Circle3d | undefined {
        const ccs = Circle3d._makeCircleCCSByThreePoints(new Vec3(point1), new Vec3(point2), new Vec3(point3));
        if (!ccs) {
            return undefined;
        }
        const radius: number = ccs.getOrigin().distanceTo(point1);
        return new Circle3d(ccs, radius);
    }

    private static _makeCircleCCSByThreePoints(
        point1: Vec3,
        point2: Vec3,
        point3: Vec3,
    ): Coord3 | undefined {
        // 获取法向
        const plane = Plane.makeBy3Pts(point1, point2, point3);
        if (!plane) {
            return undefined;
        }

        const normal = plane.getNorm();

        // 计算圆心
        const mid1 = point1.clone().interpolate(point2, 0.5);
        const mid2 = point2.clone().interpolate(point3, 0.5);
        const dir1 = point2.subtracted(point1).normalize();
        const dir2 = point3.subtracted(point2).normalize();
        const perp1 = normal.cross(dir1);
        const perp2 = normal.cross(dir2);

        const crossVec = perp1.cross(perp2);
        const pointDiff = mid2.subtracted(mid1);
        const denormVec = crossVec.multiplied(-1);
        const normVec = perp2.cross(pointDiff);
        let t1 = normVec.getLength() / denormVec.getLength();
        if (denormVec.dot(normVec) < 0) {
            t1 = -t1;
        }

        const center = mid1.added(perp1.multiplied(t1));
        const dx = point1.subtracted(center).normalize();
        const dy = normal.cross(dx);
        return new Coord3(center, dx, dy);
    }

    private _ccs = Coord3.XOY();

    private _radius = 0;

    constructor();

    constructor(ccs: Coord3, radius: number);

    constructor(ccs?: Coord3, radius?: number) {
        super();
        if (ccs && radius) {
            this._ccs = ccs.clone();
            this._radius = radius;
            this._range = new Interval(0, CONST.PI2 * radius);
        }
    }

    public toVerbNurbs(range?: Interval | undefined): geom.NurbsCurve {
        throw new Error('Method not implemented.');
    }

    public getCCS(): Coord3 {
        return this._ccs.clone();
    }

    public getCenter(): Vec3 {
        return this._ccs.getOrigin();
    }

    public getNormal(): Vec3 {
        return this._ccs.getDz();
    }

    public getRadius(): number {
        return this._radius;
    }

    /**
     * 获取某参数对应的点
     */
    public getPtAt(t: number): Vec3 {
        const angle = t / this._radius;
        const dx = this._ccs.getDx();
        const dy = this._ccs.getDy();

        const dir = dx.multiply(Math.cos(angle)).add(dy.multiply(Math.sin(angle)));
        const vec = dir.multiply(this._radius);
        return this.getCenter().add(vec);
    }

    /**
     *  获取曲线(给定参数域区间段的)长度
     */
    public getLength(range?: Interval): number {
        throw new Error('暂时还没有实现');
    }

    /**
     *  获取某点对应的参数
     */
    public getParamAt(point: types.IXYZ): number {
        const lp = this._ccs.getLocalPtAt(point);
        return Math.atan2(lp.y, lp.x) * this._radius;
    }

    /**
     * 获取某参数处的切线
     */
    public getTangentAt(t: number): Vec3 {
        const point = this.getPtAt(t);
        point.subtract(this.getCenter());
        const tangent = this.getNormal().cross(point);
        return tangent.normalize();
    }

    /**
     * 判断Curve3d是否是平面曲线
     * 如果是平面曲线：并且能构造一个平面，则返回平面的法向；不能构造平面的，例如是一条直线的，只返回true；如果不是平面曲线(即空间曲线)，返回false
     */
    public isPlaneCurve3d(angleTol?: number): boolean | Vec3 {
        return this._ccs.getDz();
    }

    /**
     *  获取某参数t处的几阶导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)、1阶导、2阶导
     */
    public getDerivatives(t: number, n: number): Vec3[] {
        throw new Error('未实现！');
    }

    /**
     * 暂时不支持整圆反向
     */
    public reverse(): this {
        throw new Error('not implement');
    }

    /**
     *  曲线按给定距离进行偏移
     * @param dDist 等距量：>0 = 右侧；<0 = 左侧
     * @returns 是否等距成功：true = 是；false = 否
     */
    public offset(dDist: number): boolean {
        const newRadius = this._radius + dDist;
        if (newRadius < Tol.LENGTH) {
            return false;
        }
        this._radius = newRadius;
        this._range = new Interval(0, CONST.PI2 * this._radius);
        return true;
    }

    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        this._radius = new Vec3(this._radius, 0, 0).vecTransform(m).getLength();
        this._ccs.transform(m);
        this._range = new Interval(0, CONST.PI2 * this._radius);
        return this;
    }

    /**
     * 计算包围盒 // circle默认是全domain的，传入range不work
     */
    public getBBox(range?: Interval): Box3 {
        const bounding = new Box3();
        const center = this.getCenter();

        // 添加X轴方向的最大点和最小点
        bounding.expandByPoint(this.getProjectedPtBy(center.clone().add(Vec3.X())));
        bounding.expandByPoint(this.getProjectedPtBy(center.clone().add(Vec3.X().reverse())));

        // 添加Y轴方向的最大点和最小点
        bounding.expandByPoint(this.getProjectedPtBy(center.clone().add(Vec3.Y())));
        bounding.expandByPoint(this.getProjectedPtBy(center.clone().add(Vec3.Y().reverse())));

        // 添加Z轴方向的最大点和最小点
        bounding.expandByPoint(this.getProjectedPtBy(center.clone().add(Vec3.Z())));
        bounding.expandByPoint(this.getProjectedPtBy(center.clone().add(Vec3.Z().reverse())));

        return bounding;
    }

    public split(params: number[], tolerance?: number): Curve3[] {
        throw new Error('暂未实现');
    }

    /**
     * 离散
     */
    public discrete(params = DiscreteParam.NORMAL): Vec3[] {
        const tol = params.tolerance;
        const refAngle = Math.acos(1 - tol.lengthEps / this._radius) * 2;
        const n = this._range.getLength() / this._radius / Math.min(refAngle, tol.angleEps);
        return DiscreteUtil.discreteCurve3d(this, params.clone({ hintSegmentCount: n + 2 }));
    }

    public getType(): EN_GEO_TYPE.CIRCLE_3 {
        return EN_GEO_TYPE.CIRCLE_3;
    }

    public clone(): Circle3d {
        return new Circle3d(this._ccs, this._radius);
    }

    /**
     * 抽取元数据，用于序列化
     */
    public dump(): types.IDBCircle3d {
        return {
            ...super.dump(),
            data: [this._ccs.dump(), this._radius],
        };
    }

    public load(json: types.IDBCircle3d) {
        const { data: [ccs, radius] } = json;
        this._ccs.load(ccs);
        this._radius = radius;
        this._range = new Interval(0, CONST.PI2 * radius);
        return super.load(json);
    }
}

