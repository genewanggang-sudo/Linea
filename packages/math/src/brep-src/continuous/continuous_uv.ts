/* eslint-disable no-lonely-if */
/* eslint-disable consistent-return */
/* eslint-disable no-param-reassign */
/* eslint-disable no-loop-func */
import { types, Vec3, Vec2, InvBilinear, Util, Ln3, Plane, alg } from '../..';
import { Face } from '../brep/face';
import { Vertex } from '../brep/vertex';
import { Edge } from '../brep/edge';



interface IFaceUVMapping {
    // 面上的三维点, 计算3个点(不压缩的情况), 4个点(压缩的情况)
    pts: Vec3[];

    // 整体展开后, 二维上的uv值
    uvs: types.numberArr2[];
}

const zero = { x: 0, y: 0 };

/**
 * 多个面一起离散, 得到UV连续的效果
 */
export class ContinuousUVComputor {
    /**
     * 计算连续面所产生的mesh, 得到整体uv连续的mesh(某些不适用的情况, 则会得到uv不连续的mesh)
     * @param faces
     */
    public static tessellateFaces(faces: Face[], uvContinuous = true): types.IMesh | undefined {
        if (faces.length <= 0) {
            return undefined;
        }
        if (faces.length === 1) {
            return faces[0].tessellate().mesh;
        }

        // 1.多个面展开, 映射到二维平面, 计算展开后的uv范围
        let result: any;
        if (uvContinuous) {
            result = this._computeFacesUVMapping(faces);
        }

        const meshDatas: types.IMesh[] = [];
        for (const face of faces) {
            // 2.1 每个面生成mesh
            const meshData = this._tesslateFace(face);
            if (!meshData) {
                continue;
            }
            meshDatas.push(meshData);

            if (uvContinuous) {
                const faceUVMapping = result!.faceUVMapping.get(face);
                if (!faceUVMapping) {
                    continue;
                }
                // 2.2 更新每个面所对应mesh的uv值
                this._recalculateMeshUV(face, meshData, faceUVMapping, result!.linear);
            }
        }

        // 3.mesh 合并成一个
        return this._mergeMesh(meshDatas);
    }

    private static _ptToKey(arr: number[]) {
        return arr.map(_ => Math.round(_ * 1e6).toFixed(0)).join('_');
    }

    private static _tesslateFace(face: Face) {
        const meshData = face.tessellate().mesh;
        if (!meshData) {
            return undefined;
        }
        // 修改normal
        const map = new Map<string, types.numberArr3>();
        face.getEdges()
            .filter(edge => edge.getSmooth())
            .forEach(edge => {
                const s = edge.getStartVertex().getPoint().toArray3();
                const e = edge.getEndVertex().getPoint().toArray3();
                const twins = edge.getFaces();
                if (twins.length !== 2) {
                    return;
                }
                const normal1 = twins[0].getNormAt(zero);
                const normal2 = twins[1].getNormAt(zero);
                const normal = normal1.add(normal2).normalize().toArray3();
                map.set(this._ptToKey(s), normal);
                map.set(this._ptToKey(e), normal);
            });

        for (let i = 0; i < meshData.vertices.length; i++) {
            const ptKey = this._ptToKey(meshData.vertices[i]);
            const normal = map.get(ptKey);
            if (normal) {
                meshData.normals[i] = normal;
            }
        }

        return meshData;
    }

