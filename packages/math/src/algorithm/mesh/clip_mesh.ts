import { types } from '../../type_define/i_types';
import { Plane } from '../../geometry/plane';
import { Vec3 } from '../../base/vec3';
import { Tol } from '../../base/tol';
import { D } from '../calc_d';
import { Ln3 } from '../../geometry/ln3';
import { X } from '../calc_x';
import { Vec2 } from '../../base/vec2';
import { Polygon } from '../../topology/polygon';
import { SearchGraph } from '../search_graph';



export interface IMeshClipResult {
    clipped: boolean;
    aboveMesh: types.IRenderMesh;
    downMesh?: types.IRenderMesh;
}

interface IVertexInfo {
    point: types.numberArr3;
    vector: Vec3;
    normal: types.numberArr3;
    uv: types.numberArr2;
}
/**
 * 平面切Mesh
 */
export class ClipMesh {
    /**
     * 平面切mesh
     * @param rn mesh
     * @param plane 平面
     * @param keepDoubleSide 保留平面两侧的mesh(默认只保留上方 keepDoubleSide = false)
     * @param deleteCoplanar 删除共面的三角面片(default deleteCoplanar = true)
     */
    public static clipFaceMesh(
        rn: types.IRenderMesh,
        plane: Plane,
        keepDoubleSide: boolean = false,
        deleteCoplanar = true,
    ): IMeshClipResult {
        // 分类点
        const vertexIdxesAbovePlane: Set<number> = new Set();
        const vertexIdxesOnPlane: Set<number> = new Set();
        const vertexIdxesDownPlane: Set<number> = new Set();
        rn.mesh.vertices.forEach((v, idx) => {
            const p = new Vec3(v);
            const distance = D.ptToSurfSigned(p, plane);
            const eps = Tol.LENGTH;
            if (distance > eps) {
                vertexIdxesAbovePlane.add(idx);
            } else if (distance < -eps) {
                vertexIdxesDownPlane.add(idx);
            } else if (Math.abs(distance) <= eps) {
                vertexIdxesOnPlane.add(idx);
            }
        });

        // 平面上方的面，包括在面上
        const aboveFaces: types.numberArr3[] = [];
        // 和平面共面的face
        const faceCoplanar: Set<number> = new Set();
        // 和平面相交的face，包括相交，相接
        const faceIntersected: Set<number> = new Set();
        // 平面下方的面
        const downFaces: types.numberArr3[] = [];
        rn.mesh.faces.forEach(([idx1, idx2, idx3], faceIdx) => {
            // 分类face
            if (vertexIdxesOnPlane.has(idx1) && vertexIdxesOnPlane.has(idx2) && vertexIdxesOnPlane.has(idx3)) {
                aboveFaces.push([idx1, idx2, idx3]);
                faceCoplanar.add(aboveFaces.length - 1);
            } else if (
                !vertexIdxesDownPlane.has(idx1) &&
                !vertexIdxesDownPlane.has(idx2) &&
                !vertexIdxesDownPlane.has(idx3)
            ) {
                aboveFaces.push([idx1, idx2, idx3]);
            } else if (
                !vertexIdxesAbovePlane.has(idx1) &&
                !vertexIdxesAbovePlane.has(idx2) &&
                !vertexIdxesAbovePlane.has(idx3)
            ) {
                downFaces.push([idx1, idx2, idx3]);
            } else {
                faceIntersected.add(faceIdx);
            }
        });

        const aboveMesh = rn;
        let downMesh: types.IRenderMesh;
        if (keepDoubleSide) {
            downMesh = this._cloneRenderMesh(rn);
        }

        // 相交处理
        faceIntersected.forEach(faceidx => {
            const actualFace = rn.mesh.faces[faceidx];
            const ptIndexsAbove = actualFace.filter(vertexid => {
                return vertexIdxesAbovePlane.has(vertexid);
            });
            const ptIndexsDown = actualFace.filter(vertexid => {
                return vertexIdxesDownPlane.has(vertexid);
            });
            const ptIndexsOn = actualFace.filter(vertexid => {
                return vertexIdxesOnPlane.has(vertexid);
            });
            const originDir = this._calNormal(rn.mesh.vertices, actualFace[0], actualFace[1], actualFace[2]);
            if (ptIndexsAbove.length === 1 && ptIndexsDown.length === 1) {
                // 一个在上，一个在下
                const vertexAboveInfo = ClipMesh._getVertexInfo(rn, ptIndexsAbove[0]);
                const vertexDownInfo = ClipMesh._getVertexInfo(rn, ptIndexsDown[0]);
                const intersect = this._calIntersectInfo(plane, vertexAboveInfo!, vertexDownInfo!);

                aboveMesh.mesh.vertices.push(intersect.point);
                aboveMesh.mesh.normals.push(intersect.normal);
                aboveMesh.mesh.uvs.push(intersect.uv);
                const newVertexId = aboveMesh.mesh.vertices.length - 1;
                if (keepDoubleSide) {
                    downMesh.mesh.vertices.push(intersect.point.slice() as types.numberArr3);
                    downMesh.mesh.normals.push(intersect.normal.slice() as types.numberArr3);
                    downMesh.mesh.uvs.push(intersect.uv.slice() as types.numberArr2);
                }

                aboveFaces.push(
                    this._reorderPts(rn.mesh.vertices, originDir, ptIndexsAbove[0], ptIndexsOn[0], newVertexId),
                );
                if (keepDoubleSide) {
                    downFaces.push(
                        this._reorderPts(rn.mesh.vertices, originDir, ptIndexsDown[0], ptIndexsOn[0], newVertexId),
                    );
                }
            } else if (ptIndexsAbove.length === 1 && ptIndexsDown.length === 2) {
                // 一个在上，两个在下
                const vertexAboveInfo = ClipMesh._getVertexInfo(rn, ptIndexsAbove[0]);
                const vertexDownInfo1 = ClipMesh._getVertexInfo(rn, ptIndexsDown[0]);
                const vertexDownInfo2 = ClipMesh._getVertexInfo(rn, ptIndexsDown[1]);

                const intersect1 = this._calIntersectInfo(plane, vertexAboveInfo!, vertexDownInfo1!);
                aboveMesh.mesh.vertices.push(intersect1.point);
                aboveMesh.mesh.normals.push(intersect1.normal);
                aboveMesh.mesh.uvs.push(intersect1.uv);
                const newVertexId1 = aboveMesh.mesh.vertices.length - 1;
                if (keepDoubleSide) {
                    downMesh.mesh.vertices.push(intersect1.point.slice() as types.numberArr3);
                    downMesh.mesh.normals.push(intersect1.normal.slice() as types.numberArr3);
                    downMesh.mesh.uvs.push(intersect1.uv.slice() as types.numberArr2);
                }

                const intersect2 = this._calIntersectInfo(plane, vertexAboveInfo!, vertexDownInfo2!);
                aboveMesh.mesh.vertices.push(intersect2.point);
                aboveMesh.mesh.normals.push(intersect2.normal);
                aboveMesh.mesh.uvs.push(intersect2.uv);
                const newVertexId2 = aboveMesh.mesh.vertices.length - 1;
                if (keepDoubleSide) {
                    downMesh.mesh.vertices.push(intersect2.point.slice() as types.numberArr3);
                    downMesh.mesh.normals.push(intersect2.normal.slice() as types.numberArr3);
                    downMesh.mesh.uvs.push(intersect2.uv.slice() as types.numberArr2);
                }

                aboveFaces.push(
                    this._reorderPts(rn.mesh.vertices, originDir, ptIndexsAbove[0], newVertexId1, newVertexId2),
                );
                if (keepDoubleSide) {
                    downFaces.push(
                        this._reorderPts(rn.mesh.vertices, originDir, ptIndexsDown[0], newVertexId1, newVertexId2),
                    );
                    downFaces.push(
                        this._reorderPts(rn.mesh.vertices, originDir, ptIndexsDown[0], ptIndexsDown[1], newVertexId2),
                    );
                }
            } else if (ptIndexsAbove.length === 2 && ptIndexsDown.length === 1) {
                // 两个在上，一个在下
                const vertexAboveInfo1 = ClipMesh._getVertexInfo(rn, ptIndexsAbove[0]);
                const vertexAboveInfo2 = ClipMesh._getVertexInfo(rn, ptIndexsAbove[1]);
                const vertexDownInfo = ClipMesh._getVertexInfo(rn, ptIndexsDown[0]);

                const intersect1 = this._calIntersectInfo(plane, vertexAboveInfo1!, vertexDownInfo!);
                aboveMesh.mesh.vertices.push(intersect1.point);
                aboveMesh.mesh.normals.push(intersect1.normal);
                aboveMesh.mesh.uvs.push(intersect1.uv);
                const newVertexId1 = aboveMesh.mesh.vertices.length - 1;
                if (keepDoubleSide) {
                    downMesh.mesh.vertices.push(intersect1.point.slice() as types.numberArr3);
                    downMesh.mesh.normals.push(intersect1.normal.slice() as types.numberArr3);
                    downMesh.mesh.uvs.push(intersect1.uv.slice() as types.numberArr2);
                }

                const intersect2 = this._calIntersectInfo(plane, vertexAboveInfo2!, vertexDownInfo!);
                aboveMesh.mesh.vertices.push(intersect2.point);
                aboveMesh.mesh.normals.push(intersect2.normal);
                aboveMesh.mesh.uvs.push(intersect2.uv);
                const newVertexId2 = aboveMesh.mesh.vertices.length - 1;
                if (keepDoubleSide) {
                    downMesh.mesh.vertices.push(intersect2.point.slice() as types.numberArr3);
                    downMesh.mesh.normals.push(intersect2.normal.slice() as types.numberArr3);
                    downMesh.mesh.uvs.push(intersect2.uv.slice() as types.numberArr2);
                }

                aboveFaces.push(
                    this._reorderPts(rn.mesh.vertices, originDir, ptIndexsAbove[0], newVertexId1, newVertexId2),
                );
                aboveFaces.push(
                    this._reorderPts(rn.mesh.vertices, originDir, ptIndexsAbove[0], newVertexId2, ptIndexsAbove[1]),
                );
                if (keepDoubleSide) {
                    downFaces.push(
                        this._reorderPts(rn.mesh.vertices, originDir, ptIndexsDown[0], newVertexId1, newVertexId2),
                    );
                }
            }
        });

        if (deleteCoplanar) {
            const faceToDeleteArray = Array.from(faceCoplanar).sort((a, b) => {
                return b - a;
            });
            faceToDeleteArray.forEach(id => {
                aboveFaces.splice(id, 1);
            });
        }
        aboveMesh.mesh.faces = aboveFaces;
        if (keepDoubleSide) {
            downMesh!.mesh.faces = downFaces;
        }

        let clipped = false;
        if (deleteCoplanar && faceCoplanar.size > 0) {
            clipped = true;
        }
        if (keepDoubleSide && faceIntersected.size > 0) {
            clipped = true;
        }
        if (!keepDoubleSide && vertexIdxesDownPlane.size > 0) {
            clipped = true;
        }

        return {
            clipped,
            aboveMesh,
            downMesh: keepDoubleSide ? downMesh! : undefined,
        };
    }

