import * as ClipperLib from '../../clipperlib/clipperlib';
import { ClipperFormatConverter } from '../../util/clipper_format_converter';
import { Log } from '../../util/log';
import { LinesX } from '../intersect/curves_x/lines_x';
import { PtPolygonPJ } from '../pj/pt_polygon_pj';
import { PtLoopPJ } from '../pj/pt_loop_pj';
import { PtLoopPJType } from '../pj/pj_type';
import { Curve2 } from '../../geometry/curve2';
import { Loop } from '../../topology/loop';
import { Polygon } from '../../topology/polygon';
import { Vec2 } from '../../base/vec2';
import { Ln2 } from '../../geometry/ln2';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { Tol } from '../../base/tol';



/**
 * 二维布尔运算，封装的clipper算法
 */
class BoolOperateClipper {
    // todo加速
    /**
     * 差
     * @param loopOrPolygons1
     * @param loopOrPolygons2
     */
    public static curvePolygon(curve: Curve2, loopOrPolygons2: (Loop | Polygon)[], isIntersect: boolean): Vec2[][] {
        const curves: Curve2[] = [];
        // 1.搜集所有线
        loopOrPolygons2.forEach(l => {
            curves.push(...l.copyAllCurves());
        });

        if (!curves.length) {
            if (isIntersect) {
                return [];
            }
            return [[curve.getStartPt(), curve.getEndPt()]];
        }

        let lines = [curve];
        // 2.打断
        for (const cv of curves) {
            //
            const splitResult: Curve2[] = [];
            for (const l of lines) {
                const infos = LinesX.line2ds(l as Ln2, cv as Ln2);
                if (!infos.length) {
                    splitResult.push(l);
                } else {
                    infos.forEach(({ point, isOverlap }) => {
                        if (!isOverlap) {
                            splitResult.push(new Ln2(l.getStartPt(), point));
                            splitResult.push(new Ln2(point, l.getEndPt()));
                        }
                    });
                }
            }

            lines = splitResult;
        }
        const inner: Curve2[] = [];
        const outter: Curve2[] = [];
        // 3.判断内外关系
        for (const l of lines) {
            const find = loopOrPolygons2.find(p => {
                if (p instanceof Polygon) {
                    return PtPolygonPJ.execute(l.getMidPt(), p) === PtLoopPJType.IN;
                }
                return PtLoopPJ.execute(l.getMidPt(), p, Tol.LENGTH).type === PtLoopPJType.IN;
            });
            // 内部
            if (find) {
                inner.push(l);
            } else {
                outter.push(l);
            }
        }

        if (isIntersect) {
            return inner.map(l => {
                return [l.getStartPt(), l.getEndPt()];
            });
        }
        return outter.map(l => {
            return [l.getStartPt(), l.getEndPt()];
        });
    }

    public static boolOperate(
        loopOrPolygons1: (Loop | Polygon)[],
        type: 0 | 1 | 2,
        loopOrPolygons2: (Loop | Polygon)[],
    ): Polygon {
        return Polygon.fromPolygonEx(this.boolOperateEx(loopOrPolygons1, type, loopOrPolygons2));
    }

    public static boolOperateEx(
        loopOrPolygons1: (Loop | Polygon)[],
        type: 0 | 1 | 2,
        loopOrPolygons2: (Loop | Polygon)[],
    ): Polygon[] {
        const clipper = new ClipperLib.Clipper();
        const scale = Tol.CLIPPER_SCALE;

        let ptsAEmpty = true;
        for (const l of loopOrPolygons1) {
            if (l.getType() === EN_GEO_TYPE.LOOP) {
                const paths = [ClipperFormatConverter.loopToPath(l as Loop)];
                if (!paths.length) {
                    continue;
                }
                ClipperLib.JS.ScaleUpPaths(paths, scale);
                clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
            } else if (l.getType() === EN_GEO_TYPE.POLYGON) {
                const paths = ClipperFormatConverter.polygonToPaths(l as Polygon);
                if (!paths.length) {
                    continue;
                }
                ClipperLib.JS.ScaleUpPaths(paths, scale);
                clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
            } else {
                throw new Error('not support this type');
            }
            ptsAEmpty = false;
        }

        if (loopOrPolygons2) {
            for (const l of loopOrPolygons2) {
                if (l.getType() === EN_GEO_TYPE.LOOP) {
                    const paths = [ClipperFormatConverter.loopToPath(l as Loop)];
                    if (!paths.length) {
                        continue;
                    }
                    ClipperLib.JS.ScaleUpPaths(paths, scale);
                    clipper.AddPaths(paths, ClipperLib.PolyType.ptClip, true);
                } else if (l.getType() === EN_GEO_TYPE.POLYGON) {
                    const paths = ClipperFormatConverter.polygonToPaths(l as Polygon);
                    if (!paths.length) {
                        continue;
                    }
                    ClipperLib.JS.ScaleUpPaths(paths, scale);
                    clipper.AddPaths(paths, ClipperLib.PolyType.ptClip, true);
                } else {
                    throw new Error('not support this type');
                }
            }
        }

        let clipType = -1;
        if (type === 0) {
            clipType = ClipperLib.ClipType.ctUnion;
        } else if (type === 1) {
            clipType = ClipperLib.ClipType.ctIntersection;
            if (ptsAEmpty) {
                return [new Polygon()];
            }
        } else if (type === 2) {
            clipType = ClipperLib.ClipType.ctDifference;
            if (ptsAEmpty) {
                return [new Polygon()];
            }
        }

        const polyTree = new ClipperLib.PolyTree();
        const ok = clipper.Execute(
            clipType,
            polyTree,
            ClipperLib.PolyFillType.pftNonZero,
            ClipperLib.PolyFillType.pftNonZero,
        );
        if (!ok) {
            Log.e([...loopOrPolygons1, ...loopOrPolygons2], 'clipper运算失败');
        }
        const polygons: Polygon[] = [];
        const nodeStack = polyTree.Childs();
        const toLoop = (path: any) => {
            ClipperLib.JS.ScaleDownPath(path, scale);
            return ClipperFormatConverter.pathToLoop(path);
        };
        while (nodeStack.length > 0) {
            const node = nodeStack.pop()!;
            const loops = [toLoop(node.Contour())];

            for (const child of node.Childs()) {
                loops.push(toLoop(child.Contour()));
                nodeStack.push(...child.Childs());
            }
            polygons.push(new Polygon(loops));
        }
        return polygons;
    }
}

export { BoolOperateClipper };