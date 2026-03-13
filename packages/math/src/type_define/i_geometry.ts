import type { types } from './i_types';
import type { Vec } from '../base/vec';
import type { Box } from '../base/box';
import type { Vec2 } from '../base/vec2';
import type { Vec3 } from '../base/vec3';
import type { Box2 } from '../base/box2';
import type { Curve } from '../geometry/curve';
import type { PeriodInterval } from '../base/period_inverval';
import type { Interval } from '../base/interval';
import type { Coord } from '../base/coord';
import type { OffsetParameterMapper } from '../geometry/offset_parameter_mapper';



export interface ITransformExtra {
    svd?: types.IMatrix3Svd | types.IMatrix4Svd;
    // 代表当前几何的范围（无限大几何转nurbs会有性能问题，所以应尽量缩小）
    range?: Interval | Box2;
}

export interface ICurve2dTransformExtra extends ITransformExtra {
    svd?: types.IMatrix3Svd;
    // 代表当前几何的范围（无限大几何转nurbs会有性能问题，所以应尽量缩小）
    range?: Interval;
}

export interface ICurve3dTransformExtra extends ITransformExtra {
    svd?: types.IMatrix4Svd;
    // 代表当前几何的范围（无限大几何转nurbs会有性能问题，所以应尽量缩小）
    range?: Interval;
}

export interface ISurfaceTransformExtra extends ITransformExtra {
    svd?: types.IMatrix4Svd;
    // 代表当前几何的范围（无限大几何转nurbs会有性能问题，所以应尽量缩小）
    range?: Box2;
}

/**
 * @author tiansk
 *  所有几何对象的基类
 */
export interface IGeometry<IMatrixArray extends number[][], PointType extends Vec> {
    /**
     * 乘上一个变换矩阵，改变自己
     */
    transform(m: types.IMatrix<IMatrixArray> | IMatrixArray, extra?: ITransformExtra): this;

    /**
     * 计算包围盒
     */
    getBBox(): Box<PointType>;

    /**
     * 平移，改变自己
     */
    translate(offset: types.IXY | PointType): this;

    /**
     * 绕坐标轴/点的旋转，改变自己
     * @param angle 旋转的角度
     * @param pivot 旋转轴上一点
     * @param axis  绕哪个轴旋转
     */
    rotate(angle: number, pivot: types.IXY, axis?: types.IXY): this;

    /**
     * 缩放，改变自己
     * 直线支持非等比，其他情况都是等比例缩放
     * @param factor 放大因子
     * @param center 缩放中心
     */
    scale(factor: number, center: types.IXY): this;
}

export interface IGeometry2d extends IGeometry<types.numberArrs3X3, Vec2> {
    /**
     * 乘上一个变换矩阵，改变自己
     */
    transform(m: types.IMatrix3 | types.numberArrs3X3, extra?: ITransformExtra): this;
}

export interface IGeometry3d extends IGeometry<types.numberArrs4X4, Vec3> {
    /**
     * 乘上一个变换矩阵，改变自己
     */
    transform(m: types.IMatrix4 | types.numberArrs4X4, extra?: ITransformExtra): this;
}

export interface ILine<VectorType extends Vec> extends Curve<VectorType> {
    reset(start: types.IXY, end: types.IXY): void;

    /**
     * 获取原点（参数为零的点）
     */
    getOrigin(): VectorType;

    /**
     * 设置原点（参数为零的点）
     */
    setOrigin(origin: types.IXY): void;

    /**
     *  获取方向向量
     */
    getDirection(): VectorType;

    /**
     *  获取方向向量
     */
    setDirection(dir: types.IXY): void;

    /**
     * 转换成无限长直线，返回新对象
     */
    toInfiniteLine(): ILine<VectorType>;

    clone(): ILine<VectorType>;
}

export interface IArc<VectorType extends Vec> extends Curve<VectorType> {
    /**
     * 获取 a 轴长度
     */
    getA(): number;

    /**
     * 设置 a 轴长度
     */
    setA(v: number): void;

    /**
     * 获取 b 轴长度
     */
    getB(): number;

    /**
     * 设置 b 轴长度
     */
    setB(v: number): void;

    /**
     * 获取参数范围
     */
    getRange(): PeriodInterval;

    /**
     * 获取圆心
     */
    getCenter(): VectorType;

    /**
     * 获取半径长度
     * @deprecated 目前已支持 ab 长短周，请以获取半轴长替代
     */
    getRadius(): number;

    /**
     * 获取当前坐标系
     */
    getCoord(): Coord<VectorType>;

    /**
     * 判断是否为封闭圆形
     */
    isClosed(): boolean;

    /**
     * 获取圆弧上，两点之间的参数域范围，沿着参数增加的方向
     * @param startPt
     * @param endPt
     */
    getParamRangeAt(startPt: types.IXY, endPt: types.IXY): PeriodInterval;

    /**
     * 椭圆长短轴是否相等
     */
    isEqualAB(): boolean;

    clone(): IArc<VectorType>;
}

export interface IExtendCurve<VectorType extends Vec> extends Curve<VectorType> {
    getBaseCurve(): Curve<VectorType>;

    setBaseCurve(curve: Curve<VectorType>): void;

    updateExtension(): void;

    /**
     * 根据参数域，将其分割为多条简单曲线
     */
    toSimpleCurves(): Curve<VectorType>[];

    // extendCurve的头尾参数域做了缩放，返回缩放比例
    getHeadScale(): number;

    // extendCurve的头尾参数域做了缩放，返回缩放比例
    getTailScale(): number;

    clone(): IExtendCurve<VectorType>;
}

export interface INurbsCurve<VectorType extends Vec> extends Curve<VectorType> {
    getDegree(): number;

    getWeights(): number[];

    getKnots(): number[];

    getControlPoints(): VectorType[];

    /**
     * 获取定义域，参数 t 超过该范围无法求值
     * range 为定义域上的一部分，用于裁切曲线
     */
    getDomain(): Interval;

    /**
     * 获取曲线上的弧长等分点，返回的第一个和最后一个分别为曲线的起点和终点
     * @param count 等分点数量，数目限制最小为3
     * @returns 单位切向量
     */
    getEqualDiversionPts(count: number): VectorType[];

    /**
     * 在参数 t 处将 Nurbs 曲线切分为两部分 // 分割成两条完全独立的nurbs，对控制顶点做了重新计算
     * @param t 切分点处的参数
     * @param useRange 若真，则根据原参数域进行同步切分；若假，则切分得到的曲线以定义域作为参数域
     * @return 返回切分得到的参数曲线，并会根据原参数域设置新的参数域。若参数有误则返回空数组
     */
    splitCurve(t: number, useRange?: boolean): INurbsCurve<VectorType>[];

    clone(): INurbsCurve<VectorType>;
}

export interface IOffsetCurve<VectorType extends Vec> extends Curve<VectorType> {
    /**
     * curve should be emutable!
     */
    getBaseCurve(): Curve<VectorType>;

    getDomain(): Interval;

    getParamMapper(): OffsetParameterMapper;

    clone(): IOffsetCurve<VectorType>;
}