    // 面与mesh得相交结果
    public static meshPlaneIntersect(rn: types.IRenderMesh, plane: Plane): Polygon {
        const vertexIdxesAbovePlane: Set<number> = new Set();
        const vertexIdxesOnPlane: Set<number> = new Set();
        const vertexIdxesDownPlane: Set<number> = new Set();
        rn.mesh.vertices.forEach((v, idx) => {
            const p = new Vec3(v);
            const distance = D.ptToSurfSigned(p, plane);
            const eps = Tol.LENGTH;
            if (distance > eps) {
                vertexIdxesAbovePlane.add(idx);
            } else if (distance < -eps) {
                vertexIdxesDownPlane.add(idx);
            } else if (Math.abs(distance) <= eps) {
                vertexIdxesOnPlane.add(idx);
            }
        });

        // 和平面相交的face，包括相交，相接
        const faceIntersected: Set<number> = new Set();
        // 分类face
        rn.mesh.faces.forEach(([idx1, idx2, idx3], faceIdx) => {
            if (
                (vertexIdxesAbovePlane.has(idx1) ||
                    vertexIdxesAbovePlane.has(idx2) ||
                    vertexIdxesAbovePlane.has(idx3)) &&
                (!vertexIdxesAbovePlane.has(idx1) ||
                    !vertexIdxesAbovePlane.has(idx2) ||
                    !vertexIdxesAbovePlane.has(idx3))
            ) {
                // 至少一个顶点在平面上方，且至少一个顶点不在平面上方
                faceIntersected.add(faceIdx);
            }
        });

        // 相交处理
        const intersectedLines: Ln3[] = [];
        faceIntersected.forEach(faceidx => {
            const actualFace = rn.mesh.faces[faceidx];
            const ptIndexsAbove = actualFace.filter(vertexid => {
                return vertexIdxesAbovePlane.has(vertexid);
            });
            const ptIndexsDown = actualFace.filter(vertexid => {
                return vertexIdxesDownPlane.has(vertexid);
            });
            const ptIndexsOn = actualFace.filter(vertexid => {
                return vertexIdxesOnPlane.has(vertexid);
            });
            if (ptIndexsAbove.length === 1 && ptIndexsDown.length === 1) {
                // 一个在上，一个在下
                const vertexAboveInfo = ClipMesh._getVertexInfo(rn, ptIndexsAbove[0]);
                const vertexDownInfo = ClipMesh._getVertexInfo(rn, ptIndexsDown[0]);
                const vertexOnInfo = ClipMesh._getVertexInfo(rn, ptIndexsOn[0]);

                const line = new Ln3(vertexAboveInfo?.vector!, vertexDownInfo?.vector!);
                const intersectedVec = X.curveSurface(line, plane)[0];
                intersectedLines.push(new Ln3(vertexOnInfo?.vector!, intersectedVec));
            } else if (ptIndexsAbove.length === 1 && ptIndexsDown.length === 2) {
                // 一个在上，两个在下
                const vertexAboveInfo = ClipMesh._getVertexInfo(rn, ptIndexsAbove[0]);
                const vertexDownInfo1 = ClipMesh._getVertexInfo(rn, ptIndexsDown[0]);
                const vertexDownInfo2 = ClipMesh._getVertexInfo(rn, ptIndexsDown[1]);

                const line1 = new Ln3(vertexAboveInfo?.vector!, vertexDownInfo1?.vector!);
                const intersectedVec1 = X.curveSurface(line1, plane)[0];

                const line2 = new Ln3(vertexAboveInfo?.vector!, vertexDownInfo2?.vector!);
                const intersectedVec2 = X.curveSurface(line2, plane)[0];

                intersectedLines.push(new Ln3(intersectedVec1, intersectedVec2));
            } else if (ptIndexsAbove.length === 2 && ptIndexsDown.length === 1) {
                // 两个在上，一个在下
                const vertexAboveInfo1 = ClipMesh._getVertexInfo(rn, ptIndexsAbove[0]);
                const vertexAboveInfo2 = ClipMesh._getVertexInfo(rn, ptIndexsAbove[1]);
                const vertexDownInfo = ClipMesh._getVertexInfo(rn, ptIndexsDown[0]);

                const line1 = new Ln3(vertexAboveInfo1?.vector!, vertexDownInfo?.vector!);
                const intersectedVec1 = X.curveSurface(line1, plane)[0];

                const line2 = new Ln3(vertexAboveInfo2?.vector!, vertexDownInfo?.vector!);
                const intersectedVec2 = X.curveSurface(line2, plane)[0];

                intersectedLines.push(new Ln3(intersectedVec1, intersectedVec2));
            } else if (ptIndexsAbove.length === 1 && ptIndexsOn.length === 2) {
                // 两个在平面，一个在上
                const ptOn1 = rn.mesh.vertices[ptIndexsOn[0]];
                const vecOn1 = new Vec3(ptOn1);
                const ptOn2 = rn.mesh.vertices[ptIndexsOn[1]];
                const vecOn2 = new Vec3(ptOn2);
                intersectedLines.push(new Ln3(vecOn1, vecOn2));
            }
        });

        // 交线少于三，无法构成多边形
        if (intersectedLines.length < 3) {
            return new Polygon();
        }

        // 离散线段成环
        const intersectedLine2ds = intersectedLines.map(line => plane.getLine2D(line)!);
        const polygon = SearchGraph.simplePolygon(intersectedLine2ds.filter(_ => !!_));
        if (polygon) {
            return polygon;
        }
        return new Polygon();
    }

