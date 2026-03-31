import PriorityQueue from 'priorityqueuejs';
import { Vec3 } from '../../base/vec3';
import { Surface } from '../../geometry/surface';
import { types } from '../../type_define/i_types';
import { DiscreteParam } from '../../base/discrete_param';
import { Vec2 } from '../../base/vec2';
import { Box2 } from '../../base/box2';
import { MeshAssist } from '../mesh/mesh_assist';

export interface IMesh2d {
    vertices: types.IXY[];
    faces: number[];
}

interface ICoedgeNode {
    index: number;
    priority: number;
    uv: types.IXY;
    pt: Vec3;
}

// 使用细分三角边的方式对 Mesh 进行优化
export class DiscreteRefiner {
    public static refine(surface: Surface, mesh2d: IMesh2d, params = DiscreteParam.NORMAL): types.IMesh {
        return new DiscreteRefiner(surface, mesh2d, params)._execute();
    }

    public surface: Surface;

    public uvs: types.IXY[];

    public faces: number[];

    public params: DiscreteParam;

    public pts: Vec3[];

    // Map coedge of a triangle edge to the another side
    // key & value are coedges' start vertex's index in mesh.faces
    private _twinMap: Map<number, number>;

    // vertex index => coedgeNode
    private _nodeMap: Map<number, ICoedgeNode>;

    // nodes to split
    private _queue: PriorityQueue<ICoedgeNode>;

    private constructor(surface: Surface, mesh2d: IMesh2d, params = DiscreteParam.NORMAL) {
        this.surface = surface;
        this.uvs = mesh2d.vertices;
        this.faces = mesh2d.faces;
        this.params = params;
        this.pts = this.uvs.map(v => surface.getPtAt(v));
    }

    private _execute(): types.IMesh {
        // 初始化
        this._init();

        // 调整三角化结果（避免狭长三角形）
        this._remesh(this.faces.map((v, idx) => idx));

        // 按优先度逐个离散边
        for (let fi = 0; fi < this.faces.length; fi++) {
            this._enQueue(fi);
        }

        while (this._queue.size() > 0 && this.faces.length < this.params.maxFaceletCount * 3) {
            this._dequeue();
        }

        // 构建离散结果
        const faces = this.faces;
        const retFaces = new Array<types.numberArr3>(faces.length / 3);
        for (let i = 0; i < faces.length; i += 3) {
            retFaces[i / 3] = [faces[i], faces[i + 1], faces[i + 2]];
        }

        return {
            vertices: this.pts.map(v => v.data),
            faces: retFaces,
            uvs: this.uvs.map(uv => [uv.x, uv.y]),
            normals: this.uvs.map(uv => this.surface.getNormAt(uv).data),
        };
    }

    private _init() {
        // key: indexed by a * MAX + b, a & b are the indices of the coedge's vertices in mesh2d.vertices
        // fi: short for "i in faces"
        this._twinMap = MeshAssist.getEdgeNeighbourMap(this.faces);

        this._nodeMap = new Map<number, ICoedgeNode>();
        this._queue = new PriorityQueue<ICoedgeNode>((node1: ICoedgeNode, node2: ICoedgeNode) =>
            node1.priority === node2.priority ? node1.index - node2.index : node1.priority - node2.priority,
        );
    }

    private _getNodeIndex(fi: number): number {
        const fj = this._twinMap.get(fi);
        return fj !== undefined && fj < fi ? fj : fi;
    }