    // 将面展开到二维, 整体计算uv
    // TODO... 使用通用的mesh展平算法 https://blog.csdn.net/chenguowen21/article/details/97479308
    private static _computeFacesUVMapping(faces: Face[]): {
        faceUVMapping: Map<Face, IFaceUVMapping>;
        linear: boolean;
    } {
        // 找几个面, 分析soft edge
        const testVs = new Set<Vertex>();
        faces.slice(0, 2).forEach(f => f.getVertexes().forEach(v => testVs.add(v)));
        let testSoftEdges = faces[0].getEdges().filter(e => e.getSmooth());
        testSoftEdges.push(...faces[1].getEdges().filter(e => e.getSmooth()));
        if (faces.length > 2) {
            testSoftEdges.push(...faces[2].getEdges().filter(e => e.getSmooth()));
            faces[2].getVertexes().forEach(v => testVs.add(v));
        }
        testSoftEdges = Array.from(new Set(testSoftEdges));

        let isCylinder = false;
        let isCone = false;
        let isTorus = false;

        const singleDirSoft = Array.from(testVs).every(v => {
            return v.getEdges().filter(e => e.getSmooth()).length <= 2;
        });
        if (singleDirSoft) {
            const testDirs = testSoftEdges.map(e => (e.getCurve() as Ln3).getDirection());
            if (testDirs.every(dir => dir.isParallel(testDirs[0]))) {
                // 简单情况, 类圆柱面, 有一个方向是线性的
                isCylinder = true;
            } else {
                // 类圆锥面, 有一个方向需要进行纹理压缩
                isCone = true;
            }
        } else {
            // 类圆环面, 有一个方向需要进行纹理压缩
            // TODO... 再区分其他类型的
            isTorus = true;
        }

        const faceUVMapping = new Map<Face, IFaceUVMapping>();
        if (isCylinder) {
            this._calCylinderUVRange(faces, faceUVMapping);
        } else if (isCone) {
            this._calConeUVRange(faces, faceUVMapping);
        } else if (isTorus) {
            this._calTorusUVRange(faces, faceUVMapping);
        }

        return {
            faceUVMapping,
            linear: isCylinder,
        };
    }

