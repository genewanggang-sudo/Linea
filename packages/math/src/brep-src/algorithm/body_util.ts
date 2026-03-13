import { Vec3, Tol, MathError } from '../..';
import { BrepBody } from '../brep/brep_body';
import { Face } from '../brep/face';
import { Edge } from '../brep/edge';
import { Vertex } from '../brep/vertex';



export class BodyUtil {
    /**
     * 找到body中与参考face（传入的face0）方向相反的face（如果不传入，默认为朝内的face为需要reversed face）
     * @param body body
     * @param face0 作为正方向的参考face
     */
    public static getReversedFaces(body: BrepBody, face0?: Face): Set<Face> {
        const faces = body.getFaces();
        const todoFaces = [face0 || faces[0]];
        const addedFaces = new Set<Face>(todoFaces);
        const reversedFaces = new Set<Face>();

        while (todoFaces.length > 0) {
            const f0 = todoFaces.pop()!;
            const isF0Reversed = reversedFaces.has(f0);
            for (const wire of f0.getWires()) {
                for (const coedge of wire.getCoedge3ds()) {
                    const twinCoedges = coedge.getTwins(); // 对于存在非流形的body，一条edge对应多条coedge的情况
                    if (twinCoedges.length === 0) {
                        continue;
                    } else if (twinCoedges.length > 1) {
                        let sameDirCoedges = 1;
                        let oppositeDirCoedges = 0;
                        for (const tce of twinCoedges) {
                            const twinFace = tce.getFace();
                            if (!twinFace) {
                                MathError.warn('getReversedFaces: coedge对应的face为undefined');
                                continue;
                            }
                            if (!addedFaces.has(twinFace)) {
                                todoFaces.push(twinFace);
                                addedFaces.add(twinFace);
                            }

                            if (
                                (coedge.getSameDirWithEdge() === tce.getSameDirWithEdge()) ===
                                (f0.getSameDirWithSurface() === twinFace.getSameDirWithSurface())
                            ) {
                                sameDirCoedges++;
                            } else {
                                oppositeDirCoedges++;
                            }
                        }

                        if (sameDirCoedges % 2 || oppositeDirCoedges % 2) {
                            MathError.warn('getReversedFaces: 非流形且face方向存在错误！');
                        }
                        continue;
                    }

                    const twinCoedge = twinCoedges[0];
                    const twinFace = twinCoedge.getFace();
                    if (!twinFace || addedFaces.has(twinFace)) continue;

                    todoFaces.push(twinFace);
                    addedFaces.add(twinFace);

                    if (
                        ((coedge.getSameDirWithEdge() !== twinCoedge.getSameDirWithEdge()) ===
                            (f0.getSameDirWithSurface() === twinFace.getSameDirWithSurface())) ===
                        isF0Reversed
                    ) {
                        reversedFaces.add(twinFace);
                    }
                }
            }
        }

        return reversedFaces;
    }

    /**
     * 处理face的方向，使所有face方向都一致朝向体外
     * @param body
     */
    public static unifyFaceDirectOutside(body: BrepBody): void {
        // 例如球面，圆环面？
        if (body.getFaces().length === 1) {
            // 圆环面？
            return;
        }

        const tol = body.tolerance || Tol.LENGTH;

        // get all top vertexes
        const vtxs = body.getVertexs();
        let topVtxs: Vertex[] = [vtxs[0]];
        for (const vtx of vtxs) {
            if (vtx.getPoint().z > topVtxs[0].getPoint().z + tol) {
                topVtxs = [vtx];
            } else if (Math.abs(vtx.getPoint().z - topVtxs[0].getPoint().z) < tol) {
                topVtxs.push(vtx);
            }
        }

        // get all top vertexes edges
        const topVtEdges: Set<Edge> = new Set();
        for (const vt of topVtxs) {
            vt.getEdges().map(_e => topVtEdges.add(_e));
        }

        let isAllLinearEdges = true;
        for (const e of topVtEdges) {
            if (!e.getCurve().isLine3d()) {
                isAllLinearEdges = false;
                break;
            }
        }

        // get top face : 如果都是直线，最高点就是vertex了；如果有曲线，就从曲线中找有没有不是端点的点有没有最高点，如果有最高点在edge上；否则最高点还是在原来的vertex上
        let topFace: Face | undefined;
        let topFaceNorm: Vec3 = new Vec3(0, 0, 0);
        if (isAllLinearEdges) {
            const topVtxFaces = topVtxs[0].getFaces();
            topFace = topVtxFaces[0];
            topFaceNorm = topFace.getSurface().getNormAtPoint(topVtxs[0].getPoint());
            for (let i = 1; i < topVtxFaces.length; i++) {
                const norm = topVtxFaces[i].getSurface().getNormAtPoint(topVtxs[0].getPoint());
                if (Math.abs(norm.z) > Math.abs(topFaceNorm.z)) {
                    topFace = topVtxFaces[i];
                    topFaceNorm = norm;
                }
            }
        } else {
            // edge上最高位置的点（粗略方法，后续补充）
            let topPt = topVtxs[0].getPoint();
            let topPtEdge: Edge | undefined;
            for (const edge of body.getEdges()) {
                const curve = edge.getCurve();
                if (curve.isLine3d()) {
                    continue;
                } else {
                    const midPt = curve.getMidPt();
                    if (midPt.z > topPt.z + tol) {
                        topPt = midPt;
                        topPtEdge = edge;
                    }

                    const range = curve.getRange();
                    const pt1 = curve.getPtAt(range.min + range.getLength() / 4);
                    if (pt1.z > topPt.z + tol) {
                        topPt = pt1;
                        topPtEdge = edge;
                    }

                    const pt3 = curve.getPtAt(range.min + range.getLength() * 0.75);
                    if (pt3.z > topPt.z + tol) {
                        topPt = pt3;
                        topPtEdge = edge;
                    }
                }
            }

            // 如果edge上有更高的点，就用edge的faces；否则就还是用vertex的faces
            if (topPtEdge) {
                const topVtxFaces = topPtEdge.getFaces();
                topFace = topVtxFaces[0];
                topFaceNorm = topFace.getSurface().getNormAtPoint(topPt);
                for (let i = 1; i < topVtxFaces.length; i++) {
                    const norm = topVtxFaces[i].getSurface().getNormAtPoint(topPt);
                    if (Math.abs(norm.z) > Math.abs(topFaceNorm.z)) {
                        topFace = topVtxFaces[i];
                        topFaceNorm = norm;
                    }
                }
            } else {
                const topVtxFaces = topVtxs[0].getFaces();
                topFace = topVtxFaces[0];
                topFaceNorm = topFace.getSurface().getNormAtPoint(topVtxs[0].getPoint());
                for (let i = 1; i < topVtxFaces.length; i++) {
                    const norm = topVtxFaces[i].getSurface().getNormAtPoint(topVtxs[0].getPoint());
                    if (Math.abs(norm.z) > Math.abs(topFaceNorm.z)) {
                        topFace = topVtxFaces[i];
                        topFaceNorm = norm;
                    }
                }
            }
        }

        // set faces
        topFace.setSameDirWithSurface(topFaceNorm.z > 0);

        const faces = BodyUtil.getReversedFaces(body, topFace);
        for (const face of faces) {
            face.setSameDirWithSurface(!face.getSameDirWithSurface());
        }
    }

