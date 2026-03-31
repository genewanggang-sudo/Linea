import * as ClipperLib from '../../clipperlib/clipperlib';
import { ClipperFormatConverter } from '../../util/clipper_format_converter';
import { Polygon } from '../../topology/polygon';
import { Curve2 } from '../../geometry/curve2';
import { Ln2 } from '../../geometry/ln2';
import { PtToCv2Distance } from '../distance/pt_to_curve2_signed_distance';
import { Util } from '../../util/util';
import { CONST } from '../../type_define/const';
import { Tol } from '../../base/tol';
import { Loop2dOffset } from './loop2d_offset';
import { Loop } from '../..';

export interface IPolygonOffsetResult {
    /**
     * 偏移的结果
     */
    offsetPolygon: Polygon;

    /**
     * 结果和原始曲线之间的对应关系 new --> origin
     */
    evolution?: Map<Curve2, Curve2>;
}

/**
 * polygon的offset
 */
export class PolygonOffset {
    public static execute(loop: Polygon, _delta: number, withEvolution?: boolean): IPolygonOffsetResult {
        if (loop.isEmpty()) {
            return { offsetPolygon: new Polygon() };
        }
        const scale = Tol.CLIPPER_SCALE;

        const paths = ClipperFormatConverter.polygonToPaths(loop);
        ClipperLib.JS.ScaleUpPaths(paths, scale);
        // offset
        const offset = new ClipperLib.ClipperOffset(Number.MAX_VALUE);
        offset.AddPaths(paths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);

        offset.Execute(paths, _delta * scale);

        ClipperLib.JS.ScaleDownPaths(paths, scale);
        const offsetPolygon = ClipperFormatConverter.pathsToPolygon(paths);

        let evolution: Map<Curve2, Curve2> | undefined;
        // 用几何的办法计算, 偏移前后的对应关系
        if (withEvolution) {
            evolution = this._calEvolution(loop, offsetPolygon, _delta);
        }

        return { offsetPolygon, evolution };
    }

    /**
     * 偏移polygon中部分曲线
     * @param polygon 路径
     * @param _delta 偏移距离
     * @param offsetIndexes 偏移曲线角标 number[][], [[loop角标, curve角标]]
     * @param isMerge 是否合并和简化线段，默认true，如果不简化，有部分polygon可能会有一定问题。
     */
    public static offsetCurves(polygon: Polygon, _delta: number, offsetIndexes: number[][], isMerge = true) {
        const loops = polygon.clone().getLoops();
        const newPolygon = new Polygon();
        // 偏移边
        loops.forEach((loop, index) => {
            const loopIndexes = offsetIndexes.filter(i => i.length > 1 && i[0] === index);
            if (loopIndexes.length) {
                const indexes = loopIndexes.map(i => i[1]);

                const offsetCurves = Loop2dOffset.execute(loop.getAllCurves(), _delta, undefined, isMerge, indexes).loops;
                const offsetLoops = offsetCurves.map(cvs => new Loop(cvs));
                offsetLoops.forEach(loop => { newPolygon.addLoop(loop) });
            } else {
                newPolygon.addLoop(loop);
            }
        });
        if (newPolygon.isEmpty()) {
            return new Polygon();
        }
        // 如果合并，或者轮廓不合法，都需要简化处理
        if (isMerge || !newPolygon.isValid()) {
            // 简化并删除自交线段
            const scale = Tol.CLIPPER_SCALE;
            const paths = ClipperFormatConverter.polygonToPaths(newPolygon);
            ClipperLib.JS.ScaleUpPaths(paths, scale);
            const solution_paths = ClipperLib.Clipper.SimplifyPolygons(paths, ClipperLib.PolyFillType.pftPositive);
            ClipperLib.JS.ScaleDownPaths(solution_paths, scale);
            const offsetPolygon = ClipperFormatConverter.pathsToPolygon(solution_paths);
            return offsetPolygon;
        } else {
            return newPolygon;
        }
    }

    private static _calEvolution(originPoly: Polygon, newPoly: Polygon, delta: number): Map<Curve2, Curve2> {
        const isCand = (c1: Ln2, c2: Ln2) => {
            if (!c1.getDirection().isSameDirection(c2.getDirection())) {
                return false;
            }
            const dis = PtToCv2Distance.simple(c2.getStartPt(), c1, true);
            return Util.isNearlyEqual(-dis.distance, delta);
        };

        const evolution: Map<Curve2, Curve2> = new Map();
        const originCurves = originPoly.getAllCurves() as Ln2[];
        const newCurves = newPoly.getAllCurves() as Ln2[];
        for (const curve of newCurves) {
            const extendCurve = curve.clone().extendDouble(CONST.MODEL_MAX_LENGTH);
            const cands = originCurves.filter(it => isCand(extendCurve, it));
            if (!cands.length) {
                continue;
            }

            // 排序
            const middlePt = curve.getMidPt();
            cands.sort((a, b) => middlePt.distanceTo(a.getMidPt()) - middlePt.distanceTo(b.getMidPt()));
            evolution.set(curve, cands[0]);
        }

        return evolution;
    }
}