    private static _calCompressUVRange(refFace: Face, refSoftEdge: Edge, faceUVMapping: Map<Face, IFaceUVMapping>) {
        let vRefDir = (refSoftEdge.getCurve() as Ln3).getDirection();
        let vSameDir = true;
        const tmpPlane = refFace.getSurface() as Plane;
        const xDot = vRefDir.dot(tmpPlane.getCoord().getDx());
        const yDot = vRefDir.dot(tmpPlane.getCoord().getDy());
        if (Math.abs(xDot) > Math.abs(yDot)) {
            if (xDot < 0) {
                vRefDir = vRefDir.reversed();
                vSameDir = false;
            }
        } else {
            if (yDot < 0) {
                vRefDir = vRefDir.reversed();
                vSameDir = false;
            }
        }

        interface IFaceUVInfo {
            face: Face;
            refV: Vec3;
            refN: Vec3;
            v0: Vertex;
            v1: Vertex;
            uEdge0: Edge | undefined;
            uEdge1: Edge | undefined;
            refVEdge: Edge;
            right: boolean;
        }

        const faceUVInfoArrays: IFaceUVInfo[][] = [];

        const getNeighborEdges = (e: Edge, start: boolean, f: Face) => {
            let neighborEs = start ? e.getStartVertex().getEdges() : e.getEndVertex().getEdges();
            neighborEs = neighborEs.filter(
                it =>
                    it !== e &&
                    (it.getStartVertex().getSmooth() || it.getEndVertex().getSmooth()) &&
                    it.getFaces().indexOf(f) > -1,
            );
            return neighborEs.length ? neighborEs[0] : undefined;
        };

        const uEdge0 = getNeighborEdges(refSoftEdge, vSameDir, refFace);
        const uEdge1 = getNeighborEdges(refSoftEdge, !vSameDir, refFace);
        const refNormal = (refFace.getSurface() as Plane).getNorm();
        const rightDir = vRefDir.cross(refNormal);
        const rightFlag = refFace
            .getVertexes()
            .some(it => this._onRefSide(it.getPoint(), refSoftEdge.getStartVertex().getPoint(), rightDir));

        const firstVFaces: IFaceUVInfo[] = [];
        firstVFaces.push({
            face: refFace,
            refV: vRefDir,
            refN: refNormal,
            v0: vSameDir ? refSoftEdge.getStartVertex() : refSoftEdge.getEndVertex(),
            v1: vSameDir ? refSoftEdge.getEndVertex() : refSoftEdge.getStartVertex(),
            uEdge0,
            uEdge1,
            refVEdge: refSoftEdge,
            right: rightFlag,
        });

        const vCalculator = (
            curFace: Face,
            curUSoftEdge: Edge | undefined,
            curVSoftEdge: Edge | undefined,
            curVSameDir: boolean,
            right: boolean,
            up: boolean,
            vFaces: IFaceUVInfo[],
        ) => {
            while (curVSoftEdge && curUSoftEdge && curUSoftEdge.getSmooth()) {
                const v1 = curVSameDir === up ? curVSoftEdge!.getEndVertex() : curVSoftEdge!.getStartVertex();
                const upFaces = curUSoftEdge.getFaces().filter(f => f && f !== curFace);
                curVSoftEdge = undefined;
                if (upFaces.length) {
                    curFace = upFaces[0];
                    const upEdges = v1.getEdges().filter(e => e !== curUSoftEdge && curFace.getEdges().indexOf(e) > -1);
                    if (upEdges.length && vFaces.findIndex(it => it.face === curFace) < 0) {
                        curVSoftEdge = upEdges[0];
                    }
                }
                if (curVSoftEdge) {
                    let curVRefDir = (curVSoftEdge.getCurve() as Ln3).getDirection();
                    curVSameDir = true;
                    if (up === (curVSoftEdge.getEndVertex() === v1)) {
                        curVRefDir = curVRefDir.reversed();
                        curVSameDir = false;
                    }
                    const curUEdge0 = getNeighborEdges(curVSoftEdge, curVSameDir, curFace);
                    const curUEdge1 = getNeighborEdges(curVSoftEdge, !curVSameDir, curFace);
                    curUSoftEdge = up ? curUEdge1 : curUEdge0;

                    const info = {
                        face: curFace,
                        refV: curVRefDir,
                        refN: (curFace.getSurface() as Plane).getNorm(),
                        v0: curVSameDir ? curVSoftEdge.getStartVertex() : curVSoftEdge.getEndVertex(),
                        v1: curVSameDir ? curVSoftEdge.getEndVertex() : curVSoftEdge.getStartVertex(),
                        uEdge0: curUEdge0,
                        uEdge1: curUEdge1,
                        refVEdge: curVSoftEdge,
                        right,
                    };
                    if (up) {
                        vFaces.push(info);
                    } else {
                        vFaces.unshift(info);
                    }
                }
            }
        };

        // 寻找第一个v向面环
        // 向上找
        vCalculator(
            firstVFaces[0].face,
            firstVFaces[0].uEdge1,
            refSoftEdge,
            vSameDir,
            firstVFaces[0].right,
            true,
            firstVFaces,
        );

        // 向下找
        vCalculator(
            firstVFaces[0].face,
            firstVFaces[0].uEdge0,
            refSoftEdge,
            vSameDir,
            firstVFaces[0].right,
            false,
            firstVFaces,
        );

        let vIndex = 0;
        let uLength = firstVFaces[vIndex].uEdge0 ? firstVFaces[vIndex].uEdge0!.getCurve().getLength() : 0;
        for (let i = 1; i < firstVFaces.length; i++) {
            const tmpLength = firstVFaces[i].uEdge0 ? firstVFaces[i].uEdge0!.getCurve().getLength() : 0;
            if (tmpLength > uLength) {
                vIndex = i;
                uLength = tmpLength;
            }
        }
        const vLength = firstVFaces[vIndex].v0.getPoint().distanceTo(firstVFaces[vIndex].v1.getPoint());
        if (firstVFaces[0].v0 === firstVFaces[firstVFaces.length - 1].v1) {
            // 调整起点
            while (vIndex) {
                const tmp = firstVFaces.shift();
                firstVFaces.push(tmp!);
                vIndex--;
            }
        }
        faceUVInfoArrays.push(firstVFaces);

        const uvCalculator = (
            curFace: Face | undefined,
            curSoftEdge: Edge,
            curVRefDir: Vec3,
            curVSameDir: boolean,
            curN: Vec3,
            right: boolean,
        ) => {
            do {
                const vFaces: IFaceUVInfo[] = [];

                // 找到下一条soft edge
                let tmpO = curSoftEdge.getStartVertex().getPoint();
                const refRight = right ? curVRefDir.cross(curN) : curN.cross(curVRefDir!);
                const rightSoftEdges = curFace!
                    .getEdges()
                    .filter(e => e.getSmooth() && e !== curSoftEdge)
                    .filter(e => this._onRefSide(e.getStartVertex().getPoint(), tmpO, refRight));
                if (rightSoftEdges.length) {
                    curSoftEdge = rightSoftEdges[0];
                    tmpO = curSoftEdge.getStartVertex().getPoint();
                    const dir = (curSoftEdge.getCurve() as Ln3).getDirection();
                    curVSameDir = true;
                    if (dir.dot(curVRefDir) < 0) {
                        curVRefDir = dir.reversed();
                        curVSameDir = false;
                    } else {
                        curVRefDir = dir;
                    }
                }

                const rightFaces = curSoftEdge
                    .getFaces()
                    .filter(f => f)
                    .filter(f => f !== curFace)
                    .filter(f => {
                        const vs = f.getVertexes();
                        return vs.some(it => {
                            return this._onRefSide(it.getPoint(), tmpO, refRight);
                        });
                    });
                curFace =
                    rightFaces.length && faceUVInfoArrays.findIndex(it => it[vIndex].face === rightFaces[0]) < 0
                        ? rightFaces[0]
                        : undefined;
                if (curFace) {
                    curN = (curFace.getSurface() as Plane).getNorm();
                    const e0 = getNeighborEdges(curSoftEdge, curVSameDir, curFace);
                    const e1 = getNeighborEdges(curSoftEdge, !curVSameDir, curFace);

                    const data = {
                        face: curFace,
                        refV: curVRefDir,
                        refN: curN,
                        v0: curVSameDir ? curSoftEdge.getStartVertex() : curSoftEdge.getEndVertex(),
                        v1: curVSameDir ? curSoftEdge.getEndVertex() : curSoftEdge.getStartVertex(),
                        uEdge0: e0,
                        uEdge1: e1,
                        refVEdge: curSoftEdge,
                        right,
                    };
                    vFaces.push(data);

                    // 向上找
                    vCalculator(
                        vFaces[0].face,
                        vFaces[0].uEdge1!,
                        curSoftEdge,
                        curVSameDir,
                        vFaces[0].right,
                        true,
                        vFaces,
                    );

                    // 向下找
                    vCalculator(
                        vFaces[0].face,
                        vFaces[0].uEdge0!,
                        curSoftEdge,
                        curVSameDir,
                        vFaces[0].right,
                        false,
                        vFaces,
                    );

                    if (right) {
                        faceUVInfoArrays.push(vFaces);
                    } else {
                        faceUVInfoArrays.unshift(vFaces);
                    }
                }
            } while (curFace);
        };

        // 往右边计算
        const sameDir = firstVFaces[vIndex].refVEdge.getStartVertex() === firstVFaces[vIndex].v0;
        uvCalculator(
            firstVFaces[vIndex].face,
            firstVFaces[vIndex].refVEdge,
            firstVFaces[vIndex].refV,
            sameDir,
            firstVFaces[vIndex].refN,
            true,
        );

        // 往左边计算
        uvCalculator(
            firstVFaces[vIndex].face,
            firstVFaces[vIndex].refVEdge,
            firstVFaces[vIndex].refV,
            sameDir,
            firstVFaces[vIndex].refN,
            false,
        );

        let uParam = 0;
        for (const faceUVInfos of faceUVInfoArrays) {
            let vParam = 0;
            if (faceUVInfos.length === 1) {
                const uL1 = faceUVInfos[0].uEdge1 ? faceUVInfos[0].uEdge1!.getCurve().getLength() : 0;
                uLength = Math.max(uLength, uL1);
            }
            for (const faceUVInfo of faceUVInfos) {
                let vertex0 = faceUVInfo.v0;
                let vertex1 = faceUVInfo.uEdge0 ? faceUVInfo.uEdge0.getAnotherVertex(vertex0) : vertex0;
                let vertex3 = faceUVInfo.v1;
                let vertex2 = faceUVInfo.uEdge1 ? faceUVInfo.uEdge1.getAnotherVertex(vertex3) : vertex3;
                if (!faceUVInfo.right) {
                    vertex1 = faceUVInfo.v0;
                    vertex0 = faceUVInfo.uEdge0 ? faceUVInfo.uEdge0.getAnotherVertex(vertex1) : vertex1;
                    vertex2 = faceUVInfo.v1;
                    vertex3 = faceUVInfo.uEdge1 ? faceUVInfo.uEdge1.getAnotherVertex(vertex2) : vertex2;
                }
                const u0 = uParam;
                const u1 = uParam + uLength;
                const v0 = vParam;
                const v1 = vParam + vLength;

                const pts = [vertex0.getPoint(), vertex1.getPoint(), vertex2.getPoint(), vertex3.getPoint()];
                const uvs = [
                    [u0, v0],
                    [u1, v0],
                    [u1, v1],
                    [u0, v1],
                ] as types.numberArr2[];

                faceUVMapping.set(faceUVInfo.face, { pts, uvs });
                vParam = v1;
            }
            uParam += uLength;
        }
    }