    private static _calIntersectInfo(plane: Plane, v1: IVertexInfo, v2: IVertexInfo): IVertexInfo {
        const line = new Ln3(v1.vector, v2.vector);
        const intersectedVec = X.curveSurface(line, plane)[0];
        const intersectedVec2ptAboveDist = intersectedVec.distanceTo(v1?.vector!);
        const intersectedVec2ptDownDist = intersectedVec.distanceTo(v2?.vector!);
        const ratio = intersectedVec2ptAboveDist / (intersectedVec2ptDownDist + intersectedVec2ptAboveDist);
        const intersectedNormal = new Vec3(v1?.normal!).interpolate(new Vec3(v2.normal), ratio);
        const intersectedUV = new Vec2(v1.uv).interpolate(new Vec2(v2.uv), ratio);
        return {
            point: intersectedVec.toArray3(),
            vector: intersectedVec,
            normal: intersectedNormal.toArray3(),
            uv: intersectedUV.toArray2(),
        };
    }

    private static _getVertexInfo(rn: types.IRenderMesh, index: number): IVertexInfo | undefined {
        const pt = rn.mesh.vertices[index];
        const vec = new Vec3(pt);
        const normal = rn.mesh.normals[index];
        const uv = rn.mesh.uvs[index];
        return { point: pt, vector: vec, normal, uv };
    }

    private static _cloneRenderMesh(rn: types.IRenderMesh): types.IRenderMesh {
        return {
            mesh: {
                vertices: rn.mesh.vertices.map(v => v.slice() as types.numberArr3),
                faces: rn.mesh.faces.map(f => f.slice() as types.numberArr3),
                normals: rn.mesh.normals.map(n => n.slice() as types.numberArr3),
                uvs: rn.mesh.uvs.map(uv => uv.slice() as types.numberArr2),
            },
        };
    }

    private static _calNormal(vertices: types.numberArr3[], a: number, b: number, c: number) {
        return new Vec3(new Vec3(vertices[a]), new Vec3(vertices[b])).cross(
            new Vec3(new Vec3(vertices[b]), new Vec3(vertices[c])),
        );
    }

    private static _reorderPts(
        vertices: types.numberArr3[],
        refNormal: Vec3,
        a: number,
        b: number,
        c: number,
    ): types.numberArr3 {
        const dir = new Vec3(new Vec3(vertices[a]), new Vec3(vertices[b])).cross(
            new Vec3(new Vec3(vertices[b]), new Vec3(vertices[c])),
        );
        if (refNormal.dot(dir) > 0) {
            return [a, b, c];
        }
        return [a, c, b];
    }
}