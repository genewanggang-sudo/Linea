import { LoopsPJType } from './pj_type';
import { BoolOperate2d } from '../bool_operate_2d';
import { Loop } from '../../topology/loop';
import { Polygon } from '../../topology/polygon';
import { Tol } from '../../base/tol';
import { X } from '../calc_x';



class LoopsPJ {
    /**
     * Loop1与Loop2的位置关系判断,以loop2位基准
     * @param loop1
     * @param loop2
     * @param tolerance
     */
    public static execute(
        loop1: Loop,
        loop2: Loop,
        tol: number = Tol.LENGTH,
        tangentIsIntersect = false,
    ): LoopsPJType {
        const intersected = BoolOperate2d.intersect([loop1, loop2]);

        const isCurveIntersect = () => {
            for (const cv1 of loop1.getAllCurves()) {
                for (const cv2 of loop2.getAllCurves()) {
                    const x = X.curve2ds(cv1, cv2);
                    if (x.length > 0) {
                        return true;
                    }
                }
            }

            return false;
        };

        // 没有交区域
        if (!this._polygonIsValid(intersected)) {
            if (tangentIsIntersect && isCurveIntersect()) {
                return LoopsPJType.INTERSECT;
            }

            return LoopsPJType.OUT;
        }

        // 有交，需要判断in 还是 contain
        const sub1 = BoolOperate2d.difference(loop1, [loop2]);
        const sub2 = BoolOperate2d.difference(loop2, [loop1]);
        const valid1 = this._polygonIsValid(sub1);
        const valid2 = this._polygonIsValid(sub2);

        if (!valid1 && !valid2) {
            return LoopsPJType.EQUAL;
        }

        if (!valid1 && valid2) {
            if (tangentIsIntersect && isCurveIntersect()) {
                return LoopsPJType.INTERSECT;
            }
            return LoopsPJType.IN;
        }

        if (valid1 && !valid2) {
            if (tangentIsIntersect && isCurveIntersect()) {
                return LoopsPJType.INTERSECT;
            }
            return LoopsPJType.CONTAIN;
        }

        if (valid1 && valid2) {
            return LoopsPJType.INTERSECT;
        }

        throw new Error('未知类型');
    }

    private static _polygonIsValid(polygon: Polygon) {
        return polygon.calcArea() > Tol.DELTA_EPS;
    }
}

export { LoopsPJ };