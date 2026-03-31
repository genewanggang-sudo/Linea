import * as ClipperLib from '../../clipperlib/clipperlib';
import { Coord3 } from '../../base/coord3';
import { types } from '../../type_define/i_types';
import { ClipperUtil } from '../../util/clipper_util';
import { DiscreteUtil } from '../discrete/discrete_util';
import { LoopArea } from '../loop_property/loop-area';
import { LoopCentroid } from '../loop_property/loop-centroid';
import { Vec3 } from '../../base/vec3';
import { Tol } from '../../base/tol';
import { MeshAssist } from './mesh_assist';

function getId(vn: number, vi: number, vj: number): number {
    const [vMin, vMax] = vi < vj ? [vi, vj] : [vj, vi];
    return vn * vMin + vMax;
}

function getIdInfo(vn: number, id: number): { vi: number; vj: number } {
    const vi = Math.floor(id / vn);
    const vj = id % vn;
    return { vi, vj };
}

export class MeshContour {
    public static execute(mesh: types.IFlatMesh): types.IXY[][][] {
        const isFacesUp = MeshContour._isFacesUp(mesh, Tol.EDGE_LENGTH_EPS);
        const edgeNbrMap = MeshAssist.getEdgeNeighbourMap(mesh.faces);
        const meshes = MeshContour._splitMesh(mesh, isFacesUp, edgeNbrMap);
        if (!meshes.length) {
            return [];
        }
        const outerLoops = meshes.map(_ => MeshContour._getOuterLoop(_));
        MeshContour._filterLoops(outerLoops, meshes);

        MeshContour._sortMeshes(meshes, outerLoops);

        // // deubg用
        // const polys: Loop[][] = [];
        // for (const res2 of outerLoops) {
        //     const loops: Loop[] = [];
        //     for (const res1 of res2) {
        //         const loop: Curve2[] = [];
        //         for (let i = 0; i < res1.length; i++) {
        //             loop.push(new Ln2(res1[i], res1[(i + 1) % res1.length]));
        //         }
        //         loops.push(new Loop(loop));
        //     }
        //     polys.push(loops);
        // }

        const contours = MeshContour._mixContours(outerLoops);
        const rets = MeshContour._filterSmallLoops(contours);

        return rets;
    }

    // 找到所有的normal朝上或朝下的mesh。debug用
    public static getUpMesh(mesh: types.IFlatMesh) {
        const isFacesUp = MeshContour._isFacesUp(mesh, Tol.EDGE_LENGTH_EPS);
        const edgeNbrMap = MeshAssist.getEdgeNeighbourMap(mesh.faces);
        const meshes = MeshContour._splitMesh(mesh, isFacesUp, edgeNbrMap);

        if (!meshes.length) {
            return [];
        }
        const outerLoops = meshes.map(_ => MeshContour._getOuterLoop(_));
        MeshContour._filterLoops(outerLoops, meshes);

        MeshContour._sortMeshes(meshes, outerLoops);

        return meshes;
    }

