/* eslint-disable @typescript-eslint/prefer-for-of */
import * as ClipperLib from '../clipperlib/clipperlib';
import { Polygon } from '../topology/polygon';
import { Loop } from '../topology/loop';
import { PolyCurve } from '../topology/polycurve';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';



/**
 * 格式转换类
 */
class ClipperFormatConverter {
    public static vector2ToXY(vec: types.IXY): ClipperLib.IntPoint {
        const X = vec.x;
        const Y = vec.y;
        return { X, Y };
    }

    public static vector2sToXY(vector2s: types.IXY[]): ClipperLib.IntPoint[] {
        return vector2s.map(vec => {
            return { X: vec.x, Y: vec.y };
        });
    }

    public static pathsToPolygon(solutionPolytree: ClipperLib.IntPoint[][]) {
        const loops: Loop[] = [];
        for (const pts of solutionPolytree) {
            const l = ClipperFormatConverter.pathToLoop(pts);
            if (l && !l.isEmpty()) {
                loops.push(l);
            }
        }

        return new Polygon(loops);
    }

    public static pathToLoop(path: ClipperLib.IntPoint[]): Loop {
        return new Loop(
            path.map((e: ClipperLib.IntPoint) => {
                return { x: e.X, y: e.Y };
            }),
        );
    }

    public static loopToPath(loop: Loop): ClipperLib.IntPoint[] {
        return loop.toPath().map(p => {
            return ClipperFormatConverter.vector2ToXY(p);
        });
    }

    public static pathToPolyline(path: ClipperLib.IntPoint[]): PolyCurve {
        return new PolyCurve(
            path.map((e: ClipperLib.IntPoint) => {
                return { x: e.X, y: e.Y };
            }),
        );
    }

    public static polylineToPath(polyline: PolyCurve): ClipperLib.IntPoint[] {
        const pts = polyline.toPath();
        return pts.map(p => {
            const X = p.x;
            const Y = p.y;

            return { X, Y };
        });
    }

    public static polygonToPaths(polygon: Polygon): ClipperLib.IntPoint[][] {
        const result: ClipperLib.IntPoint[][] = [];
        const loops = polygon.getLoops();
        loops.forEach((loop: Loop) => {
            const ces = loop.getAllCurves();
            const pts = [];
            for (let i = 0; i < ces.length; i++) {
                const cv = ces[i];
                const discretedCurve = cv.discrete();
                if (i !== ces.length - 1 || loop.getType() === EN_GEO_TYPE.LOOP) {
                    discretedCurve.pop();
                }
                pts.push(...discretedCurve);
            }
            const intPts: ClipperLib.IntPoint[] = [];
            pts.forEach(pt => intPts.push({ X: pt.x, Y: pt.y }));
            if (pts.length > 0) result.push(intPts);
        });
        return result;
    }

    public static clpExPolygonToPolygon(exPolygon: ClipperLib.ExPolygon): Polygon {
        const out = [];

        for (let i = 0; i < exPolygon.outer.length; i++) {
            out.push(exPolygon.outer[i]);
        }

        const polygon = ClipperFormatConverter.pathsToPolygon([out]);

        for (let i = 0; i < exPolygon.holes.length; i++) {
            const inner = [];
            for (let j = 0; j < exPolygon.holes[i].length; j++) {
                inner.push(exPolygon.holes[i][j]);
            }
            polygon.addLoop(ClipperFormatConverter.pathToLoop(inner));
        }

        return polygon;
    }

    public static clipperExPolygonsToPolygon(exPolygons: ClipperLib.ExPolygons): Polygon[] {
        return exPolygons.map(polygon => {
            return ClipperFormatConverter.clpExPolygonToPolygon(polygon);
        });
    }
}

export { ClipperFormatConverter };