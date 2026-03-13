import { types } from '../type_define/i_types';
import { Box2 } from '../base/box2';
import { Matrix3 } from '../base/matrix3';
import { GeoElement } from '../base/geo_element';
import { IGeometry2d, ITransformExtra } from '../type_define/i_geometry';



/**
 * @author tiansk
 *  所有几何对象的基类
 */
export abstract class Geometry2d extends GeoElement implements IGeometry2d {
    /**
     * 乘上一个变换矩阵，改变自己
     */
    public abstract transform(m: types.IMatrix3 | types.numberArrs3X3, extra?: ITransformExtra): this;

    /**
     * 计算包围盒
     */
    public abstract getBBox(): Box2;

    /**
     * 平移，改变自己
     */
    public translate(offset: types.IXY): this {
        const matrix4 = Matrix3.makeTranslate(offset);
        return this.transform(matrix4);
    }

    /**
     * 绕坐标轴/点的旋转，改变自己
     * @param angle 旋转的角度
     * @param pivot 旋转轴上一点
     */
    public rotate(angle: number, pivot: types.IXYZ): this {
        const matrix = Matrix3.makeRotate(pivot, angle);
        return this.transform(matrix);
    }

    /**
     * 缩放，改变自己
     * 直线支持非等比，其他情况都是等比例缩放
     * @param factor 放大因子
     * @param center 缩放中心
     */
    public scale(factor: number, center: types.IXY): this {
        const m = Matrix3.makeScale(center, factor);
        return this.transform(m);
    }
}