    /**
     * 在投影平面上
     * @param mesh
     * @param point
     */
    public static getHeightAtProjectPoint(mesh: types.IFlatMesh, point: types.IXY): number[] {
        const cross = (p1: types.IXY, p2: types.IXY): number => {
            return p1.x * p2.y - p1.y * p2.x;
        };
        const getVtx3 = ({ vertices: vs, faces: fs }: types.IFlatMesh, fi: number): Vec3 => {
            const vSt = fs[fi] * 3;
            return new Vec3(vs[vSt], vs[vSt + 1], vs[vSt + 2]);
        };

        const ret: number[] = [];
        const eps = Tol.NUMBER_CALC_EPS;
        for (let f0 = 0; f0 < mesh.faces.length; f0 += 3) {
            const dps = [0, 1, 2].map(i => {
                const vSt = mesh.faces[f0 + i];
                return { x: point.x - mesh.vertices[vSt * 3], y: point.y - mesh.vertices[vSt * 3 + 1] };
            });

            let positiveCount = 0;
            let negativeCount = 0;

            const tryCross = (i: number, j: number) => {
                const t = cross(dps[i], dps[j]);
                if (t > eps) positiveCount++;
                if (t < -eps) negativeCount++;
            };
            tryCross(0, 1);
            tryCross(1, 2);
            tryCross(2, 0);

            if (positiveCount === 0 || negativeCount === 0) {
                const v0 = getVtx3(mesh, f0);
                const v1 = getVtx3(mesh, f0 + 1);
                const v2 = getVtx3(mesh, f0 + 2);
                const norm = v1.subtracted(v0).cross(v2.subtracted(v0)).normalize();
                const dx = -norm.x / norm.z;
                const dy = -norm.y / norm.z;
                const h = v0.z + (point.x - v0.x) * dx + (point.y - v0.y) * dy;
                ret.push(h);
            }
        }
        return ret;
    }

    private static _isFacesUp(mesh: types.IFlatMesh, areaEps: number): (boolean | undefined)[] {
        const isFaceUp: (boolean | undefined)[] = new Array<boolean | undefined>(mesh.faces.length / 3);

        for (let f0 = 0; f0 < mesh.faces.length; f0 += 3) {
            const v0 = mesh.faces[f0];
            const v1 = mesh.faces[f0 + 1];
            const v2 = mesh.faces[f0 + 2];

            const area = MeshContour._getArea(mesh.vertices, v0, v1, v2);

            isFaceUp[f0 / 3] = area > areaEps ? true : area < -areaEps ? false : undefined;
        }
        return isFaceUp;
    }

    private static _splitMesh(
        mesh: types.IFlatMesh,
        isFacesUp: (boolean | undefined)[],
        edgeNbrMap: Map<number, number>,
    ): types.IFlatMesh[] {
        const meshes: types.IFlatMesh[] = [];
        const todoF0s = new Set<number>();

        for (let f0 = 0; f0 < mesh.faces.length; f0 += 3) {
            todoF0s.add(f0);
        }

        while (todoF0s.size > 0) {
            const seedF0 = todoF0s.values().next().value;
            if (seedF0 === undefined) break;
            todoF0s.delete(seedF0);

            const isCurMeshUp = isFacesUp[seedF0 / 3];
            if (isCurMeshUp === undefined) continue;

            const newFaces = [mesh.faces[seedF0], mesh.faces[seedF0 + 1], mesh.faces[seedF0 + 2]];

            const isFj0Valid = (fj0: number) => {
                const isThatUp = isFacesUp[fj0 / 3];
                return isThatUp === isCurMeshUp || isThatUp === undefined;
            };

            const newF0s = MeshAssist.pickNeighbourFaces(mesh.faces, newFaces, [seedF0], isFj0Valid, edgeNbrMap);
            for (const f0 of newF0s) {
                todoF0s.delete(f0);
            }

            meshes.push({
                faces: newFaces,
                vertices: mesh.vertices,
                normals: mesh.normals,
                uvs: mesh.uvs,
            });
        }
        return meshes;
    }

    private static _getOuterLoop(mesh: types.IFlatMesh): types.IXY[][] {
        const idViMap = new Map<number, number>();
        const vn = mesh.vertices.length / 3;

        for (let f0 = 0; f0 < mesh.faces.length; f0 += 3) {
            for (let i = 0; i < 3; i++) {
                const vi = mesh.faces[f0 + i];
                const vj = mesh.faces[f0 + ((i + 1) % 3)];
                const id = getId(vn, vi, vj);

                if (idViMap.has(id)) {
                    idViMap.delete(id);
                } else {
                    idViMap.set(id, vi);
                }
            }
        }

        const nextMap = MeshContour._idFiMap2NextMap(idViMap, vn);
        const polygon = MeshAssist.getLoop2ds(mesh, nextMap, Coord3.XOY()).flat();

        return polygon;
    }