    private _remesh(toChecks: number[]) {
        // 初始化 checkSet
        const checkSet = new Set<number>();
        const checkFi = (fi: number) => {
            const fj = this._twinMap.get(fi);
            if (fj !== undefined) {
                checkSet.add(Math.min(fi, fj));
            }
        };
        for (const fi of toChecks) {
            checkFi(fi);
        }

        // 再三角化之前，对其进行 uv 缩放
        let vZoom: number;
        {
            const srf = this.surface;
            const box = new Box2(this.uvs);
            const corners = [
                srf.getDerivatives(box.min, 1),
                srf.getDerivatives({ x: box.min.x, y: box.max.y }, 1),
                srf.getDerivatives(box.max, 1),
                srf.getDerivatives({ x: box.max.x, y: box.min.y }, 1),
            ];
            const ccDuv = srf.getDerivatives(box.getCenter(), 1);
            let duSum = 0;
            let dvSum = 0;
            for (const duv of corners) {
                duSum += duv[1].getLength();
                dvSum += duv[2].getLength();
            }
            duSum += 4 * ccDuv[1].getLength();
            dvSum += 4 * ccDuv[2].getLength();
            vZoom = dvSum / duSum;
        }

        let loop = 0;
        // 对各待检查边进行检查
        while (checkSet.size > 0) {
            if (loop++ > 10000) {
                throw new Error('dead loop');
            }
            const fi: number = checkSet.keys().next().value as number;
            checkSet.delete(fi);

            const i = fi % 3;
            const f0 = fi - i;
            const fi1 = f0 + ((i + 1) % 3);
            const fi2 = f0 + ((i + 2) % 3);
            const fj = this._twinMap.get(fi)!;
            const j = fj % 3;
            const fj1 = fj - j + ((j + 1) % 3);
            const fj2 = fj - j + ((j + 2) % 3);

            const st = this.faces[fi];
            const ed = this.faces[fi1];
            const opSt = this.faces[fi2];
            const opEd = this.faces[fj2];

            // determin by minDistance to crossLine
            // const pts = [st, opSt, ed, opEd].map(idx => this.pts[idx]);
            // const dir1 = pts[2].subtracted(pts[0]);
            // const dir2 = pts[3].subtracted(pts[1]);
            // const norm = dir1.cross(dir2);
            // const dirVs = [
            //     dir1.cross(norm).normalize(), //
            //     dir2.cross(norm).normalize(),
            // ];
            // const lens: number[] = [];
            // for (let pi = 0; pi < 4; pi++) {
            //     const len = pts[pi].subtracted(pts[(pi + 1) % 4]).dot(dirVs[1 - (pi % 2)]);
            //     lens.push(len);
            // }
            // const toRefine =
            //     lens[1] * lens[3] < 0 &&
            //     lens[2] * lens[0] < 0 &&
            //     Math.min(Math.abs(lens[1]), Math.abs(lens[3])) < Math.min(Math.abs(lens[0]), Math.abs(lens[2]));
            // const msg = `${ti} ${toRefine ? 'c' : '-'}: `;
            // console.log(msg, fi, fi1, fi2, fj, fj1, fj2, st, ed, opSt, opEd, lens);
            // console.log('    ', pts[0].data, pts[1].data);
            // console.log('    ', pts[2].data, pts[3].data);

            // max min angle on uv
            const uvs = [st, opEd, ed, opSt].map(idx => {
                const uv = this.uvs[idx];
                return { x: uv.x, y: uv.y * vZoom };
            });
            const duvs: Vec2[] = new Array<Vec2>(4);
            for (let k = 0; k < 4; k++) {
                duvs[k] = new Vec2(uvs[k], uvs[(k + 1) % 4]).normalize();
            }
            const dir = new Vec2(uvs[0], uvs[2]).normalize();
            const dirOp = new Vec2(uvs[1], uvs[3]).normalize();

            // uv convex
            const dirOpTr = { x: -dirOp.y, y: dirOp.x };
            const valid = duvs[0].dot(dirOpTr) * duvs[2].dot(dirOpTr) < 0;

            if (!valid) continue;

            const angle = Math.min(...duvs.map(_ => Math.abs(_.cross(dir))));
            const angleOp = Math.min(...duvs.map(_ => Math.abs(_.cross(dirOp))));
            const angleSmaller = angle / angleOp;

            // const toRefine = angleSmaller && valid;

            // console.log(uvs, angleOp < angle, valid);
            // console.log(angle1, angle2, angleOp1, angleOp2);
            // console.log(-duvs[2].dot(dir), -duvs[0].dot(dirOp));
            // console.log(duvs[1].data, dir.data, duvs[3].data, dirOp.data);

            // determin by distance to surface
            // closer to surface
            const getDist = (pi: number, pj: number): number => {
                const midUV = new Vec2(this.uvs[pi]).midTo(this.uvs[pj]);
                const midPt = this.surface.getPtAt(midUV);
                const dp = midPt.subtracted(this.pts[pi]);
                const _dir = this.pts[pj].subtracted(this.pts[pi]).normalize();
                return dp.cross(_dir).getLength();
            };
            const curDist = getDist(st, ed);
            const newDist = getDist(opSt, opEd);
            const distCloser = newDist / curDist;
            const toRefine = angleSmaller * distCloser < 1;

            // const toRefine = valid && closer;
            // const msg = `${ti} ${closer ? 'c' : '-'}: `;
            // console.log(msg, fi, fi1, fi2, fj, fj1, fj2, st, ed, opSt, opEd, curDist, newDist);
            // console.log(
            //     `  ${valid ? 'v' : '-'}: `,
            //     uvs.map(uv => [uv.x, uv.y]),
            //     lens,
            // );

            // determin by angle
            // console.log(`${ti}: `, fi, fi1, fi2, fj, fj1, fj2, st, ed, opSt, opEd);
            // if (fj === undefined) {
            //     console.log(this.pts[st], this.pts[ed], this.pts[this.faces[fi2]]);
            //     break; // should never reach continue
            // }

            // const idxs = [st, opSt, ed, opEd];
            // const dps: Vec3[] = [];
            // for (let t = 0; t < 4; t++) {
            //     const nextP = this.pts[idxs[(t + 1) % 4]];
            //     const p = this.pts[idxs[t]];
            //     dps.push(nextP.subtracted(p));
            // }
            // const angles: number[] = [];
            // for (let t = 0; t < 4; t++) {
            //     angles.push(dps[(t + 3) % 4].angle(dps[t]));
            // }
            // const toRefine = Math.min(angles[1], angles[3]) < Math.min(angles[0], angles[2]);
            // const msg = `   ${toRefine ? 'c' : '-'} `;
            // console.log(msg, angles[0], angles[1], angles[2], angles[3]);

            const fi1op = this._twinMap.get(fi1);
            const fi2op = this._twinMap.get(fi2);

            // 对满足条件的边调整其三角化的方式
            if (toRefine || (fi1op === undefined && fi2op === undefined)) {
                // swap fi & fj
                this.faces[fi] = opEd;
                this.faces[fj] = opSt;

                // update twinMap
                if (fi2op !== undefined) {
                    this._twinMap.set(fi2op, fj);
                    this._twinMap.set(fj, fi2op);
                } else {
                    this._twinMap.delete(fj);
                }

                const fj2op = this._twinMap.get(fj2);
                if (fj2op !== undefined) {
                    this._twinMap.set(fj2op, fi);
                    this._twinMap.set(fi, fj2op);
                } else {
                    this._twinMap.delete(fi);
                }

                this._twinMap.set(fi2, fj2);
                this._twinMap.set(fj2, fi2);

                // update checkset
                if (fi2op !== undefined) {
                    checkSet.delete(Math.min(fi2, fi2op));
                    checkSet.add(Math.min(fj, fi2op));
                }

                if (fj2op !== undefined) {
                    checkSet.delete(Math.min(fj2, fj2op));
                    checkSet.add(Math.min(fi, fj2op));
                }

                // check new
                checkFi(fi1);
                checkFi(fj1);
            }

            // check twin
            // this._twinMap.forEach((value, key) => {
            //     const twin = this._twinMap.get(value);
            //     if (twin === undefined) return;
            //     const curSt = this.faces[key];
            //     const curEd = this.faces[key - (key % 3) + ((key + 1) % 3)];
            //     const oppSt = this.faces[value];
            //     const oppEd = this.faces[value - (value % 3) + ((value + 1) % 3)];
            //     if (twin !== key || curSt !== oppEd || oppEd !== curSt) {
            //         console.log(key, value, twin, curSt, curEd, oppSt, oppEd);
            //     }
            // });
        }
    }

