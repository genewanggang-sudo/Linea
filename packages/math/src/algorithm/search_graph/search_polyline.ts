import { Curve2 } from '../../geometry/curve2';
import { MathAssert } from '../../util/assert';
import { PolyCurve } from '../../topology/polycurve';
import { Loop } from '../../topology/loop';
import { Vec2 } from '../../base/vec2';
import { Tol } from '../../base/tol';



/**
 * 搜索简单Polyline，简单Polyline就是Coedge只在端点处相交，且交点最多连接2条线
 */
export class SearchSimpleLoop {
    public static execute(_curve2ds: Curve2[], tolerance = Tol.LENGTH): (PolyCurve | Loop)[] {
        if (_curve2ds.length < 1) {
            return [];
        }
        if (_curve2ds.length === 1) {
            const polyline = new PolyCurve([_curve2ds[0].clone()]);
            return [polyline];
        }

        const result: (PolyCurve | Loop)[] = [];

        const map: Map<Curve2, number> = new Map();
        _curve2ds.forEach((cv, idx) => map.set(cv, idx));

        while (map.size) {
            // 找一条最长的曲线，作为搜索的首条线，避免第一条线是长度过短的线
            const firsToidx = SearchSimpleLoop._findAndRemoveLongestCurve(map);
            const loop: [Curve2, number][] = [firsToidx];

            // find next
            while (map.size) {
                const next = SearchSimpleLoop._findAndRemoveNextCurve(
                    loop[loop.length - 1][0].getEndPt(),
                    map,
                    tolerance,
                );
                if (next) {
                    loop.push(next);
                } else {
                    break;
                }
            }
            // find pre
            while (map.size) {
                const pre = SearchSimpleLoop._findAndRemoveNextCurve(loop[0][0].getStartPt(), map, tolerance);
                if (pre) {
                    (pre[0] as Curve2).reverse();
                    loop.splice(0, 0, pre);
                } else {
                    break;
                }
            }

            const tryLoop = new Loop();
            for (const [cv] of loop) {
                tryLoop.addCurve(cv);
            }

            if (tryLoop.isValid()) {
                result.push(tryLoop);
            } else {
                const polyline = new PolyCurve();
                tryLoop.getAllCurves().forEach(ce => {
                    polyline.addCurve(ce);
                });
                result.push(polyline);
            }
        }

        // 变为逆时针
        result.forEach(loop => {
            if (!loop.isAnticlockwise()) {
                loop.reverse();
            }
        });

        return result;
    }

    private static _findAndRemoveLongestCurve(map: Map<Curve2, number>): [Curve2, number] {
        MathAssert.assert(map.size);

        let max = -1;
        let curveIdx: [Curve2, number] = undefined as any;
        for (const [cv, idx] of map) {
            const l = cv.getLength();
            if (l > max) {
                max = l;
                curveIdx = [cv, idx];
            }
        }

        MathAssert.assert(curveIdx);
        map.delete(curveIdx[0]);

        return curveIdx;
    }

    private static _findAndRemoveNextCurve(
        pt: Vec2,
        curves: Map<Curve2, number>,
        tolerance: number,
    ): [Curve2, number] | undefined {
        const candidates: { cv: Curve2; d: number; reverse: boolean }[] = [];
        for (const [cv] of curves) {
            const d1 = cv.getStartPt().distanceTo(pt);
            const d2 = cv.getEndPt().distanceTo(pt);
            if (d1 < tolerance && d2 < tolerance) {
                if (d1 > d2) {
                    candidates.push({ cv, d: d2, reverse: true });
                } else {
                    candidates.push({ cv, d: d1, reverse: false });
                }
            } else if (d1 < tolerance) {
                candidates.push({ cv, d: d1, reverse: false });
            } else if (d2 < tolerance) {
                candidates.push({ cv, d: d2, reverse: true });
            }
        }
        if (candidates.length < 1) {
            return undefined;
        }

        // 找距离最小的
        candidates.sort((a, b) => {
            return a.d - b.d;
        });

        const result = candidates[0];
        //
        const idx = curves.get(result.cv)!;
        MathAssert.assert(idx !== undefined);
        curves.delete(result.cv);

        const curve = result.cv.clone();

        if (result.reverse) {
            curve.reverse();
        }

        return [curve, idx];
    }
}