    private static _calTorusUVRange(faces: Face[], faceUVMapping: Map<Face, IFaceUVMapping>) {
        let refFace: Face | undefined;
        for (const face of faces) {
            const edges = face.getEdges();
            if (edges.length === 4 && edges.every(it => it.getSmooth())) {
                refFace = face;
                break;
            }
        }
        if (!refFace) {
            return;
        }

        const coedges = refFace.getWires()[0].getCoedge3ds();
        const tmpE0 = coedges[0].getEdge()!;
        const tmpE1 = coedges[1].getEdge()!;
        const tmpE2 = coedges[2].getEdge()!;
        const tmpE3 = coedges[3].getEdge()!;
        const tmpL0 = tmpE0.getCurve().getLength() - tmpE2.getCurve().getLength();
        const tmpL1 = tmpE1.getCurve().getLength() - tmpE3.getCurve().getLength();
        let refSoftEdge: Edge;
        if (Math.abs(tmpL1) < Math.abs(tmpL0)) {
            refSoftEdge = tmpE1;
        } else {
            refSoftEdge = tmpE0;
        }

        // uv向需要压缩
        this._calCompressUVRange(refFace, refSoftEdge, faceUVMapping);
    }

    private static _calConeUVRange(faces: Face[], faceUVMapping: Map<Face, IFaceUVMapping>) {
        const refFace = faces[0];
        const refSoftEdge = refFace.getEdges().filter(e => e.getSmooth())[0];

        // uv向需要压缩
        this._calCompressUVRange(refFace, refSoftEdge, faceUVMapping);
    }