    /**
     * 合并body中重合的vertex和edge
     * @param body
     */
    public static mergeCoincideVertexAndEdges(body: BrepBody) {
        const vertexs = body.getVertexs();
        const compare = (pt1: Vec3, pt2: Vec3) => {
            const dz = pt1.z - pt2.z;
            if (dz > 1e-6) {
                return 1;
            }
            if (dz < -1e-6) {
                return -1;
            }

            const dy = pt1.y - pt2.y;
            if (dy > 1e-6) {
                return 1;
            }
            if (dy < -1e-6) {
                return -1;
            }

            return pt1.x - pt2.x;
        };

        vertexs.sort((_a, _b) => compare(_a.getPoint(), _b.getPoint()));

        const overlapVertexes: Vertex[][] = [];
        for (let i = 0; i < vertexs.length - 1; i++) {
            if (vertexs[i].getPoint().equals(vertexs[i + 1].getPoint())) {
                const findVts = overlapVertexes.find(_ => _.find(_v => _v === vertexs[i]));
                if (findVts) {
                    findVts.push(vertexs[i + 1]);
                } else {
                    overlapVertexes.push([vertexs[i], vertexs[i + 1]]);
                }
            }
        }

        const changedEdges: Set<Edge> = new Set();
        if (overlapVertexes.length > 0) {
            for (const vts of overlapVertexes) {
                const vt0 = vts[0];
                for (const e of vt0.getEdges()) {
                    changedEdges.add(e);
                }
                for (let i = 1; i < vts.length; i++) {
                    const edges = vts[i].getEdges();
                    for (const e of edges) {
                        changedEdges.add(e);
                        if (e.getStartVertex() === vts[i]) {
                            e.setStartVertex(vt0);
                        } else {
                            e.setEndVertex(vt0);
                        }
                    }

                    body.deleteVertex(vts[i]);
                }
            }
        }

        const changedEdgesArray = [...changedEdges];
        for (let i = 0; i < changedEdges.size; i++) {
            for (let j = i + 1; j < changedEdges.size; j++) {
                // 如果两条edge重合，那么中点必然也一样。// 如果只是两个端点相同，也不一定就是重合edge，譬如一个圆的两半圆
                if (
                    changedEdgesArray[i].getStartVertex() === changedEdgesArray[j].getStartVertex() &&
                    changedEdgesArray[i].getEndVertex() === changedEdgesArray[j].getEndVertex() &&
                    changedEdgesArray[i].getCurve().getMidPt().equals(changedEdgesArray[j].getCurve().getMidPt())
                ) {
                    this._replaceEdge(changedEdgesArray[j], changedEdgesArray[i]);
                    changedEdgesArray[j].dispose();
                    body.deleteEdge(changedEdgesArray[j]);
                } else if (
                    changedEdgesArray[i].getStartVertex() === changedEdgesArray[j].getEndVertex() &&
                    changedEdgesArray[i].getEndVertex() === changedEdgesArray[j].getStartVertex() &&
                    changedEdgesArray[i].getCurve().getMidPt().equals(changedEdgesArray[j].getCurve().getMidPt())
                ) {
                    this._replaceEdge(changedEdgesArray[j], changedEdgesArray[i]);
                    changedEdgesArray[j].dispose();
                    body.deleteEdge(changedEdgesArray[j]);
                }
            }
        }
    }

    private static _replaceEdge(oldEdge: Edge, newEdge: Edge) {
        const coedges = oldEdge.getCoedge3ds();
        for (let i = 0; i < coedges.length; i++) {
            coedges[i].setEdge(newEdge);
            i--;
        }
    }
}