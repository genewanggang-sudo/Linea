
import Quadtree from 'quadtree-lib';
import { Box2 } from '../../base/box2';
import { Vec2 } from '../../base/vec2';
import * as ClipperLib from '../../clipperlib/clipperlib';
import { types } from '../../type_define/i_types';
import { IMesh2d } from './discrete_refiner';
import { DiscreteUtil } from './discrete_util';

const scale = 1e6;

function lToXY(loop: types.IXY[]) {
    return loop.map(p => {
        return { X: p.x, Y: p.y };
    });
}

function pToXY(polygon: types.IXY[][]) {
    return polygon.map(lToXY);
}

function buildQuadTree(polygon: types.IXY[][]) {
    const totalBox = new Box2(polygon.flat());
    const size = totalBox.getSize();

    const quadtree = new Quadtree({
        x: Math.round(totalBox.min.x) - 50,
        y: Math.round(totalBox.min.y) - 50,
        width: size.x + 100,
        height: size.y + 100,
        maxElements: 6,
    });

    polygon.forEach((loop, i) => {
        for (let j = 0; j < loop.length; j++) {
            const obj = [loop[j], loop[(j + 1) % loop.length]];
            const box = new Box2(obj);
            const s = box.getSize();
            quadtree.push({
                x: Math.round(box.min.x),
                y: Math.round(box.min.y),
                width: s.x,
                height: s.y,
                obj,
            });
        }
    });

    // const loops = [];
    // quadtree.each(_ => {
    //     loops.push(Loop.createByRectangle(_, new Vec2(_).add({ x: _.width, y: _.height })));
    // });

    // Log.d(loops);

    return { quadtree, totalBox };
}

const tmpV = new Vec2();
function clip(
    quadtree: Quadtree<Quadtree.QuadtreeItem>,
    totalBox: Box2,
    polygon: { X: number; Y: number }[][],
    rect: types.IXY[],
) {
    const box = new Box2(rect);
    const s = box.getSize();
    const rectItem = {
        x: Math.round(box.min.x) - 10,
        y: Math.round(box.min.y) - 10,
        width: s.x + 20,
        height: s.y + 20,
    };
    const items = quadtree.colliding(rectItem);
    if (!items.length) {
        const testP = tmpV.copy(rect[0]).interpolate(rect[2], 0.31179);
        // 用包围盒加速
        const ptItem = { x: testP.x, y: testP.y, width: totalBox.getSize().x * 2, height: 0.1 };
        let isIn = false;
        // 精确判断

        {
            // quadtree.colliding(ptItem).forEach(item => {
            //     const [p1, p2] = item.obj;
            //     const cross = new Vec2(testP, p1).cross(new Vec2(testP, p2));
            //     const xOK = (p1.y > p2.y && cross < 0) || (p1.y < p2.y && cross > 0);
            //     // 顺时针
            //     if (!xOK) {
            //         return;
            //     }
            //     if (testP.y > item.y && testP.y < item.y + item.height!) {
            //         isIn = !isIn;
            //     }
            // });
            // console.log(ptItem);
        }

        // 粗略判断
        isIn = !!(quadtree.colliding(ptItem).length % 2);

        if (isIn) {
            return [JSON.parse(JSON.stringify(rect)) as types.IXY[]];
        }
        return undefined;
    }

    // const pts: Ln2[] = [];
    // items.forEach(_ => {
    //     pts.push(new Ln2(_.obj[0], _.obj[1]));
    // });
    // Log.d([new Loop(rect), ...pts]);

    // 有交再用clipper切
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(polygon, ClipperLib.PolyType.ptSubject, true);
    // (clipper.m_edges as []).splice(1);
    clipper.AddPath(lToXY(rect), ClipperLib.PolyType.ptClip, true);

    const result: { X: number; Y: number }[][] = [];
    const ok = clipper.Execute(ClipperLib.ClipType.ctIntersection, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);

    if (!ok || !result.length) {
        return undefined;
    }

    const r = result.map(l =>
        l.map(_ => {
            return { x: _.X, y: _.Y };
        }),
    );

    return r;

    // Log.w(new Loop(r.flat()), 'rect-result0');

    // // 取点并去重
    // const candidates = new Map<string, types.IXY>();
    // items
    //     .map(_ => _.obj)
    //     .flat()
    //     .forEach(_ => candidates.set(`${_.x}${_.y}`, _));

    // r.forEach(lp => {
    //     for (let i = 0; i < lp.length; i++) {
    //         const p1 = lp[i];
    //         const p2 = lp[(i + 1) % lp.length];
    //         const ln = new Ln2(p1, p2);
    //         const params: number[] = [];
    //         candidates.forEach(p => {
    //             if (ln.containsPt(p) && !ln.isStartPt(p, 1) && !ln.isEndPt(p, 1)) {
    //                 params.push(ln.getParamAt(p));
    //             }
    //         });
    //         if (params.length) {
    //             const pts = params.sort((a, b) => a - b).map(_ => ln.getPtAt(_));
    //             lp.splice(i + 1, 0, ...pts);
    //             i += pts.length;
    //             Log.d([ln, ...pts]);
    //         }
    //     }
    // });
    // Log.e(new Loop(r.flat()), 'rect-result');
    // // Log.e(new Loop(polygon[0].map(_ => { return { x: _.X / scale, y: _.Y / scale } })), 'polygon');
    // // Log.e(new Loop(r.flat()), 'cli');

    // return r;
}