    private static _idFiMap2NextMap(idFiMap: Map<number, number>, vn: number): Map<number, number[]> {
        const nextMap = new Map<number, number[]>();
        for (const [id, from] of idFiMap) {
            const info = getIdInfo(vn, id);
            const to = info.vi === from ? info.vj : info.vi;

            const nexts = nextMap.get(from);
            if (nexts === undefined) {
                nextMap.set(from, [to]);
            } else {
                nexts.push(to);
            }
        }
        return nextMap;
    }

    private static _filterLoops(outerLoops: types.IXY[][][], meshes: types.IFlatMesh[], areaFilterRatio = 1e-3) {
        for (let i = outerLoops.length - 1; i >= 0; i--) {
            if (outerLoops[i].length === 0) {
                meshes.splice(i, 1);
                outerLoops.splice(i, 1);
            }
        }

        const areas = outerLoops.map(_ => Math.abs(LoopArea.areaOfPoints(_[0])));
        const maxArea = Math.max(...areas);
        for (let i = outerLoops.length - 1; i >= 0; i--) {
            if (areas[i] < maxArea * areaFilterRatio) {
                meshes.splice(i, 1);
                outerLoops.splice(i, 1);
            }
        }
    }

    /**
     * 对 mesh 排序，返回的 mesh 数组按从下到上排序
     * @param meshes
     * @param outerLoops
     */
    private static _sortMeshes(meshes: types.IFlatMesh[], outerLoops: types.IXY[][][]) {
        const lowerCounts = new Array<number>(meshes.length).fill(0);
        const isLower = meshes.map(_ => new Array<boolean | undefined>(meshes.length).fill(undefined));

        for (let i = 0; i < meshes.length; i++) {
            for (let j = i + 1; j < meshes.length; j++) {
                const ret = MeshContour._isMeshLower(meshes[i], meshes[j], outerLoops[i], outerLoops[j]);
                if (ret === undefined) continue;

                isLower[i][j] = ret;
                isLower[j][i] = !ret;
                lowerCounts[ret ? i : j]++;
            }
        }

        const restIndexes: number[] = [];
        const sortedIndexes: number[] = [];
        for (let i = 0; i < meshes.length; i++) {
            if (lowerCounts[i] === 0) {
                sortedIndexes.push(i);
            } else {
                restIndexes.push(i);
            }
        }

        const getUpperIndex = (theIndexes: number[], theIndex: number) => {
            for (let i = 0; i < theIndexes.length; i++) {
                const tmpIndex = theIndexes[i];
                if (isLower[theIndex][tmpIndex]) {
                    return i;
                }
            }
            return undefined;
        };

        while (restIndexes.length > 0) {
            const sortedIndexesNum = sortedIndexes.length;
            for (let i = 0; i < restIndexes.length; i++) {
                const upper = getUpperIndex(restIndexes, restIndexes[i]); // 从剩余的里面找没有当前最上面的mesh的index
                if (!upper) {
                    sortedIndexes.push(restIndexes[i]);
                    restIndexes.splice(i, 1);
                    break;
                }
            }

            if (sortedIndexesNum === sortedIndexes.length) {
                break; // 如果遍历了所有剩余的，没有找到一个upper的mesh，可能是mesh判断upper时出了问题，break，否则就会死循环了
            }
        }

        const newMeshes: types.IFlatMesh[] = [];
        const newOuterLoops: types.IXY[][][] = [];
        for (const index of sortedIndexes) {
            newMeshes.push(meshes[index]);
            newOuterLoops.push(outerLoops[index]);
        }
        meshes.splice(0, meshes.length, ...newMeshes);
        outerLoops.splice(0, meshes.length, ...newOuterLoops);
    }

