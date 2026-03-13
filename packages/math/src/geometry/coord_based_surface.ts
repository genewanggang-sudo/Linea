import { Surface } from './surface';
import { Coord3 } from '../base/coord3';
import { types } from '../type_define/i_types';
import { Matrix4 } from '../base/matrix4';



export abstract class CoordBasedSurface extends Surface {
    protected _coord: Coord3 = new Coord3();

    /**
     * 获取局部坐标系
     */
    public getCoord(): Coord3 {
        return this._coord;
    }

    /**
     * 设置局部坐标系
     */
    public setCoord(v: Coord3) {
        this._coord = v.clone();
    }

    /**
     * 平移，改变自己
     */
    public translate(offset: types.IXYZ): this {
        this._coord.translate(offset);
        return this;
    }

    /**
     * 绕坐标轴/点的旋转，改变自己
     * @param angle 旋转的角度
     * @param pivot 旋转轴上一点
     * @param axis  绕哪个轴旋转
     */
    public rotate(angle: number, pivot: types.IXYZ, axis: types.IXYZ = { x: 0, y: 0, z: 1 }): this {
        // 默认绕着z轴旋转
        const matrix = Matrix4.makeRotate(pivot, axis, angle);
        this._coord.transform(matrix);
        return this;
    }
}