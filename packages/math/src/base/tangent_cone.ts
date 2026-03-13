import { CONST } from '../type_define/const';
import { Tol } from './tol';
import { Vec3 } from './vec3';



/* !
 * 方向锥, 通常用于表示一段曲线, 或者一片曲面的平坦程度
 * 未初始化: Cone.Dir == CVector3d::Zero
 * 无效: Cone.Angle == M_PI
 */
// export class Cone<PointType extends Vec> {
// }

/* !
 * 切向锥, 通常用于表示一段曲线的平坦程度 // 为了方便实现，原本TangentCone<PointType extends Vec> 统一成三维TangentCone
 * 未初始化: Cone.Dir == CVector3d::Zero
 * 无效: Cone.Angle == M_PI
 */
export class TangentCone {
    public dir: Vec3; // 方向

    public angle: number; // 半角

    constructor(theDir: Vec3, theAngle: number) {
        this.dir = theDir;
        this.angle = theAngle;
    }

    // 未初始化: dir == Zero
    public isConeEmpty(): boolean {
        return this.dir.getSqLength() < Tol.LENGTH * Tol.LENGTH;
    }

    // 无效Cone: angle == PI
    public isConeValid(): boolean {
        return this.angle !== CONST.PI;
    }

    public copy(rCone: TangentCone) {
        this.dir.copy(rCone.dir);
        this.angle = rCone.angle;
    }

    /* !
     * @brief    合并一个切向，得到新的合并的切向锥(改变自己): rCone与rVt合并,结果为rCone:
     * @param rVt       传入单位向量
     * @param bApprox   是否需要近似计算合并后的结果，默认为true，表示近似计算；false,需要精确计算
     * @return    合并有效返回true, 无效返回false
     */
    public mergeCone(rVt: Vec3, bApprox: boolean = true): boolean {
        if (rVt.getSqLength() < Tol.LENGTH * Tol.LENGTH) {
            return false;
        }

        if (this.isConeEmpty()) {
            this.dir = rVt;
            return true;
        }

        const dCos = this.dir.dot(rVt);
        // 近似计算合并结果
        if (bApprox && dCos <= -Tol.ANGLE) {
            this.angle = CONST.PI;
            return false;
        }

        // 准确计算合并结果
        if (Math.abs(dCos) < 1) {
            const dAngle = Math.acos(dCos);
            if (dAngle > this.angle) {
                const minAngle = -this.angle;
                const maxAngle = Math.max(this.angle, dAngle);
                this.angle = (maxAngle - minAngle) * 0.5;

                // axis
                const axisAngle = 0.5 * (minAngle + maxAngle);
                const sinSubAngle = Math.sin(dAngle - axisAngle);
                const sinAxisAngle = Math.sin(axisAngle);
                const theDir = this.dir
                    .multiplied(sinSubAngle)
                    .add(rVt.multiplied(sinAxisAngle))
                    .multiply(1 / Math.sin(dAngle));
                this.dir = theDir;
            }
        } else {
            // axes point in opposite directions

            if (dCos <= 0.0) {
                this.angle = CONST.PI2;
            }
            // else axes point in same direction
        }

        return true;
    }

    /*
     * @     合并一个切向锥，得到合并后的切向锥(改变自己)
     * @param rCone      结果切向锥
     * @param rSrcCone   源切向锥
     */
    public mergeTwoCone(rCone: TangentCone, rSrcCone: TangentCone): boolean {
        if (rCone.dir.equals(Vec3.O())) {
            rCone.copy(rSrcCone);
            return true;
        }

        const dCos: number = rCone.dir.dot(rSrcCone.dir);
        if (dCos < 0) {
            rCone.angle = CONST.PI;
            return false;
            // eslint-disable-next-line no-else-return
        } else {
            const dAngle: number = Math.acos(dCos);
            if (dAngle + rCone.angle <= rSrcCone.angle) {
                rCone.copy(rSrcCone);
            } else if (dAngle + rSrcCone.angle > rCone.angle) {
                const dSumAngle: number = dAngle + rSrcCone.angle + rCone.angle;
                if (dSumAngle >= CONST.PI) {
                    rCone.angle = CONST.PI;
                } else {
                    const dAngle2: number = dSumAngle / 2 - rSrcCone.angle;
                    let rVt = rCone.dir.subtracted(rSrcCone.dir);
                    const dSin2 = Math.sin(dAngle2);
                    rVt = rVt.multiplied(dSin2 / (Math.sin(dAngle - dAngle2) + dSin2));
                    rCone.dir = rSrcCone.dir.added(rVt);
                    rCone.dir.normalize();
                    rCone.angle = dSumAngle / 2;
                }
            }
        }
        return true;
    }
}