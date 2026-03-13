import * as ClipperLib from '../../clipperlib/clipperlib';
import { Coord3 } from '../../base/coord3';
import { Tol } from '../../base/tol';
import { Vec3 } from '../../base/vec3';
import { types } from '../../type_define/i_types';



export class MeshAssist {
    public static getEdgeNeighbourMap(faces: number[]): Map<number, number> {
        const edgeNbrMap = new Map<number, number>();
        const idFiMap = new Map<number, number>();
        const vn = Math.max(...faces);

        for (let f0 = 0; f0 < faces.length; f0 += 3) {
            for (let i = 0; i < 3; i++) {
                const fi = f0 + i;
                const vi = faces[fi];
                const vj = faces[f0 + ((i + 1) % 3)];
                const thatId = vj * vn + vi;
                const fThat = idFiMap.get(thatId);

                if (fThat === undefined) {
                    idFiMap.set(vi * vn + vj, fi);
                } else {
                    idFiMap.delete(thatId);
                    edgeNbrMap.set(fi, fThat);
                    edgeNbrMap.set(fThat, fi);
                }
            }
        }
        return edgeNbrMap;
    }

    /**
     * 从给定的 seedF0s 出发，通过相邻关系找到满足条件的面片
     * @param faces 原始面片集
     * @param newFaces 找到的面片会添加到该数组中
     * @param seedF0s 种子面片的 face 序号
     * @param isF0Valid 面片是否满足条件
     * @returns 返回添加的面片在原面片集中的序号（包含种子面片）
     */
    public static pickNeighbourFaces(
        faces: number[],
        newFaces: number[],
        seedF0s: number[],
        isF0Valid: (fj0: number) => boolean,
        edgeNeighbourMap?: Map<number, number>,
    ): Set<number> {
        const nbrMap = edgeNeighbourMap || MeshAssist.getEdgeNeighbourMap(faces);
        const doneF0s = new Set<number>(seedF0s);

        while (seedF0s.length > 0) {
            const f0 = seedF0s.pop()!;
            for (let i = 0; i < 3; i++) {
                const fj = nbrMap.get(f0 + i);
                if (fj === undefined) continue;

                const fj0 = fj - (fj % 3);
                if (doneF0s.has(fj0) || !isF0Valid(fj0)) continue;

                newFaces.push(faces[fj0], faces[fj0 + 1], faces[fj0 + 2]);
                seedF0s.push(fj0);
                doneF0s.add(fj0);
            }
        }
        return doneF0s;
    }

