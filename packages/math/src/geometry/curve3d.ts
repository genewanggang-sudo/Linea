
import { Curve } from './curve';
import { types } from '../type_define/i_types';
import { Box3 } from '../base/box3';
import { ICurve3dTransformExtra, IGeometry3d } from '../type_define/i_geometry';
import { Matrix4 } from '../base/matrix4';
import { Interval } from '../base/interval';
import { Vec3 } from '../base/vec3';
import { DiscreteParam } from '../base/discrete_param';
import { DiscreteCurve } from '../algorithm/discrete/discrete_curve';
import { MathAssert } from '../util/assert';
import { Line3dToLine3dDistanceParamed } from '../algorithm/distance/curve3ds_distance/line3d_to_line3d_distance_paramed';
import { verb } from '../verb/export_verb';



/**
 * 三维参数曲线
 */
abstract class Curve3 extends Curve<Vec3> implements IGeometry3d {
    /**
     * 乘上一个变换矩阵，改变自己
     */
    public abstract transform(m: types.IMatrix4 | types.numberArrs4X4, extra?: ICurve3dTransformExtra): this;

    /**
     * 转成nurbs曲线
     */
    public abstract toVerbNurbs(range?: Interval): verb.geom.NurbsCurve;

    /**
     * 计算曲线在给定参数区间的包围盒，计算效率更高，但是包的没有BoundingBox紧凑
     * @param range
     */
    public getBox(range?: Interval): Box3 {
        return this.getBBox(range);
    }

    /**
     *  计算曲线在给定参数区间的紧包围盒，如果没有传入参数域则计算曲线默认参数域的包围盒
     */
    public getBBox(range?: Interval): Box3 {
        const { min, max } = this._range;
        if (range) this.setRange(range);
        const singularities = this.getSingularities();
        const splitRanges = this._range.splited(...singularities);

        const box = new Box3();

        for (const r of splitRanges) {
            // 离散 + 局部包围盒
            // 对于 nurbs, 应计算其曲率拐点，并额外插点
            const pts = DiscreteCurve.execute(this.setRange(r), DiscreteParam.LOW);
            const tans: Vec3[] = [];

            for (let i = 0; i < pts.length; i++) {
                tans.push(this.getTangentAt(pts[i].param, i !== 0));
            }

            box.expandByPoint(pts[0].point);

            for (let i = 1; i < pts.length; i++) {
                box.expandByPoint(pts[i].point);
                if (tans[i].isParallel(tans[i - 1])) continue;

                const params = Line3dToLine3dDistanceParamed.execute(
                    pts[i - 1].point,
                    pts[i].point,
                    tans[i - 1],
                    tans[i],
                );
                if (params[0] > 0 && params[1] < 0) {
                    box.expandByPoint(pts[i - 1].point.add(tans[i - 1].multiply(params[0])));
                } else {
                    MathAssert.mutedWarn(false, '曲率拐点未处理');
                }
            }
        }
        this.setRange(min, max);
        return box;
    }

    /**
     * 平移，改变自己
     */
    public translate(offset: types.IXYZ): this {
        const matrix4 = Matrix4.makeTranslate(offset);
        return this.transform(matrix4);
    }

    /**
     * 绕坐标轴/点的旋转，改变自己
     * @param angle 旋转的角度
     * @param pivot 旋转轴上一点
     * @param axis  绕哪个轴旋转
     */
    public rotate(angle: number, pivot: types.IXYZ, axis?: types.IXYZ): this {
        // 默认绕着z轴旋转
        const fixedAxis = axis || { x: 0, y: 0, z: 1 };
        const matrix = Matrix4.makeRotate(pivot, fixedAxis, angle);
        return this.transform(matrix);
    }

    /**
     * 缩放，改变自己
     * 直线支持非等比，其他情况都是等比例缩放
     * @param factor 放大因子
     * @param center 缩放中心
     */
    public scale(factor: number, center: types.IXYZ): this {
        const m = Matrix4.makeScale(center, factor);
        return this.transform(m);
    }

    /**
     * 变换，得到变换后新的曲线对象
     * @param m
     */
    public transformed(m: types.IMatrix4 | types.numberArrs4X4, extra?: ICurve3dTransformExtra): Curve3 {
        return this.clone().transform(m, extra);
    }

    /**
     * 判断Curve3d是否是平面曲线
     * 如果是平面曲线：并且能构造一个平面，则返回平面的法向；不能构造平面的，例如是一条直线的，只返回true；如果不是平面曲线(即空间曲线)，返回false
     */
    public isPlaneCurve3d(angleTol?: number): boolean | Vec3 {
        return false;
    }

    /**
     * 依据给定参数点，将曲线分割成多段。如果参数点都不在曲线上，则返回空的数组
     * @param param
     * @param tolerance
     */
    public split(params: number[], tolerance?: number): Curve3[] {
        const ranges = this._range.splited(...params);
        return ranges.map(range => {
            const crv = this.clone();
            crv.setRange(range);
            return crv;
        });
    }

    public reversed(): Curve3 {
        return this.clone().reverse();
    }

    public clone(): Curve3 {
        return super.clone() as any;
    }
}

export { Curve3 };

