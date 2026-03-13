import { Vec2 } from '../base/vec2';
import { types } from '../type_define/i_types';
import { Util } from '../util/util';



/**
 * 逆双线性插值.
 * 已知四个二维点和每个点处的uv值, 计算中间任意二维点处的uv值
 * https://gameinstitute.qq.com/community/detail/121581
 *
 *              /                  \
 *         D   /                    \ C
 *     -------P2---------------------P3--------
 *           /                        \
 *          /                          \
 *         /                            \
 * -------P0----------------------------P1--------
 *    A  /                                \ B
 *      /                                  \
 * P0's uv is (u0, v0),
 * p1's uv is (u1, v0),
 * p2's uv is (u0, v1),
 * p3's uv is (u1, v1)
 */
export class InvBilinear {
    private _u0: number;

    private _u1: number;

    private _v0: number;

    private _v1: number;

    private _p0: Vec2;

    private _p1: Vec2;

    private _p2: Vec2;

    private _p3: Vec2;

    constructor(u0: number, u1: number, v0: number, v1: number, p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2) {
        this._u0 = u0;
        this._u1 = u1;
        this._v0 = v0;
        this._v1 = v1;
        this._p0 = p0;
        this._p1 = p1;
        this._p2 = p2;
        this._p3 = p3;
    }

    public solve(p: Vec2): types.numberArr2 | undefined {
        /**
         * P = P0 + u'(P1 - P0) + v'(P2 - P0) + u'v'(P3 + P0 - P2 - P1)
         * u' = (u - u0) / (u1 - u0)
         * v' = (v - v0) / (v1 - v0)
         */
        // b1 = P1 - P0
        const b1 = this._p1.subtracted(this._p0);
        // b2 = p2 - p0
        const b2 = this._p2.subtracted(this._p0);
        // b3 = P3 + P0 - P2 - P1
        const b3 = this._p3.subtracted(this._p2).added(b1.reversed());
        // q = P - P0
        const q = p.subtracted(this._p0);

        const TOL = 1e-4;
        /**
         * u' = [q X b3 - (b2 X b3) * v'] / (b1 X b3) or
         * u' = (q_x - b2_x * v') / (b1_x + b3_x * v)
         * (b3 X b2)v*v + (b1 X b2 + q X b3) v + q X b1 = 0
         */
        const A = b3.cross(b2);
        const B = b1.cross(b2) + q.cross(b3);
        const C = q.cross(b1);
        let v1: number | undefined;
        let v2: number | undefined;
        let u1: number | undefined;
        let u2: number | undefined;
        if (Math.abs(A) <= TOL) {
            v1 = -C / B;
        } else {
            const delta = B * B - 4 * A * C;
            if (delta >= 0) {
                const sqrt = Math.sqrt(delta);
                v1 = (0.5 * (-B + sqrt)) / A;
                v2 = (0.5 * (-B - sqrt)) / A;
            }
        }
        if (v1 !== undefined) {
            const denom = b1.added(b3.multiplied(v1));
            if (Math.abs(denom.x) > Math.abs(denom.y)) {
                u1 = (q.x - b2.x * v1) / denom.x;
            } else {
                u1 = (q.y - b2.y * v1) / denom.y;
            }
        }
        if (v2 !== undefined) {
            const denom = b1.added(b3.multiplied(v2));
            if (Math.abs(denom.x) > Math.abs(denom.y)) {
                u2 = (q.x - b2.x * v2) / denom.x;
            } else {
                u2 = (q.y - b2.y * v2) / denom.y;
            }
        }

        let u: number | undefined = u1;
        let v: number | undefined = v1;
        if (v2 !== undefined && !Util.isInRange(u1!, 0, 1, TOL) && !Util.isInRange(v1!, 0, 1, TOL)) {
            // Make vlaue is in [0, 1]
            u = u2;
            v = v2;
        }

        if (u !== undefined && v !== undefined) {
            u = this._u0 + u * (this._u1 - this._u0);
            v = this._v0 + v * (this._v1 - this._v0);
            return [u, v];
        }
        return undefined;
    }
}