function ptToKey(p: types.IXY) {
    return [p.x, p.y].join();
}

function mergeAndScale(meshes: IMesh2d[]): IMesh2d {
    const faces: number[] = [];
    const vertices: types.IXY[] = [];

    const vertexToIdx = new Map<string, number>();

    for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];

        // 将vertex的idx映射到全局
        const localToWorld = new Map<number, number>();
        for (let idx = 0; idx < mesh.vertices.length; idx++) {
            const key = ptToKey(mesh.vertices[idx]);
            let worldIdx = vertexToIdx.get(key);
            // 不存在的顶点，为其分配idx
            if (worldIdx === undefined) {
                worldIdx = vertexToIdx.size;
                vertexToIdx.set(key, worldIdx);
                vertices.push(mesh.vertices[idx]);
            }
            localToWorld.set(idx, worldIdx);
        }

        mesh.faces.forEach(_ => {
            const idx = localToWorld.get(_)!;
            faces.push(idx);
        });
    }
    vertices.forEach(v => {
        v.x /= scale;
        v.y /= scale;
    });
    return { vertices, faces };
}

function lessPts(arr: number[], cnt: number) {
    if (cnt < 2) {
        return;
    }
    const copy = arr.slice(0);
    arr.splice(0);
    for (let i = 0; i < copy.length - 1; i += cnt) {
        if (i % cnt === 0) {
            arr.push(copy[i]);
        }
    }
    arr.push(copy[copy.length - 1]);
    // console.error(`${arr.length}/${copy.length}`);
}

// 使用clipper
export function uniformGridDiscrete(inputs: types.IXY[][], maxFaceCount: number) {
    // Log.d(new Polygon(inputs), 'polygon');

    const xSet = new Set<number>();
    const ySet = new Set<number>();

    // 1. 缩放
    const polygon = inputs.map(input =>
        input.map(_ => {
            const x = Math.round(_.x * scale);
            const y = Math.round(_.y * scale);
            xSet.add(x);
            ySet.add(y);
            return { x, y };
        }),
    );

    const xs = [...xSet].sort((a, b) => a - b);
    const ys = [...ySet].sort((a, b) => a - b);

    const t = xs.length / ys.length;
    const div = Math.sqrt((xs.length * ys.length) / maxFaceCount / t);

    const removeYt = Math.round(div);
    const removeXt = Math.round(t * div);

    lessPts(xs, removeXt);
    lessPts(ys, removeYt);

    // 2. 构件四叉树
    const { quadtree, totalBox } = buildQuadTree(polygon);

    const grid: types.IXY[] = [];

    for (let i = 0; i < xs.length; i++) {
        for (let j = 0; j < ys.length; j++) {
            grid.push({ x: xs[i], y: ys[j] });
        }
    }

    // {
    //     const dx = size.x / xResolution;
    //     let curX = box.min.x - dx;
    //     for (let i = 0; i < xResolution; i++) {
    //         curX += dx;
    //         row0.push({ x: curX, y: box.min.y });
    //     }
    //     row0.push({ x: box.max.x, y: box.min.y });
    // }

    // const grid = row0.slice(0);
    // let curY = 0;
    // const dy = size.y / yResolution;
    // for (let i = 1; i < yResolution; i++) {
    //     curY += dy;
    //     // eslint-disable-next-line no-loop-func
    //     row0.forEach(({ x, y }) => {
    //         grid.push({ x, y: y + curY });
    //     });
    // }
    // row0.forEach(_ => grid.push({ x: _.x, y: box.max.y }));

    // Log.d(
    //     grid.map(_ => new Vec2(_).multiply(1 / scale)),
    //     'grid',
    // );

    const POLYGON = pToXY(polygon);

    const rects: types.IXY[][][] = [];
    // 根据网格点生成矩形
    for (let i = 0; i < xs.length - 1; i++) {
        // (i,j)(i+1,j)(i+1,j+1)(i,j+1)
        for (let j = 0; j < ys.length - 1; j++) {
            const rect: types.IXY[] = [];
            [i * ys.length + j, (i + 1) * ys.length + j, (i + 1) * ys.length + j + 1, i * ys.length + j + 1].forEach(
                _ => rect.push(grid[_]),
            );
            const cell = clip(quadtree, totalBox, POLYGON, rect)!;
            if (cell) {
                rects.push(cell);
            }
        }
    }

    const mesh2ds = rects.map(rect => {
        if (rect.length === 1 && rect[0].length === 4) {
            return {
                vertices: rect[0],
                faces: [0, 1, 2, 2, 3, 0],
            } as IMesh2d;
        }
        return DiscreteUtil.tessVector2(rect);
    });
    // 合并
    const mesh2d = mergeAndScale(mesh2ds);

    // 每一个矩形做布尔运算
    // Log.d(
    //     rects.map(_ => new Polygon(_).scale(1e-8)),
    //     'xxx',
    // );

    return mesh2d;
}
