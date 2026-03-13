import { CoordBasedSurface } from './coord_based_surface';
import { MathAssert } from '../util/assert';
import { Tol } from '../base/tol';
import { Ln3 } from './ln3';
import { Arc3 } from './arc3d';
import { Vec2 } from '../base/vec2';
import { Ln2 } from './ln2';
import { CONST } from '../type_define/const';
import { Util } from '../util/util';
import { Curve2 } from './curve2';
import { Curve3 } from './curve3d';
import { NurbsCurve3 } from './nurbs_curve3';
import { OffsetCurve3 } from './offset_curve3';
import { PeriodInterval } from '../base/period_inverval';



/**
 * 基于圆弧构造的曲面
 */
export abstract class CircularSurface extends CoordBasedSurface {
    // x轴半长
    protected _a: number;

    // y轴半长
    protected _b: number;

    /**
     * 获取x轴半长
     */
    public getA(): number {
        return this._a;
    }

    /**
     * 设置x轴半长
     */
    public setA(v: number) {
        this._a = v;
    }

    /**
     * 获取y轴半长
     */
    public getB(): number {
        return this._b;
    }

    /**
     * 设置y轴半长
     */
    public setB(v: number) {
        this._b = v;
    }

    /**
     * 获取半径长度
     * @deprecated 目前已支持 ab 长短周，请以获取半轴长替代
     */
    public getRadius(): number {
        MathAssert.assert(this.isEqualAB(), '获取半径时，圆弧长短轴长度不一致');
        return this._a;
    }

    /**
     * 判断是否是圆柱或圆锥，区分椭圆柱和椭圆锥面
     */
    public isEqualAB(tol: number = Tol.LENGTH) {
        if (Math.abs(this._a - this._b) < tol) {
            return true;
        }

        return false;
    }

    // 外部调用时，请保证loop3d首尾连接且封闭（其实就是一个三维封闭的环），就能得到一个封闭的参数域loop2d
    // 此外，没有处理一条曲线跨周期的问题，处理了在周期性分界线处的直线getcurve2d位置不对和退化导致的不封闭问题
    public wireToUV(loop3d: Curve3[], tol = Tol.DEFAULT): { loop: Curve2[]; mapping: Map<Curve3, Curve2> } {
        const map = new Map<Curve3, Curve2>();
        const loop2d = loop3d.map(crv3d => {
            const crv2d = this.getCurve2d(crv3d);
            MathAssert.assert(crv2d, 'result crv2d is undefined', crv3d);
            map.set(crv3d, crv2d!);
            return crv2d!;
        });

        const degeleteCurvIndex: number[] = [];
        for (let i = 0; i < loop2d.length; i++) {
            const prevIndex = i - 1 < 0 ? i - 1 + loop2d.length : i - 1;
            const prevEndPt = loop2d[prevIndex].getEndPt();

            // 处理首尾不连接的line的情况：面临跨参数域问题
            const stPt = loop2d[i].getStartPt();
            if (!stPt.equals(prevEndPt, tol.lengthEps) && loop2d[i].isLine2d()) {
                const stXDist = prevEndPt.x - stPt.x;

                // 多条连续的小碎线段都在周期分界线上，都要一起处理
                const lineIndexes: number[] = [i];
                let theLine = loop2d[i] as Ln2;
                let theEndPt = theLine.getEndPt();
                let nextIndex = (i + 1) % loop2d.length;
                while (loop2d[nextIndex].isLine2d() && loop2d[nextIndex].getStartPt().equals(theEndPt, tol.lengthEps)) {
                    const nextLine = loop2d[nextIndex] as Ln2;
                    if (!nextLine.getDirection().isParallel(theLine.getDirection(), tol.angleEps)) {
                        break;
                    }
                    lineIndexes.push(nextIndex);
                    theLine = nextLine;
                    theEndPt = nextLine.getEndPt();
                    nextIndex = (nextIndex + 1) % loop2d.length;
                    i++;
                }

                // 相比只用curve2d的前后关系处理不封闭问题，也许利用curve3d的周期性更靠谱？
                const prevCurve3d = loop3d[prevIndex];
                const nextCurve3d = loop3d[nextIndex]; // 如果是锥面，前一条边是退化边的，退化边构造可能不是周期性曲线，所以就看后一条边是否周期
                if (prevCurve3d.isPeriodic() || loop3d[nextIndex].isPeriodic()) {
                    const range = prevCurve3d.isPeriodic() ? prevCurve3d.getRange() : nextCurve3d.getRange();
                    const period = (range as PeriodInterval).period;
                    // 从i到nextindex的curve2d位置不对
                    if (Util.isNearlyEqual(stXDist, period, tol.numberEps)) {
                        for (const it of lineIndexes) {
                            const line = loop2d[it] as Ln2;
                            line.getOrigin().add(new Vec2(period, 0));
                        }
                        continue;
                    }
                } else if (loop3d[i].getLength() < tol.lengthEps) {
                    // 由退化造成的不封闭问题，譬如说锥面的顶点位置的退化curve。这种情况下，参数v一般是正确的
                    degeleteCurvIndex.push(i); // 由退化造成的不封闭问题，譬如说锥面的顶点位置的退化curve。先将周期性问题处理完，在处理退化的问题
                }
            }
        }

        // 最后处理退化的问题，根据前后关系封闭loop
        for (const id of degeleteCurvIndex) {
            const prevIndex = id - 1 < 0 ? id - 1 + loop2d.length : id - 1;
            const nextIndex = (id + 1) % loop2d.length;
            const prevEndPt = loop2d[prevIndex].getEndPt();
            const nextStPt = loop2d[nextIndex].getStartPt();
            loop2d[id] = new Ln2(prevEndPt, nextStPt);
        }

        return { loop: loop2d, mapping: map };
    }