    /** 对需要优化拆分的边进行排序 */
    private _enQueue(fi: number) {
        const nodeIndex = this._getNodeIndex(fi);
        if (this._nodeMap.has(nodeIndex)) return;

        const i = fi % 3;
        const f0 = fi - i;
        const fi1 = f0 + ((i + 1) % 3);
        const st = this.faces[fi];
        const ed = this.faces[fi1];
        const midUV = new Vec2(this.uvs[st]).midTo(this.uvs[ed]);
        const midPt = this.surface.getPtAt(midUV);
        const midNorm = this.surface.getNormAt(midUV);
        const dpSt = midPt.subtracted(this.pts[st]);
        const dpEd = this.pts[ed].subtracted(midPt);
        const crossEps2 = dpSt.cross(dpEd).cross(midNorm).getSqLength();
        const crossPriority = crossEps2 / (this.params.crossEps * this.params.crossEps);

        const stNorm = this.surface.getNormAt(this.uvs[st]);
        const edNorm = this.surface.getNormAt(this.uvs[ed]);
        const angle = stNorm.angle(edNorm);
        const anglePriority = angle / this.params.tolerance.angleEps / 2;
        const priority = Math.max(crossPriority, anglePriority);

        // const distance = this.pts[st].midTo(this.pts[ed]).distanceTo(midPt);
        // const norm = this.surface.getNormAt(midUV);
        // const axis = norm.cross(new Vec3(this.pts[st]).subtract(this.pts[ed]));
        // const angle =
        //     Math.PI - Math.abs(Math.PI - dpSt.angleTo(dpEd, axis));
        // const tol = this.params.tolerance;
        // const priority = Math.max(distance / tol.lengthEps, angle / tol.angleEps);

        if (priority > 1) {
            const node = { priority, index: nodeIndex, uv: midUV, pt: midPt };
            this._nodeMap.set(nodeIndex, node);
            this._queue.enq(node);
        }
    }