    private static _calCylinderUVRange(faces: Face[], faceUVMapping: Map<Face, IFaceUVMapping>) {
        const refFace = faces[0];
        const refSoftEdge = refFace.getEdges().filter(e => e.getSmooth())[0];
        let refLine = refSoftEdge.getCurve() as Ln3;
        let vRefDir = refLine.getDirection();

        const tmpPlane = refFace.getSurface() as Plane;
        const xDot = vRefDir.dot(tmpPlane.getCoord().getDx());
        const yDot = vRefDir.dot(tmpPlane.getCoord().getDy());
        if (Math.abs(xDot) > Math.abs(yDot)) {
            if (xDot < 0) {
                vRefDir = vRefDir.reversed();
                refLine = refLine.reversed() as Ln3;
            }
        } else {
            if (yDot < 0) {
                vRefDir = vRefDir.reversed();
                refLine = refLine.reversed() as Ln3;
            }
        }

        const vertexVMap = new Map<Vertex, number>();
        let minU: number | undefined;
        let minV: number | undefined;
        const vCalculator = (v: Vertex) => {
            let vValue = vertexVMap.get(v);
            if (!vValue) {
                vValue = vRefDir!.dot(v.getPoint());
                vertexVMap.set(v, vValue);
            }
            if (minV === undefined || vValue < minV) {
                minV = vValue;
            }
            return vValue;
        };

        const uCalculator = (v: Vertex, refL: Ln3, refN: Vec3, refU: number) => {
            const closePt = refL.getClosestPoint(v.getPoint());
            const disV = v.getPoint().subtracted(closePt);
            let dis = disV.getLength();
            if (!Util.isNearly0(dis)) {
                if (refL.getDirection().cross(refN).dot(disV) < 0) {
                    dis = -dis;
                }
            }
            const uValue = refU + dis;
            if (minU === undefined || uValue < minU) {
                minU = uValue;
            }
            return uValue;
        };

        const uvCalculator = (
            rightFace: Face | undefined,
            rightSoftEdge: Edge,
            rightLine: Ln3,
            rightU: number,
            rightN: Vec3,
            right: boolean,
        ) => {
            do {
                const tmpO = rightLine.getOrigin();
                const refRight = right ? vRefDir!.cross(rightN) : rightN.cross(vRefDir!);
                const rightSoftEdges = rightFace!
                    .getEdges()
                    .filter(e => e.getSmooth() && e !== rightSoftEdge)
                    .filter(e => this._onRefSide(e.getStartVertex().getPoint(), tmpO, refRight));
                if (rightSoftEdges.length) {
                    rightSoftEdge = rightSoftEdges[0];
                    const dist = alg.D.ptToCurve3d(rightSoftEdge.getStartVertex().getPoint(), rightLine);
                    if (right) {
                        rightU += dist;
                    } else {
                        rightU -= dist;
                    }
                    rightLine = rightSoftEdge.getCurve() as Ln3;
                    if (!rightLine.getDirection().isSameDirection(vRefDir!)) {
                        rightLine = rightLine.reversed() as Ln3;
                    }
                }

                const rightFaces = rightSoftEdge
                    .getFaces()
                    .filter(f => f)
                    .filter(f => f !== rightFace)
                    .filter(f => {
                        const vs = f.getVertexes();
                        return vs.some(it => {
                            return this._onRefSide(it.getPoint(), tmpO, refRight);
                        });
                    });
                const lastRightFace = rightFace;
                rightFace = rightFaces.length && !faceUVMapping.get(rightFaces[0]) ? rightFaces[0] : undefined;

                if (rightFace) {
                    rightN = (rightFace.getSurface() as Plane).getNorm();
                    const vs = this._getTriangleVertexFromFace(rightFace);
                    if (vs) {
                        const uvs = vs!.map(vertex => {
                            const u = uCalculator(vertex, rightLine, rightN, rightU);
                            const v = vCalculator(vertex);
                            return [u, v] as types.numberArr2;
                        });
                        faceUVMapping.set(rightFace, { pts: vs!.map(it => it.getPoint()), uvs });
                    }
                } else if (!right) {
                    lastRightFace!.getVertexes().map(vertex => uCalculator(vertex, rightLine, rightN, rightU));
                }
            } while (rightFace);
        };

        // 计算第一个面
        const refUParam = 0;
        const refNormal = (refFace.getSurface() as Plane).getNorm();
        const tmpVs = this._getTriangleVertexFromFace(refFace);
        const tmpUVs = tmpVs!.map(vertex => {
            const u = uCalculator(vertex, refLine, refNormal, refUParam);
            const v = vCalculator(vertex);
            return [u, v] as types.numberArr2;
        });
        faceUVMapping.set(refFace, { pts: tmpVs!.map(it => it.getPoint()), uvs: tmpUVs });

        // 往右计算
        uvCalculator(refFace, refSoftEdge, refLine, refUParam, refNormal, true);

        // 往左计算
        uvCalculator(refFace, refSoftEdge, refLine, refUParam, refNormal, false);

        // 重新调整u
        if (minU !== undefined && minV !== undefined) {
            for (const value of faceUVMapping.values()) {
                for (const uv of value.uvs) {
                    uv[0] -= minU;
                    uv[1] -= minV;
                }
            }
        }
    }