    /**
     * 将三维曲线，转成参数域中的二维曲线
     * 暂时只支持直线和圆弧
     * @param curveOnSurface
     */
    public getCurve2d(curveOnSurface: Curve3): Curve2 {
        if (curveOnSurface instanceof Ln3) {
            return this._line3dToUV(curveOnSurface);
        }
        if (curveOnSurface instanceof Arc3 && curveOnSurface.getNormal().isParallel(this.getCoord().getDz())) {
            return this._arc3dToUV(curveOnSurface);
        }
        return super.getCurve2d(curveOnSurface);
    }

    public containsCurve(curve: Curve3, tol: number = Tol.LENGTH): boolean {
        if (curve.isLine3d() || curve.isArc3d() || curve.isNurbsCurve3d()) {
            return this._containsBaseCurve(curve);
        }

        if (curve instanceof OffsetCurve3) {
            const baseCv = curve.getBaseCurve();
            if (baseCv instanceof NurbsCurve3) {
                if (baseCv.getCoincideLine() !== undefined) {
                    return this.containsPt(curve.getStartPt(), tol) && this.containsPt(curve.getEndPt(), tol);
                }
                // 对于arc->offset结果的等价的nurbs，做offset也可能是arc，但是暂不考虑这种特殊情况
            }
            return false;
        }

        return false;
    }

    protected _line3dToUV(curveOnSurface: Ln3): Ln2 {
        const uvP0 = this.getUVAt(curveOnSurface.getStartPt());
        const uvP1 = new Vec2(uvP0.x, this.getUVAt(curveOnSurface.getEndPt()).y);
        if (uvP0.equals(uvP1)) {
            return new Ln2(uvP0, Vec2.X(), [0, 0]); // 如果有退化的line3d直线
        }
        return new Ln2(uvP0, uvP1);
    }

    protected _arc3dToUV(arc: Arc3): Ln2 {
        const startPt = this.getUVAt(arc.getStartPt());
        const isParal = arc.getCoord().getDz().isParallel(this._coord.getDz());
        const sameDir = arc.getCoord().getDz().dot(this._coord.getDz()) > 0;
        const length = arc.getRange().getLength(); // 对于a === b的圆柱，ok
        let endPtX = sameDir ? startPt.x + length : startPt.x - length;
        let endPtY = startPt.y;
        if (!isParal) {
            const endPt = this.getUVAt(arc.getEndPt());
            endPtY = endPt.y; // 斜的椭圆：z轴不与柱面平行也可以，只是y需要反求参数
            if (!this.isEqualAB()) {
                if (sameDir && endPt.x < startPt.x) {
                    endPtX += CONST.PI2; // 如果同向，且endPtX小于startPt.x，说明计算endPt时调整了周期
                } else if (!sameDir && endPt.x > startPt.x) {
                    endPtX -= CONST.PI2;
                }
            }
        }

        const paramTol = (2 * Tol.LENGTH) / (this._a + this._b);
        if (Util.isNearlySmaller(endPtX, 0, paramTol)) {
            if (startPt.x < paramTol) {
                startPt.x += CONST.PI2;
                endPtX += CONST.PI2;
            }
            // else {
            //     throw new Error('_arc3dToUV：曲线跨越曲面的参数域分界线');
            // }
        }
        if (Util.isNearlyBigger(endPtX, CONST.PI2, paramTol)) {
            if (startPt.x > CONST.PI2 + paramTol) {
                startPt.x -= CONST.PI2;
                endPtX -= CONST.PI2;
            }
            // else {
            //     throw new Error('_arc3dToUV：曲线跨越曲面的参数域分界线');
            // }
        }

        const endPt = new Vec2(endPtX, endPtY);
        return new Ln2(startPt, endPt);
    }
}