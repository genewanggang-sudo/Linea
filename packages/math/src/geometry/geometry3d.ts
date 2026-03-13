import { types } from '../type_define/i_types';
import { Box3 } from '../base/box3';
import { IGeometry3d, ITransformExtra } from '../type_define/i_geometry';
import { Matrix4 } from '../base/matrix4';
import { GeoElement } from '../base/geo_element';



/**
 * @author tiansk
 *  所有几何对象的基类
 */
export abstract class Geometry3d extends GeoElement implements IGeometry3d {
    /**
     * 乘上一个变换矩阵，改变自己
     */
    public abstract transform(m: types.IMatrix4 | types.numberArrs4X4, extra?: ITransformExtra): this;

    /**
     * 计算包围盒
     */
    public abstract getBBox(): Box3;

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
}