    /**
     * 根据 nextMap，将对应点投影到 coord 平面上，生成一系列多边形
     * @param mesh
     * @param nextMap
     * @param coord
     */
    public static getLoop2ds(
        mesh: types.IFlatMesh,
        nextMap: Map<number, number[]>,
        coord: Coord3,
    ): types.IXY[][][] {
        // get sideIndices
        const sideIndices = new Set<number>(nextMap.keys());
        for (const nexts of nextMap.values()) {
            for (const v of nexts) {
                sideIndices.add(v);
            }
        }

        // get mergeTable
        const vtxs = Array.from(sideIndices).map(i => {
            const st = i * 3;
            return {
                x: mesh.vertices[st],
                y: mesh.vertices[st + 1],
                z: mesh.vertices[st + 2],
                id: i,
            };
        });

        vtxs.sort((a, b) => {
            if (a.x !== b.x) return a.x - b.x;
            if (a.y !== b.y) return a.y - b.y;
            if (a.z !== b.z) return a.z - b.z;
            return a.id - b.id;
        });

        const mergeTable = new Map<number, number>();
        for (let i = 0; i < vtxs.length; i++) {
            const vi = vtxs[i];
            if (mergeTable.has(vi.id)) continue;

            for (let j = i + 1; j < vtxs.length; j++) {
                const vj = vtxs[j];
                if (vj.x - vi.x > Tol.LENGTH) break;

                if (new Vec3(vi).equals(vj, Tol.LENGTH)) {
                    mergeTable.set(vj.id, vi.id);
                }
            }
        }

        // update NextTable
        const entris = Array.from(nextMap.entries());

        for (const [key, value] of entris) {
            for (let i = 0; i < value.length; i++) {
                const newV = mergeTable.get(value[i]);
                if (newV !== undefined) value[i] = newV;
            }

            const newKey = mergeTable.get(key);
            if (newKey !== undefined) {
                nextMap.delete(key);
                const newValue = nextMap.get(newKey);
                if (newValue) {
                    newValue.push(...value);
                } else {
                    nextMap.set(newKey, value);
                }
            }
        }

        // get loops
        const inputLoops: number[][] = [];
        const normal = coord.getDz();
        const startVertices = new Set<number>(nextMap.keys());

        for (const nexts of nextMap.values()) {
            for (const next of nexts) {
                startVertices.delete(next);
            }
        }

        while (nextMap.size > 0) {
            let cur: number;
            if (startVertices.size > 0) {
                cur = startVertices.keys().next().value as number;

                if (nextMap.get(cur)?.length === 1) startVertices.delete(cur);
            } else {
                cur = nextMap.keys().next().value as number;
            }

            const lastDir = normal.getPerpendicular();

            const loop: number[] = [cur];

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const nexts = nextMap.get(cur);
                if (!nexts) {
                    // weird unclosed loop
                    // handle as closed loop for robust
                    break;
                }

                if (nexts.length === 1) {
                    nextMap.delete(cur);
                    cur = nexts[0];
                } else {
                    const curVtx = new Vec3(
                        mesh.vertices[cur * 3],
                        mesh.vertices[cur * 3 + 1],
                        mesh.vertices[cur * 3 + 2],
                    );
                    lastDir.reverse();

                    const angles = nexts.map(v => {
                        const st = v * 3;
                        const nextDir = curVtx.subtracted({
                            x: mesh.vertices[st],
                            y: mesh.vertices[st + 1],
                            z: mesh.vertices[st + 2],
                        });
                        return lastDir.angleTo(nextDir, normal);
                    });

                    let maxI = 0;
                    for (let i = 1; i < angles.length; i++) {
                        if (angles[i] > angles[maxI]) maxI = i;
                    }

                    cur = nexts[maxI];
                    nexts.splice(maxI, 1);
                }

                if (cur === loop[0]) break;
                loop.push(cur);
            } // while loop

            // if (loop.length > 2)
            inputLoops.push(loop);
        } // while nextMap

        // sort loops
        const SCALE = Tol.CLIPPER_SCALE;
        const paths = inputLoops.map(loop =>
            loop.map(v => {
                const st = v * 3;
                const lp = coord.getLocalPtAt({
                    x: mesh.vertices[st],
                    y: mesh.vertices[st + 1],
                    z: mesh.vertices[st + 2],
                });
                return new ClipperLib.IntPoint(lp.x, lp.y);
            }),
        );
        ClipperLib.JS.ScaleUpPaths(paths, SCALE);

        const clipper = new ClipperLib.Clipper();
        clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
        const polyTree = new ClipperLib.PolyTree();
        clipper.Execute(
            ClipperLib.ClipType.ctUnion,
            polyTree,
            ClipperLib.PolyFillType.pftEvenOdd,
            ClipperLib.PolyFillType.pftEvenOdd,
        );

        // get polygons
        const polygons: types.IXY[][][] = [];
        const nodeStack = polyTree.Childs();
        const clipperToIXY = (v: ClipperLib.IntPoint): types.IXY => {
            return { x: v.X / SCALE, y: v.Y / SCALE };
        };

        while (nodeStack.length > 0) {
            const node = nodeStack.pop()!;
            const loops: types.IXY[][] = [node.Contour().map(clipperToIXY)];

            for (const child of node.Childs()) {
                loops.push(child.Contour().map(clipperToIXY));
                nodeStack.push(...child.Childs());
            }
            polygons.push(loops);
        }
        return polygons;
    }
}