    private static _recalculateMeshUV(
        face: Face,
        meshData: types.IMesh,
        faceUVRange: IFaceUVMapping,
        linear: boolean,
    ): boolean {
        if (linear) {
            // 简单线性插值
            const pts = faceUVRange.pts;
            const uvs = faceUVRange.uvs;
            if (pts.length < 3 || uvs.length < 3) {
                return false;
            }

            const v1 = pts[1].subtracted(pts[0]);
            const v2 = pts[2].subtracted(pts[0]);
            const uv0 = new Vec2(uvs[0][0], uvs[0][1]);
            const uv1 = new Vec2(uvs[1][0] - uvs[0][0], uvs[1][1] - uvs[0][1]);
            const uv2 = new Vec2(uvs[2][0] - uvs[0][0], uvs[2][1] - uvs[0][1]);

            const tmp1 = v1.x * v2.y - v2.x * v1.y;
            const tmp2 = v1.x * v2.z - v2.x * v1.z;
            const tmp3 = v1.y * v2.z - v2.y * v1.z;
            let cal: number | undefined;
            if (!Util.isNearly0(tmp1)) {
                cal = 1;
            } else if (!Util.isNearly0(tmp2)) {
                cal = 2;
            } else if (!Util.isNearly0(tmp3)) {
                cal = 3;
            } else {
                return false;
            }

            const linearFuc = (pt: Vec3) => {
                const v3 = pt.subtracted(pts[0]);
                let a = 1;
                let b = 1;
                if (cal === 1) {
                    a = (v3.x * v2.y - v2.x * v3.y) / tmp1;
                    b = (v1.x * v3.y - v3.x * v1.y) / tmp1;
                } else if (cal === 2) {
                    a = (v3.x * v2.z - v2.x * v3.z) / tmp2;
                    b = (v1.x * v3.z - v3.x * v1.z) / tmp2;
                } else if (cal === 3) {
                    a = (v3.y * v2.z - v2.y * v3.z) / tmp3;
                    b = (v1.y * v3.z - v3.y * v1.z) / tmp3;
                }
                return uv0.added(uv1.multiplied(a).add(uv2.multiplied(b)));
            };

            for (let index = 0; index < meshData.uvs.length; index++) {
                const tmpV = new Vec3(meshData.vertices[index]);
                meshData.uvs[index] = linearFuc(tmpV).toArray2();
            }
        } else {
            // 逆双线性插值, 处理uv压缩的情况
            return this._recalculateMeshUVByInvBilinear(face, meshData, faceUVRange);
        }
        return true;
    }

