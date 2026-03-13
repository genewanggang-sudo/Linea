import * as ClipperLib from '../clipperlib/clipperlib';
import { Tol } from '../base/tol';
import { types } from '../type_define/i_types';



export class ClipperUtil {
    public static clipperTreeToPathLists(polyTree: ClipperLib.PolyTree): ClipperLib.Paths[] {
        const allPaths: ClipperLib.Paths[] = [];

        const nodeStack = polyTree.Childs();
        while (nodeStack.length > 0) {
            const node = nodeStack.pop()!;
            const newPaths = [node.Contour()];

            for (const child of node.Childs()) {
                newPaths.push(child.Contour());
                nodeStack.push(...child.Childs());
            }
            allPaths.push(newPaths);
        }
        return allPaths;
    }

    public static xyLoopsToClipper(loops: types.IXY[][], scale = Tol.CLIPPER_SCALE): ClipperLib.IntPoint[][] {
        const paths = loops.map(loop => loop.map(p => new ClipperLib.IntPoint(p.x, p.y)));
        ClipperLib.JS.ScaleUpPaths(paths, scale);
        return paths;
    }

    public static clipperPathsToXys(clipPaths: ClipperLib.Paths, scale = Tol.CLIPPER_SCALE): types.IXY[][] {
        return clipPaths.map(loop => loop.map(_ => ({ x: _.X / scale, y: _.Y / scale })));
    }

    public static boolAsClipperPoint(
        polygons1: types.IXY[][][] | ClipperLib.IntPoint[][][],
        polygons2: types.IXY[][][] | ClipperLib.IntPoint[][][],
        operationType: ClipperLib.ClipType,
    ) {
        const clipper = new ClipperLib.Clipper();
        for (const polygon of polygons1) {
            const paths =
                polygon[0][0] instanceof ClipperLib.IntPoint
                    ? (polygon as ClipperLib.IntPoint[][])
                    : ClipperUtil.xyLoopsToClipper(polygon as types.IXY[][]);
            clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
        }
        for (const polygon of polygons2) {
            const paths =
                polygon[0][0] instanceof ClipperLib.IntPoint
                    ? (polygon as ClipperLib.IntPoint[][])
                    : ClipperUtil.xyLoopsToClipper(polygon as types.IXY[][]);
            clipper.AddPaths(paths, ClipperLib.PolyType.ptClip, true);
        }

        const polyTree = new ClipperLib.PolyTree();
        clipper.Execute(
            operationType,
            polyTree,
            ClipperLib.PolyFillType.pftEvenOdd,
            ClipperLib.PolyFillType.pftEvenOdd,
        );

        return ClipperUtil.clipperTreeToPathLists(polyTree);
    }

    public static boolAsXys(
        polygons1: types.IXY[][][] | ClipperLib.IntPoint[][][],
        polygons2: types.IXY[][][] | ClipperLib.IntPoint[][][],
        operationType: ClipperLib.ClipType,
    ) {
        const pathList = ClipperUtil.boolAsClipperPoint(polygons1, polygons2, operationType);
        return pathList.map(_ => ClipperUtil.clipperPathsToXys(_));
    }

    public static removeGapByOffset(loops: types.IXY[][], gapWidth: number): types.IXY[][] {
        const scale = Tol.CLIPPER_SCALE;
        const paths = ClipperUtil.xyLoopsToClipper(loops, scale);

        // offset
        const signs = [1, -1, -1, 1];

        for (const sign of signs) {
            const ofs = new ClipperLib.ClipperOffset();
            ofs.AddPaths(paths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
            ofs.Execute(paths, sign * gapWidth * scale);
        }

        const pts = ClipperUtil.clipperPathsToXys(paths, scale);
        return pts;
    }
}