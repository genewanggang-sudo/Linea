import { Coord2 } from '../base/coord2';
import { Arc2 } from '../geometry/arc2d';
import { Curve2 } from '../geometry/curve2';
import { Ln2 } from '../geometry/ln2';
import { OffsetCurve2 } from '../geometry/offset_curve2';
import { CONST } from '../type_define/const';
import { types } from '../type_define/i_types';



export type LoopGenerateFunction = (a?: number, b?: number) => Curve2[];

export class LoopGenerator {
    /**
     * 可以通过 AlgTestSweep.showLoops() 查看
     */
    public static getLoopFuncs() {
        return [
            LoopGenerator.square,
            LoopGenerator.diamond,
            LoopGenerator.arcs,
            LoopGenerator.arcsRev,
            LoopGenerator.lineArc,
            LoopGenerator.lineArcTan,
            LoopGenerator.arcsTan,
            LoopGenerator.circle,
            LoopGenerator.offsetCurves,
            LoopGenerator.offsetCurvesTan,
            LoopGenerator.offsetCurveWithSingularity,
        ];
    }

    public static byPoints(points: number[][]): Curve2[] {
        const pts: types.IXY[] = points.map(p => {
            return { x: p[0], y: p[1] };
        });
        const crvs: Curve2[] = [];
        for (let i = 0; i < pts.length; i++) {
            crvs.push(new Ln2(pts[i], pts[(i + 1) % pts.length]));
        }
        return crvs;
    }

    public static square(a: number = 50, b: number = 60): Curve2[] {
        const pts = [
            [-a, -b],
            [a, -b],
            [a, b],
            [-a, b],
        ];
        return LoopGenerator.byPoints(pts);
    }

    public static diamond(a: number = 50, b: number = 60): Curve2[] {
        const pts = [
            [-a * 0.5, 0],
            [0, -b * 0.5],
            [a, 0],
            [0, b],
        ];
        return LoopGenerator.byPoints(pts);
    }

    public static arcs(a: number = 50, b: number = 60): Curve2[] {
        const t0 = CONST.PI_2 * 0.9;
        const ofs = a * Math.cos(t0);
        const coord1 = new Coord2({ x: -ofs, y: 0 });
        const coord2 = new Coord2({ x: ofs, y: 0 });
        const arc1 = new Arc2(coord1, a, b, true, [-t0, t0]);
        const arc2 = new Arc2(coord2, a, b, true, [CONST.PI - t0, CONST.PI + t0]);
        return [arc1, arc2];
    }

    public static arcsRev(a: number = 50, b: number = 60): Curve2[] {
        const arc1 = new Arc2(new Coord2({ x: a, y: b }, { x: 1, y: 0 }), a, b, false, [Math.PI / 2, Math.PI]);
        const arc2 = new Arc2(new Coord2({ x: 0, y: 0 }, { x: 1, y: 0 }), a, b, true, [Math.PI / 2, Math.PI * 2]);
        return [arc1, arc2];
    }

    public static lineArc(a: number = 50, b: number = 60): Curve2[] {
        const coord1 = new Coord2({ x: a, y: b });
        const coord2 = new Coord2({ x: 0, y: 0 });
        const arc1 = new Arc2(coord1, a, b, false, [(Math.PI / 2) * 1.1, Math.PI * 0.8]);
        const arc2 = new Arc2(coord2, a, b, true, [Math.PI * 1.1, Math.PI * 1.5 * 0.9]);
        return [
            arc1, //
            new Ln2(arc1.getEndPt(), arc2.getStartPt()),
            arc2,
            new Ln2(arc2.getEndPt(), arc1.getStartPt()),
        ];
    }