    /** 拆分三角边 */
    private _dequeue() {
        const node = this._queue.deq();
        this._nodeMap.delete(node.index);

        const fi = node.index;
        const fj = this._twinMap.get(fi);

        // 用相邻角平分线的交点优化离散结果
        // if (fj !== undefined) {
        //     const i = fi % 3;
        //     const j = fj % 3;
        //     const fi2 = fi - i + ((i + 2) % 3);
        //     const fj2 = fj - j + ((j + 2) % 3);

        //     // 最大角与相邻角平分线的交点，与对边角平分线的交点的中点
        //     const fs = [fi, fj2, fj, fi2];
        //     const uvs = fs.map(_ => this.uvs[this.faces[_]]);
        //     const duvs = new Array<Vec2>(4); // 相邻边
        //     const divDirs = new Array<Vec2>(4); // 角平分线
        //     let maxK = -1;

        //     for (let k = 0; k < 4; k++) {
        //         duvs[k] = new Vec2(uvs[(k + 1) % 4]).subtract(uvs[k]).normalize();
        //     }
        //     for (let k = 0; k < 4; k++) {
        //         const v = new Vec2(duvs[k]).subtract(duvs[(k + 3) % 4]);
        //         const vlen = v.getLength();
        //         if (vlen < Tol.PROCESS_LENGTH_EPS) {
        //             maxK = k;
        //             divDirs[k] = new Vec2(-duvs[k].y, duvs[k].x);
        //         } else {
        //             divDirs[k] = v.multiply(1 / vlen);
        //         }
        //     }

        //     // 找到最大角
        //     if (maxK < 0) {
        //         for (let k = 0; k < 4; k++) {
        //             const cross = duvs[(k + 3) % 4].cross(duvs[k]);
        //             if (cross < 0) {
        //                 maxK = k;
        //                 divDirs[k].reverse();
        //                 break;
        //             }
        //         }
        //     }
        //     if (maxK < 0) {
        //         maxK = 0;
        //         let maxAngle = duvs[3].dot(duvs[0]);
        //         for (let k = 1; k < 4; k++) {
        //             const angle = duvs[k - 1].dot(duvs[k]);
        //             if (angle > maxAngle) {
        //                 maxK = k;
        //                 maxAngle = angle;
        //             }
        //         }
        //     }

        //     // 判断对顶点在哪侧
        //     const oppK = (maxK + 2) % 4;
        //     const dOppUv = new Vec2(uvs[oppK]).subtract(uvs[maxK]);
        //     const makeIntersect = (k0: number): Vec2 => {
        //         const k1 = (k0 + 1) % 4;
        //         const xs = LinesX.line2dsParamed(uvs[k0], uvs[k1], divDirs[k0], divDirs[k1]);
        //         return divDirs[k0].multiplied(xs[0]).add(uvs[k0]);
        //     };
        //     const k0 = divDirs[maxK].cross(dOppUv) > 0 ? maxK : (maxK + 1) % 4;
        //     const uv1 = makeIntersect(k0);
        //     const uv2 = makeIntersect((k0 + 2) % 4);
        //     const uvMid = uv1.midTo(uv2);
        //     const ptMid = this.surface.getPtAt(uvMid);
        //     this.uvs.push(uvMid);
        //     this.pts.push(ptMid);
        // } else

        // 经实验，简单取中点拆分效果最佳
        this.uvs.push(node.uv);
        this.pts.push(node.pt);

        const toenQueue: number[] = [];
        const midI = this._splitCoedge(fi, this.uvs.length - 1, toenQueue);

        if (fj !== undefined) {
            const midJ = this._splitCoedge(fj, this.uvs.length - 1, toenQueue);

            this._twinMap.set(midI, fj);
            this._twinMap.set(fj, midI);
            this._twinMap.set(midJ, fi);
            this._twinMap.set(fi, midJ);
        }
        toenQueue.forEach(t => this._enQueue(t));
    }

