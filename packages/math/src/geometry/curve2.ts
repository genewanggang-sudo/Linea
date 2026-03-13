import { Box2 } from '../base/box2';
import { Curve } from './curve';
import { types } from '../type_define/i_types';
import { Matrix3 } from '../base/matrix3';
import { Vec2 } from '../base/vec2';
import { ICurve2dTransformExtra, IGeometry2d } from '../type_define/i_geometry';
import { Interval } from '../base/interval';
import { DiscreteParam } from '../base/discrete_param';
import { MathAssert } from '../util/assert';
import { LinesXUtil } from '../algorithm/intersect/curves_x/lines_x_util';
import { DiscreteCurve } from '../algorithm/discrete/discrete_curve';



/**
 *  二维曲线的基类，所有二维曲线都是参数曲线，且是弧长参数化曲线
 */
abstract class Curve2 extends Curve<Vec2> implements IGeometry2d {
    /**
     *  曲线按给定距离进行偏移
     * @param distance 等距量：>0 = 右侧；<0 = 左侧
     * @returns 是否等距成功：true = 是；false = 否
     * @deprecated 使用 OffsetCurve2.makeByCurve() 来代替
     */
    public abstract offset(distance: number): boolean;

    /**
     * 乘上一个变换矩阵，改变自己（圆弧，暂时只支持等比例缩放）
     */
    public abstract transform(m: types.IMatrix3 | types.numberArrs3X3, extra?: ICurve2dTransformExtra): this;

    /**
     * 计算曲线在给定参数区间的包围盒，计算效率更高，但是包的没有BoundingBox紧凑
     * @param range
     */
    public getBox(range?: Interval): Box2 {
        return this.getBBox(range);
    }

    /**
     *  计算曲线在给定参数区间的包围盒，如果没有传入参数域则计算曲线默认参数域的包围盒
     */
    public getBBox(range?: Interval): Box2 {
        const { min, max } = this._range;
        if (range) this.setRange(range);
        const singularities = this.getSingularities();
        const splitRanges = this._range.splited(...singularities);

        const box = new Box2();

        for (const r of splitRanges) {
            // 离散 + 局部包围盒
            // 对于 nurbs, 应计算其曲率拐点，并额外插点
            const pts = DiscreteCurve.execute(this.setRange(r), DiscreteParam.LOW);
            const tans: Vec2[] = [];

            for (let i = 0; i < pts.length; i++) {
                tans.push(this.getTangentAt(pts[i].param, i !== 0));
            }

            box.expandByPoint(pts[0].point);

            for (let i = 1; i < pts.length; i++) {
                box.expandByPoint(pts[i].point);
                if (tans[i].isParallel(tans[i - 1])) continue;

                const params = LinesXUtil.line2dsParamed(
                    pts[i - 1].point,
                    pts[i].point,
                    tans[i - 1],
                    tans[i],
                );
                if (params[0] > 0 && params[1] < 0) {
                    const pt = pts[i - 1].point.add(tans[i - 1].multiply(params[0]));
                    box.expandByPoint(pt);
                } else {
                    // console.log(i, params[0], params[1], pts[i - 1], pts[i], tans[i - 1], tans[i]);
                    MathAssert.warn(false, '曲率拐点未处理');
                }
            }
        }

        this.setRange(min, max);
        return box;
    }

    /**
     * 依据给定参数点，将曲线分割成多段。如果参数点都不在曲线上，则返回空的数组
     * @param param
     * @param tolerance
     */
    public split(params: number[], tolerance?: number): Curve2[] {
        const ranges = this._range.splited(...params);
        return ranges.map(range => {
            const crv = this.clone();
            crv.setRange(range);
            return crv;
        });
    }

    /**
     * 平移，改变自己
     */
    public translate(offset: types.IXY): this {
        const matrix = Matrix3.makeTranslate(offset);
        return this.transform(matrix);
    }

    /**
     * 绕坐标轴/点的旋转，改变自己
     * @param angle 旋转的角度
     * @param pivot 旋转轴上一点
     */
    public rotate(angle: number, pivot: types.IXY = { x: 0, y: 0 }): this {
        const matrix = Matrix3.makeRotate(pivot, angle);
        return this.transform(matrix);
    }

    /**
     * 缩放，改变自己
     * 直线支持非等比，其他情况都是等比例缩放
     * @param factor 放大因子
     * @param center 缩放中心
     */
    public scale(factor: number, center: types.IXY = { x: 0, y: 0 }): this {
        const m = Matrix3.makeScale(center, factor);
        return this.transform(m);
    }

    /**
     * 变换，得到变换后新的曲线对象
     * @param m
     */
    public transformed(m: types.IMatrix3 | types.numberArrs3X3, extra?: ICurve2dTransformExtra): Curve2 {
        return this.clone().transform(m, extra);
    }

    public reversed(): Curve2 {
        return this.clone().reverse();
    }

    public clone(): Curve2 {
        return super.clone() as any;
    }
}

export { Curve2 };