    public static lineArcTan(a: number = 50, b: number = 60): Curve2[] {
        const coord1 = new Coord2({ x: a * 0.6, y: 0 });
        const coord2 = new Coord2({ x: a * -0.6, y: 0 });
        const arc1 = new Arc2(coord1, a, b, true, [-CONST.PI_2, CONST.PI_2]);
        const arc2 = new Arc2(coord2, a, b, true, [CONST.PI_2, CONST.PI_2 * 3]);
        return [
            arc1, //
            new Ln2(arc1.getEndPt(), arc2.getStartPt()),
            arc2,
            new Ln2(arc2.getEndPt(), arc1.getStartPt()),
        ];
    }

    public static arcsTan(a: number = 50, b: number = 60): Curve2[] {
        const coord1 = new Coord2({ x: 0, y: -b });
        const coord2 = new Coord2({ x: 0, y: b });
        const arc1 = new Arc2(coord1, a, b, true, [0, CONST.PI_2]);
        const arc2 = new Arc2(coord2, a, b, false, [CONST.PI_2, CONST.PI]);
        const pt1 = { x: -a * 2, y: 0 };
        const pt2 = { x: -a, y: -b };
        return [arc1, arc2, new Ln2(arc2.getEndPt(), pt1), new Ln2(pt1, pt2), new Ln2(pt2, arc1.getStartPt())];
    }

    public static circle(a: number = 50, b: number = 60): Curve2[] {
        return [new Arc2(Coord2.XOY(), a, b, true, [CONST.PI_2, CONST.PI_2 * 5])];
    }

    public static offsetCurves(a: number = 50, b: number = 60): Curve2[] {
        const crd = new Coord2();
        const ofs1 = a * 0.3;
        const arc1 = new Arc2(crd, a, a + ofs1, true, [0, CONST.PI * 0.8]);
        const ofsCrv1 = OffsetCurve2.makeByOffset(arc1, -ofs1);

        const ofs2 = b * 0.3;
        const arc2 = new Arc2(crd, b, b + ofs2, true, [CONST.PI * 1.1, CONST.PI * 1.7]);
        const ofsCrv2 = new OffsetCurve2(arc2, -ofs2);
        return [
            ofsCrv1,
            new Ln2(ofsCrv1.getEndPt(), ofsCrv2.getStartPt()),
            ofsCrv2,
            new Ln2(ofsCrv2.getEndPt(), ofsCrv1.getStartPt()),
        ];
    }

    public static offsetCurvesTan(a: number = 50, b: number = 60): Curve2[] {
        const crd = new Coord2();
        const ofs1 = a * 0.3;
        const arc1 = new Arc2(crd, a, a + ofs1, true, [0, CONST.PI * 0.8]);
        const ofsCrv1 = OffsetCurve2.makeByOffset(arc1, -ofs1);

        const ofs2 = b * 0.3;
        const crd2 = crd.translated({ x: a - ofs1 - b + ofs2, y: 0 });
        const arc2 = new Arc2(crd2, b, b + ofs2, true, [CONST.PI * 1.1, CONST.PI2]);
        const ofsCrv2 = new OffsetCurve2(arc2, -ofs2);
        return [ofsCrv1, new Ln2(ofsCrv1.getEndPt(), ofsCrv2.getStartPt()), ofsCrv2];
    }

    public static offsetCurveWithSingularity(a: number = 50, _b: number = 60): Curve2[] {
        const crd = new Coord2();
        const ofs = a * 0.6;
        const arc1 = new Arc2(crd, a, a * 2, true, [0, CONST.PI_2 * 2.5]);
        const ofsCrv = OffsetCurve2.makeByOffset(arc1, -ofs);
        return [ofsCrv, new Ln2(ofsCrv.getEndPt(), ofsCrv.getStartPt())];
    }

    public static offsetCurveReverse(a: number = 50, _b: number = 60): Curve2[] {
        const crd = new Coord2();
        const ofs = a * 5;
        const arc1 = new Arc2(crd, a, a * 2, true, [0, CONST.PI_2 * 4]);
        const ofsCrv = OffsetCurve2.makeByOffset(arc1, -ofs);
        return [ofsCrv];
    }
}