    /**
     * split triangle
     * @param fi coedge to split
     * @param idx3 new point's index
     * @param toenQueue new coedges to enqueue
     */
    private _splitCoedge(fi: number, idx3: number, toenQueue: number[]): number {
        // return new mid
        const i = fi % 3;
        const f0 = fi - i;
        const fi1 = f0 + ((i + 1) % 3);
        const fi2 = f0 + ((i + 2) % 3);
        const idx1 = this.faces[fi1];
        const idx2 = this.faces[fi2];
        this.faces[fi1] = idx3;
        this.faces.push(idx3, idx1, idx2);
        const fj0 = this.faces.length - 3;

        // node in this._queue
        const nodeF1 = this._nodeMap.get(fi1);
        if (nodeF1) {
            this._nodeMap.delete(fi1);

            const fi1Op = this._twinMap.get(fi1);
            const fIdx = fi1Op !== undefined ? fi1Op : fj0 + 1;
            nodeF1.index = fIdx;
            this._nodeMap.set(fIdx, nodeF1);
        }

        // update map
        // op2
        const op = this._twinMap.get(fi1);
        if (op !== undefined) {
            this._twinMap.set(fj0 + 1, op);
            this._twinMap.set(op, fj0 + 1);
        } else {
            this._twinMap.delete(fj0 + 1);
        }

        // mid
        this._twinMap.set(fi1, fj0 + 2);
        this._twinMap.set(fj0 + 2, fi1);

        // enQueue
        toenQueue.push(fi, fi1, fj0);

        return fj0;
    }
}