    private static _recalculateMeshUVByInvBilinear(
        face: Face,
        meshData: types.IMesh,
        faceUVRange: IFaceUVMapping,
    ): boolean {
        const surface = face.getSurface()!;
        const uvRangePoints = faceUVRange.pts;
        const uvs = faceUVRange.uvs;
        if (uvRangePoints.length !== 4 || uvs.length !== 4) {
            return false;
        }

        const uvp0 = surface.getUVAt(uvRangePoints[0]);
        const uvp1 = surface.getUVAt(uvRangePoints[1]);
        const uvp2 = surface.getUVAt(uvRangePoints[3]);
        const uvp3 = surface.getUVAt(uvRangePoints[2]);

        const p0 = new Vec2(uvp0.x, uvp0.y);
        const p1 = new Vec2(uvp1.x, uvp1.y);
        const p2 = new Vec2(uvp2.x, uvp2.y);
        const p3 = new Vec2(uvp3.x, uvp3.y);

        const distTol = 1e-4;
        const interpolator = new InvBilinear(uvs[0][0], uvs[1][0], uvs[0][1], uvs[2][1], p0, p1, p2, p3);
        for (let index = 0; index < meshData.uvs.length; index++) {
            const uv = meshData.uvs[index];
            const pt = new Vec2(uv[0], uv[1]);
            let newUV: types.numberArr2 | undefined;
            if (pt.equals(p0, distTol)) {
                newUV = uvs[0];
            } else if (pt.equals(p1, distTol)) {
                newUV = uvs[1];
            } else if (pt.equals(p2, distTol)) {
                newUV = uvs[3];
            } else if (pt.equals(p3, distTol)) {
                newUV = uvs[2];
            } else {
                newUV = interpolator.solve(pt);
            }

            if (newUV) {
                meshData.uvs[index] = newUV;
            }
        }
        return true;
    }

    private static _mergeMesh(datas: types.IMesh[]): types.IMesh | undefined {
        if (!datas.length) {
            return undefined;
        }

        const firstData = datas[0];
        for (let index = 1; index < datas.length; index++) {
            const curData = datas[index];
            const lastIndex = firstData.vertices.length;

            curData.vertices.forEach(v => firstData.vertices.push(v));
            curData.normals.forEach(v => firstData.normals.push(v));
            curData.uvs.forEach(v => firstData.uvs.push(v));

            curData.faces.forEach(f => {
                firstData.faces.push([f[0] + lastIndex, f[1] + lastIndex, f[2] + lastIndex]);
            });
        }
        return firstData;
    }

    private static _getTriangleVertexFromFace(face: Face): Vertex[] | undefined {
        const vs = face.getVertexes();
        if (vs.length < 3) {
            return undefined;
        }
        const results: Vertex[] = [];
        results.push(vs[0]);
        const v1 = vs[1].getPoint().subtracted(vs[0].getPoint());
        if (!Util.isNearly0(v1.getLength())) {
            results.push(vs[1]);
        }
        for (let index = 2; index < vs.length; index++) {
            const v2 = vs[index].getPoint().subtracted(vs[0].getPoint());
            if (!v1.isParallel(v2)) {
                results.push(vs[index]);
                break;
            }
        }
        return results;
    }

    private static _onRefSide(pt: Vec3, refPt: Vec3, refR: Vec3) {
        return Util.isNearlyBigger(refR.dot(pt.subtracted(refPt)), 0);
    }
}