    private static _isMeshLower(
        mesh1: types.IFlatMesh,
        mesh2: types.IFlatMesh,
        loops1: types.IXY[][],
        loops2: types.IXY[][],
    ): boolean | undefined {
        const polygons = ClipperUtil.boolAsXys([loops1], [loops2], ClipperLib.ClipType.ctIntersection);
        if (polygons.length === 0) return undefined;

        let vertices: types.IXY[] | undefined;
        let faces: number[] | undefined;

        for (const polygon of polygons) {
            const ret = DiscreteUtil.tessVector2(polygon);
            if (ret.faces.length !== 0) {
                vertices = ret.vertices;
                faces = ret.faces;
            }
        }
        if (!vertices || !faces) return undefined;

        let maxArea = 0;
        let maxF0 = 0;

        for (let f0 = 0; f0 < faces.length; f0 += 3) {
            const area = LoopArea.areaOfPoints([vertices[faces[f0]], vertices[faces[f0 + 1]], vertices[faces[f0 + 2]]]);
            if (area > maxArea) {
                maxArea = area;
                maxF0 = f0;
            }
        }

        const center = LoopCentroid.centroidOfPoints([
            vertices[faces[maxF0]],
            vertices[faces[maxF0 + 1]],
            vertices[faces[maxF0 + 2]],
        ]);

        const h1 = MeshContour.getHeightAtProjectPoint(mesh1, center);
        const h2 = MeshContour.getHeightAtProjectPoint(mesh2, center);

        if (!h1.length || !h2.length) return undefined;

        return h1[0] < h2[0];
    }

    private static _mixContours(outerLoops: types.IXY[][][]): types.IXY[][][] {
        const ret = [outerLoops[0]];

        let allPaths = [ClipperUtil.xyLoopsToClipper(outerLoops[0])];

        for (let li = 1; li < outerLoops.length; li++) {
            const paths0 = ClipperUtil.xyLoopsToClipper(outerLoops[li]);

            // dif for new loops
            const newPolygons = ClipperUtil.boolAsXys([paths0], allPaths, ClipperLib.ClipType.ctDifference);
            ret.push(...newPolygons);

            // union for allPaths
            allPaths = ClipperUtil.boolAsClipperPoint([paths0], allPaths, ClipperLib.ClipType.ctUnion);
        } // for outerLoops

        return ret;
    }

    private static _filterSmallLoops(contours: types.IXY[][][]): types.IXY[][][] {
        // filter small area loops
        let maxArea = 0;
        const loopAreaMap = new Map<types.IXY[][], number>();

        for (const contour of contours) {
            const area = Math.abs(LoopArea.areaOfPoints(contour[0]));
            loopAreaMap.set(contour, area);
            if (area > maxArea) maxArea = area;
        }

        const filteredContours: types.IXY[][][] = [];
        const minArea = maxArea * 1e-3;

        for (const contour of contours) {
            {
                const area = loopAreaMap.get(contour)!;
                if (area < minArea) continue;
            }

            const ret: types.IXY[][] = [contour[0]];

            for (let i = 1; i < contour.length; i++) {
                const area = Math.abs(LoopArea.areaOfPoints(contour[i]));
                if (area > minArea) ret.push(contour[i]);
            }
            filteredContours.push(ret);
        }

        // rm single edges
        const rets = filteredContours.map(contour => ClipperUtil.removeGapByOffset(contour, Tol.EDGE_LENGTH_EPS));

        return rets;
    }

    private static _getArea(vertices: number[], v0: number, v1: number, v2: number, vertexSize = 3): number {
        const ofs0 = v0 * vertexSize;
        const ofs1 = v1 * vertexSize;
        const ofs2 = v2 * vertexSize;
        const dx1 = vertices[ofs1] - vertices[ofs0];
        const dy1 = vertices[ofs1 + 1] - vertices[ofs0 + 1];
        const dx2 = vertices[ofs2] - vertices[ofs0];
        const dy2 = vertices[ofs2 + 1] - vertices[ofs0 + 1];
        const area = dx1 * dy2 - dy1 * dx2;
        return area / 2;
    }
}
