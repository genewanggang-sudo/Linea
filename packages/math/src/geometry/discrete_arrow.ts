import { Vec2 } from '../base/vec2';
import { Vec3 } from '../base/vec3';
import { types } from '../type_define/i_types';
import { CONST } from '../type_define/const';



export function discreteArrow(origin: types.IXY, direction: types.IXY, len: number): types.IXYZArr[];

export function discreteArrow(origin: types.IXYZ, direction: types.IXYZ, len: number): types.IXYZArr[];

// 离散箭头
// len 如果小于0.001（1mm）算法中则取0.001
export function discreteArrow(
    origin: types.IXY | types.IXYZ,
    direction: types.IXY | types.IXYZ,
    len: number,
): types.IXYZArr[] {
    const arrLen = Math.max(len, 0.001);

    // 2d
    if ((origin as types.IXYZ).z === undefined) {
        const p = new Vec2(origin);
        const dir = new Vec2(direction).normalize().reverse();
        const dir1 = dir.vecRotated(-CONST.PI_4);
        const dir2 = dir.vecRotated(CONST.PI_4);
        return [
            dir1
                .multiply(arrLen)
                .add(p as Vec2)
                .toArray3(),
            (p as Vec2).toArray3(),
            dir2
                .multiply(arrLen)
                .add(p as Vec2)
                .toArray3(),
        ];
    }

    {
        const p = new Vec3(origin as types.IXYZ);
        const dir = new Vec3(direction as types.IXYZ).normalize().reverse();
        let dir1;
        let dir2;
        if (dir.isParallel(Vec3.Z())) {
            dir1 = Vec3.XY({ x: -1, y: 0 }, dir.z).normalize();
            dir2 = Vec3.XY({ x: 1, y: 0 }, dir.z).normalize();
        } else {
            dir1 = Vec3.XY(new Vec2(dir).vecRotate(-CONST.PI_4).toXY(), dir.z);
            dir2 = Vec3.XY(new Vec2(dir).vecRotate(CONST.PI_4).toXY(), dir.z);
        }
        return [
            dir1
                .multiply(arrLen)
                .add(p as Vec3)
                .toArray3(),
            (p as Vec3).toArray3(),
            dir2
                .multiply(arrLen)
                .add(p as Vec3)
                .toArray3(),
        ];
    }
}