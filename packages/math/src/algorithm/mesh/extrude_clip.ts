// 专门处理拉伸体切割mesh的情况
import {
    alg,
    Loop,
    Curve2,
    Ln2,
    Ln3,
    Plane,
    Polygon,
    Matrix4,
    PolyCurve,
    Box2,
    Box3,
    Vec2,
    Vec3,
    Log,
} from '../..';
import { types } from '../../type_define/i_types';
import { Coord3 } from '../../base/coord3';
import earcut from 'earcut';
// import * as ClipperLib from '../../clipperlib/clipperlib';
import { SearchGraph } from '../search_graph';
enum PositionType {
    inner = -1,
    on = 0,
    outer = 1,
}
export interface ITypedTriangleVertex {
    type: PositionType;
    pos: types.IXYZ;
}
interface IVertex {
    v: types.IXYZ;
    n: types.IXYZ;
    uv: types.IXY;
    uv1?: types.IXY;
}
/**
 * 1. 草图不能包含曲线，如果存在曲线，需事先做离散处理
 * 2. 草图不能为凹，如果遇到草图为凹的情况，需事先将草图拆分为多个凸多边形处理
 */
export class Extruder {
    // 草图平面
    private _coord!: Coord3;
    // 草图轮廓
    private _loop!: Loop;
    // 拉伸高度
    private _height!: number;
    // 缓存：局部坐标系下的三维草图轮廓
    private _localLine3dsCache!: Ln3[];
    // 缓存：局部坐标系下的二维草图轮廓
    private _line2dsCache!: Ln2[];
    // 缓存：草图平面
    private _planeCache!: Plane;
    // 缓存：boundingbox2
    public boundingBox2!: Box2;
    // 缓存：所有的单边boundingBox2
    public curveBoundingBoxList!: Box2[];
    // 缓存：boundingbox3
    private _boundingBox3: Box3 | undefined;
    // 缓存：草图轮廓顶点缓存
    private _lpts!: types.IXY[];
    constructor(_c: Coord3, _l: Loop, _h: number) {
        if (_l.getAllCurves().some(_ => !(_ instanceof Ln2))) {
            console.assert(false, 'mesh clip: given loop should be constructed by line2d!');
            return;
        }
        this._coord = _c;
        this._loop = _l;
        this._height = _h;
        this._planeCache = new Plane(_c);
        this._localLine3dsCache = [];
        this._line2dsCache = [];
        this.boundingBox2 = new Box2(this._loop.getAllPoints());
        this.curveBoundingBoxList = this._loop.getAllCurves().map(c => new Box2([c.getStartPt(), c.getEndPt()]));
        this._lpts = this._loop.getAllPoints();
    }
    /**
     * 草图轮廓
     */
    public get loop() {
        return this._loop;
    }
    /**
     * 平面原点
     */
    public get origin() {
        return this._coord.getOrigin();
    }
    /**
     * 平面法向
     */
    public get normal() {
        return this._coord.getDz();
    }
    /**
     * 三维包围盒
     * */
    public get localBoundingBox3() {
        if (!this._boundingBox3) {
            this._boundingBox3 = new Box3(this.localCorners);
        }
        return this._boundingBox3;
    }
    public get worldBoundingBox3() {
        if (!this._boundingBox3) {
            this._boundingBox3 = new Box3(this.worldCorners);
        }
        return this._boundingBox3;
    }
    // 局部坐标系内的二维草图轮廓线直接转三维
    public get localLine3ds(): Ln3[] {
        if (this._localLine3dsCache.length > 0) {
            return this._localLine3dsCache;
        }
        this._localLine3dsCache = this._loop.getAllCurves().map((line2d: Curve2) => {
            const from = line2d.getStartPt();
            const to = line2d.getEndPt();
            return new Ln3({ x: from.x, y: from.y, z: 0 }, { x: to.x, y: to.y, z: 0 });
        });
        return this._localLine3dsCache;
    }
    // 局部坐标系内的二维草图轮廓线
    public get line2ds(): Ln2[] {
        if (this._line2dsCache.length > 0) {
            return this._line2dsCache;
        }
        this._line2dsCache = this._loop.getAllCurves() as Ln2[];
        return this._line2dsCache;
    }
    // 拉伸高度
    public get height() {
        return this._height;
    }
    // 世界坐标系到局部坐标系的变换矩阵
    public get world2localMatrix() {
        return this._coord.getWorldToLocalMatrix();
    }
    // 局部坐标系到世界坐标系的变换矩阵
    public get local2worldMatrix() {
        return this._coord.getLocalToWorldMatrix();
    }
    /**
     * 所有角点在世界坐标系中的位置
     */
    public get worldCorners() {
        const pts = this._loop.getAllPoints();
        const corners: types.IXYZ[] = [];
        pts.forEach(pt => {
            const p1 = this._coord.getWorldPtAt({ x: pt.x, y: pt.y, z: 0 });
            const p2 = this._coord.getWorldPtAt({ x: pt.x, y: pt.y, z: this._height });
            corners.push(p1);
            corners.push(p2);
        });
        return corners;
    }
    /**
     * 所有角点在草图平面局部坐标系中的位置
     */
    public get localCorners() {
        const pts = this._loop.getAllPoints();
        const corners: types.IXYZ[] = [];
        pts.forEach(pt => {
            corners.push({ x: pt.x, y: pt.y, z: -20 });
            corners.push({ x: pt.x, y: pt.y, z: this._height - 20 });
        });
        return corners;
    }
    /**
     * 将mesh变换到局部坐标系下
     */
    public transformWorldMesh2Local(mesh: types.IFlatMeshPlus): types.IFlatMeshPlus {
        return this.transformMesh(mesh, this.world2localMatrix);
    }
    /**
     * 将本地坐标系下的mesh转换到世界坐标系
     */
    public transformLocalMesh2World(mesh: types.IFlatMesh): types.IFlatMesh {
        return this.transformMesh(mesh, this.local2worldMatrix);
    }
    private transformMesh(mesh: types.IFlatMeshPlus, mt: Matrix4): types.IFlatMeshPlus {
        const vn = mesh.vertices.length / 3;
        const newVertices: number[] = [];
        const newNormals: number[] = [];
        for (let vi = 0; vi < vn; ++vi) {
            const v = { x: mesh.vertices[3 * vi], y: mesh.vertices[3 * vi + 1], z: mesh.vertices[3 * vi + 2] };
            const n = { x: mesh.normals[3 * vi], y: mesh.normals[3 * vi + 1], z: mesh.normals[3 * vi + 2] };
            const vx = mt.data[0][0] * v.x + mt.data[1][0] * v.y + mt.data[2][0] * v.z + mt.data[3][0];
            const vy = mt.data[0][1] * v.x + mt.data[1][1] * v.y + mt.data[2][1] * v.z + mt.data[3][1];
            const vz = mt.data[0][2] * v.x + mt.data[1][2] * v.y + mt.data[2][2] * v.z + mt.data[3][2];
            newVertices.push(vx);
            newVertices.push(vy);
            newVertices.push(vz);
            const nx = mt.data[0][0] * n.x + mt.data[1][0] * n.y + mt.data[2][0] * n.z;
            const ny = mt.data[0][1] * n.x + mt.data[1][1] * n.y + mt.data[2][1] * n.z;
            const nz = mt.data[0][2] * n.x + mt.data[1][2] * n.y + mt.data[2][2] * n.z;
            newNormals.push(nx);
            newNormals.push(ny);
            newNormals.push(nz);
        }
        const result: types.IFlatMeshPlus = {
            vertices: newVertices,
            faces: mesh.faces.slice(),
            uvs: mesh.uvs.slice(),
            normals: newNormals,
        };
        if (mesh.uvs1) {
            result.uvs1 = mesh.uvs1.slice()
        }
        return result;
    }
    // 获取局部坐标系下的草图平面上的投影
    public getUVAt(pt: types.IXYZ): types.IXY {
        return this._planeCache.getUVAt(pt);
    }
    // 初步判断拉升体和mesh是否存在相交
    public intersect(mesh: types.IFlatMesh, localcoordinate?: boolean): boolean {
        const boundingBox3 = new Box3();
        const n = mesh.vertices.length / 3;
        for (let i = 0; i < n; ++i) {
            const pt = {
                x: mesh.vertices[3 * i],
                y: mesh.vertices[3 * i + 1],
                z: mesh.vertices[3 * i + 2],
            };
            if (localcoordinate ? this.localBoundingBox3.containsPt(pt) : this.worldBoundingBox3.containsPt(pt)) {
                return true;
            }
            boundingBox3.expandByPoint(pt);
        }
        const corners = this.localCorners;
        for (let i = 0; i < corners.length; ++i) {
            if (boundingBox3.containsPt(corners[i])) {
                return true;
            }
        }
        if (this.localBoundingBox3.intersectsBox(boundingBox3)) {
            return true;
        }
        return false;
    }
    // 判断三角面片与拉伸体边缘的boundingbox是否存在相交关系
    public edgeBoxInterTri(vertex1: IVertex, vertex2: IVertex, vertex3: IVertex) {
        const tmp = new Box2([vertex1.v, vertex2.v, vertex3.v]);
        return this.curveBoundingBoxList.some(box => box.intersectsBox(tmp));
    }

    /**
     * 基于pnpoly算法判断点是否在多边形内部
     * @param point
     * @returns
     */
    public inside(point: types.IXY) {
        // ray-casting algorithm based on
        // https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html
        const x = point.x, y = point.y;

        let inside = false;
        for (let i = 0, j = this._lpts.length - 1; i < this._lpts.length; j = i++) {
            const xi = this._lpts[i].x, yi = this._lpts[i].y;
            const xj = this._lpts[j].x, yj = this._lpts[j].y;

            const intersect = ((yi > y) != (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    };

    // 打印出日志来
    public log() {
        Log.d(this._coord);
        Log.d(this._loop);
    }
}

export class ExtrudeClip {
    public static tol: number = 1e-6;
    /**
     * 入口：针对硬装背景墙定制接口，所有的face以mesh数组的形式传入、传出，但是补面则以独立mesh传出
     * @param extruder 拉伸体
     * @param meshes 待裁切的mesh集合
     * @param option transformed - 是否已经变换到extruder的局部坐标系之下   fill: 是否需要补面
     * @return clipped - 和传入的mesh一一对应   patch - 补面结果
     */
    public static multiClip(
        extruder: Extruder,
        meshes: types.IFlatMesh[],
        option?: { transformed?: boolean; fill?: boolean },
    ): { clipped: types.IFlatMesh[]; patch?: types.IFlatMesh } {
        if (meshes.length === 0) return { clipped: [] };
        const result: { clipped: types.IFlatMesh[]; patch?: types.IFlatMesh } = { clipped: [], patch: undefined };
        const sideFaceEdgeMap: Map<Ln2, Ln3[]> = new Map(); // 记录侧面和侧面上的切割线之间的映射关系，后续补面可以用到
        // 逐个切割
        meshes.forEach(mesh => {
            const ret = ExtrudeClip.clip(
                extruder,
                mesh,
                option
                    ? { transformed: option.transformed, fill: option.fill, faceEdgeMap: sideFaceEdgeMap }
                    : undefined,
            );
            if (ret.vertices.length !== mesh.vertices.length) {
                this.mergeVertex(ret);
            }
            result.clipped.push(ret);
        });
        // 补面
        if (option?.fill) {
            result.patch = {
                vertices: [],
                faces: [],
                normals: [],
                uvs: [],
            };
            let uvScale = 0.1;
            const mesh = meshes[0];
            if (mesh) {
                const vt1 = {
                    x: mesh.vertices[3 * mesh.faces[0]],
                    y: mesh.vertices[3 * mesh.faces[0] + 1],
                    z: mesh.vertices[3 * mesh.faces[0] + 2],
                };
                const vt2 = {
                    x: mesh.vertices[3 * mesh.faces[1]],
                    y: mesh.vertices[3 * mesh.faces[1] + 1],
                    z: mesh.vertices[3 * mesh.faces[1] + 2],
                };
                const uv1 = { x: mesh.uvs[2 * mesh.faces[0]], y: mesh.uvs[2 * mesh.faces[0] + 1] };
                const uv2 = { x: mesh.uvs[2 * mesh.faces[1]], y: mesh.uvs[2 * mesh.faces[1] + 1] };
                const uvLen = Math.sqrt((uv1.x - uv2.x) * (uv1.x - uv2.x) + (uv1.y - uv2.y) * (uv1.y - uv2.y));
                const geoLen = Math.sqrt(
                    (vt1.x - vt2.x) * (vt1.x - vt2.x) +
                    (vt1.y - vt2.y) * (vt1.y - vt2.y) +
                    (vt1.z - vt2.z) * (vt1.z - vt2.z),
                );
                uvScale = uvLen / geoLen;
            }
            result.patch = ExtrudeClip.fillClip(extruder, result.patch, sideFaceEdgeMap, uvScale);
        }
        return result;
    }
    /**
     * 入口：拉伸体切割mesh。尽量在外部将mesh转换到extruder的局部坐标系内
     * @param extruder 拉伸体
     * @param mesh 被切割mesh对象
     * @param keepOuter true - 保留拉伸体外部的mesh  false - 保留拉伸体内部的mesh
     * @param option.transformed true - 输入mesh已经转换至extruder局部坐标系   false - 输入的mesh为世界坐标系，需在内部转换到局部坐标系
     * @param option.fill true - 补面  false - 不补面
     * @param option.faceEdgeMap  仅在multiClip时需要传入
     */
    public static clip(
        extruder: Extruder,
        mesh: types.IFlatMeshPlus,
        option?: { transformed?: boolean; fill?: boolean; faceEdgeMap?: Map<Ln2, Ln3[]> },
    ): types.IFlatMeshPlus {
        console.time('extrude clip');
        const sideFaceEdgeMap: Map<Ln2, Ln3[]> = option?.faceEdgeMap ? option.faceEdgeMap : new Map(); // 记录侧面和侧面上的切割线之间的映射关系，后续补面可以用到
        if (!extruder.intersect(mesh, option?.transformed)) {
            console.timeEnd('extrude clip');
            return mesh;
        }
        //1. 将mesh变换到extruder的局部坐标系之下
        const localMesh = option?.transformed ? mesh : extruder.transformWorldMesh2Local(mesh);
        // extruder.log();
        let resultMesh: types.IFlatMeshPlus = {
            vertices: [],
            faces: [],
            normals: [],
            uvs: [],
        };
        if (mesh.uvs1) {
            resultMesh.uvs1 = [];
        }
        //2. 相交&搜环
        const fn = localMesh.faces.length / 3;
        for (let fi = 0; fi < fn; ++fi) {
            const vi_1 = localMesh.faces[3 * fi];
            const vi_2 = localMesh.faces[3 * fi + 1];
            const vi_3 = localMesh.faces[3 * fi + 2];
            const v1 = {
                x: localMesh.vertices[3 * vi_1],
                y: localMesh.vertices[3 * vi_1 + 1],
                z: localMesh.vertices[3 * vi_1 + 2],
            };
            const v2 = {
                x: localMesh.vertices[3 * vi_2],
                y: localMesh.vertices[3 * vi_2 + 1],
                z: localMesh.vertices[3 * vi_2 + 2],
            };
            const v3 = {
                x: localMesh.vertices[3 * vi_3],
                y: localMesh.vertices[3 * vi_3 + 1],
                z: localMesh.vertices[3 * vi_3 + 2],
            };
            const n1 = {
                x: localMesh.normals[3 * vi_1],
                y: localMesh.normals[3 * vi_1 + 1],
                z: localMesh.normals[3 * vi_1 + 2],
            };
            const n2 = {
                x: localMesh.normals[3 * vi_2],
                y: localMesh.normals[3 * vi_2 + 1],
                z: localMesh.normals[3 * vi_2 + 2],
            };
            const n3 = {
                x: localMesh.normals[3 * vi_3],
                y: localMesh.normals[3 * vi_3 + 1],
                z: localMesh.normals[3 * vi_3 + 2],
            };
            const uv1 = { x: localMesh.uvs[2 * vi_1], y: localMesh.uvs[2 * vi_1 + 1] };
            const uv2 = { x: localMesh.uvs[2 * vi_2], y: localMesh.uvs[2 * vi_2 + 1] };
            const uv3 = { x: localMesh.uvs[2 * vi_3], y: localMesh.uvs[2 * vi_3 + 1] };
            let uv11, uv12, uv13;
            if (localMesh.uvs1) {
                uv11 = { x: localMesh.uvs1[2 * vi_1], y: localMesh.uvs1[2 * vi_1 + 1] };
                uv12 = { x: localMesh.uvs1[2 * vi_2], y: localMesh.uvs1[2 * vi_2 + 1] };
                uv13 = { x: localMesh.uvs1[2 * vi_3], y: localMesh.uvs1[2 * vi_3 + 1] };
            }
            // 切割: 一个三角面片切割为三个三角面片
            const cuttedTriangles = ExtrudeClip.cutTriangle(
                extruder,
                { v: v1, n: n1, uv: uv1, uv1: uv11 },
                { v: v2, n: n2, uv: uv2, uv1: uv12 },
                { v: v3, n: n3, uv: uv3, uv1: uv13 },
            );
            for (const tri of cuttedTriangles) {
                ExtrudeClip.insertTriangle(tri, resultMesh, extruder, option?.fill ? sideFaceEdgeMap : undefined);
            }
        }
        //3. 补面
        if (option?.fill && !option?.faceEdgeMap) {
            resultMesh = ExtrudeClip.fillClip(extruder, resultMesh, sideFaceEdgeMap);
        }
        //4. 变换回到世界坐标系
        if (!option?.transformed) {
            resultMesh = extruder.transformLocalMesh2World(resultMesh);
        }
        console.timeEnd('extrude clip');
        return resultMesh;
    }
    /**
     * 合并相同顶点
     * @param faceMesh 传入facemesh
     */
    private static mergeVertex(faceMesh: types.IFlatMesh) {
        const vn = faceMesh.vertices.length / 3;
        if (vn <= 3) return;
        const smvtx: number[] = [];
        for (let id = 0; id < vn - 1; ++id) {
            if (smvtx.includes(id)) continue;
            const v = new Vec3(
                faceMesh.vertices[3 * id],
                faceMesh.vertices[3 * id + 1],
                faceMesh.vertices[3 * id + 2],
            );
            for (let id2 = id + 1; id2 < vn; ++id2) {
                if (smvtx.includes(id2)) continue;
                const v2 = new Vec3(
                    faceMesh.vertices[3 * id2],
                    faceMesh.vertices[3 * id2 + 1],
                    faceMesh.vertices[3 * id2 + 2],
                );
                if (v.equals(v2)) {
                    faceMesh.faces = faceMesh.faces.map(_ => (_ === id2 ? id : _));
                    smvtx.push(id2);
                }
            }
        }
    }
    /**
     * 对切割后的mesh进行补面，默认mesh在extruder的局部坐标系下
     * @param extruder 原拉伸体
     * @param mesh 待切割mesh
     */
    private static fillClip(
        extruder: Extruder,
        mesh: types.IFlatMeshPlus,
        sideFaceEdgeMap: Map<Ln2, Ln3[]>,
        uvScale: number = 0.1,
    ): types.IFlatMesh {
        const transformXY = (_uv: types.IXY, _uvScale: number, _translate: types.IXY) => {
            const x = _uv.x * _uvScale + _translate.x;
            const y = _uv.y * _uvScale + _translate.y;
            return {
                x,
                y,
            };
        };
        //1. 逐面搜环，补面
        const ct = new Loop(extruder.line2ds).getCentroidPoint();
        for (const line of extruder.line2ds) {
            const edges = sideFaceEdgeMap.get(line);
            if (!edges) continue;
            // 计算平面
            const from = line.getStartPt();
            const to = line.getEndPt();
            const plane = Plane.makeBy3Pts(
                { x: from.x, y: from.y, z: 0 },
                { x: to.x, y: to.y, z: 0 },
                { x: to.x, y: to.y, z: 10 },
            );
            if (!plane) continue;
            const baseDir = plane.getNorm();
            const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            const pt = { x: middle.x + baseDir.x / 10, y: middle.y + baseDir.y / 10 };
            const dist1 = ct.distanceTo(pt);
            const dist2 = ct.distanceTo(middle);
            if (dist1 > dist2) baseDir.reverse();
            // 一次union，把成环的待补面构造出来
            // const clipper = new ClipperLib.Clipper();
            // const poly: ClipperLib.IntPoint[][] = [];
            const line2ds: Ln2[] = [];
            const fromSplitPts: types.IXYZ[] = [];
            const toSplitPts: types.IXYZ[] = [];
            edges.forEach((edge: Ln3) => {
                const l2d = plane?.getCurve2d(edge) as Ln2;
                // const start = l2d.getStartPt().toXY();
                // const end = l2d.getEndPt().toXY();
                // const p1 = new ClipperLib.IntPoint(Math.floor(start.x * 1000), Math.floor(start.y * 1000));
                // const p2 = new ClipperLib.IntPoint(Math.floor(end.x * 1000), Math.floor(end.y * 1000));
                // poly.push([p1, p2]);
                line2ds.push(l2d);
                line2ds.push(l2d.reversed() as Ln2);
                const start = edge.getStartPt();
                const end = edge.getEndPt();
                if (Math.abs(start.x - end.x) < ExtrudeClip.tol && Math.abs(start.y - end.y) < ExtrudeClip.tol) {
                    return;
                }
                if (from.equals(start)) {
                    fromSplitPts.push(start);
                }
                if (from.equals(end)) {
                    fromSplitPts.push(end);
                }
                if (to.equals(start)) {
                    toSplitPts.push(start);
                }
                if (to.equals(end)) {
                    toSplitPts.push(end);
                }
            });
            if (fromSplitPts.length >= 2) {
                fromSplitPts.sort((p1, p2) => p1.z - p2.z);
                for (let i = 0; i < fromSplitPts.length - 1; ++i) {
                    const l3d = new Ln3(fromSplitPts[i], fromSplitPts[i + 1]);
                    const l2d = plane?.getCurve2d(l3d);
                    if (l2d) {
                        line2ds.push(l2d as Ln2);
                        line2ds.push(l2d.reversed() as Ln2);
                    }
                }
            }
            if (toSplitPts.length >= 2) {
                toSplitPts.sort((p1, p2) => p1.z - p2.z);
                for (let i = 0; i < toSplitPts.length - 1; ++i) {
                    const l3d = new Ln3(toSplitPts[i], toSplitPts[i + 1]);
                    const l2d = plane?.getCurve2d(l3d);
                    if (l2d) {
                        line2ds.push(l2d as Ln2);
                        line2ds.push(l2d.reversed() as Ln2);
                    }
                }
            }
            const loops = SearchGraph.searchLoop2D(line2ds, false, 1e-4);
            // 基于环补面
            loops.forEach((lp: Loop) => {
                const box = new Box2(lp.getAllPoints());
                const translate = { x: -box.min.x, y: -box.min.y };
                if (!lp.isAnticlockwise()) return;
                const pt2ds: number[] = lp.getAllPoints().reduce((total: number[], pt2d: types.IXY) => {
                    total.push(pt2d.x);
                    total.push(pt2d.y);
                    return total;
                }, []);
                const triangles = earcut(pt2ds, undefined, 2);
                const vt = triangles.length / 3;
                for (let vi = 0; vi < vt; ++vi) {
                    const ptid1 = triangles[3 * vi];
                    const ptid2 = triangles[3 * vi + 1];
                    const ptid3 = triangles[3 * vi + 2];
                    const uv1 = { x: pt2ds[2 * ptid1], y: pt2ds[2 * ptid1 + 1] };
                    const uv2 = { x: pt2ds[2 * ptid2], y: pt2ds[2 * ptid2 + 1] };
                    const uv3 = { x: pt2ds[2 * ptid3], y: pt2ds[2 * ptid3 + 1] };
                    const nv1 = plane.getPtAt(uv1);
                    const nv2 = plane.getPtAt(uv2);
                    const nv3 = plane.getPtAt(uv3);
                    const ret = ExtrudeClip.reviseTriangleDir([nv1, nv2, nv3], baseDir);
                    // 构造三角形
                    const v1 = ret[0],
                        v2 = ret[1],
                        v3 = ret[2];
                    const vn1 = baseDir,
                        vn2 = baseDir,
                        vn3 = baseDir;
                    const vuv1 = transformXY(uv1, uvScale, translate);
                    const vuv2 = transformXY(uv2, uvScale, translate);
                    const vuv3 = transformXY(uv3, uvScale, translate);
                    const triVertex1: IVertex = {
                        v: v1,
                        n: vn1,
                        uv: vuv1,
                        uv1: mesh.uvs1 ? vuv1 : undefined,
                    };
                    const triVertex2: IVertex = {
                        v: v2,
                        n: vn2,
                        uv: vuv2,
                        uv1: mesh.uvs1 ? vuv2 : undefined,
                    };
                    const triVertex3: IVertex = {
                        v: v3,
                        n: vn3,
                        uv: vuv3,
                        uv1: mesh.uvs1 ? vuv3 : undefined,
                    };
                    this.insertTriangle(
                        { vertex1: triVertex1, vertex2: triVertex2, vertex3: triVertex3 },
                        mesh,
                        extruder,
                    );
                }
            });
        }
        return mesh;
    }
    /**
     * 将三角面片插入到mesh中
     * @param tri 三角面片
     * @param normal 法向
     * @param uvTransform uv矩阵
     * @param mesh 待插入的mesh
     */
    private static insertTriangle(
        tri: { vertex1: IVertex; vertex2: IVertex; vertex3: IVertex },
        mesh: types.IFlatMeshPlus,
        exturder: Extruder,
        sideFaceEdgeMap?: Map<Ln2, Ln3[]>,
    ) {
        mesh.vertices.push(tri.vertex1.v.x);
        mesh.vertices.push(tri.vertex1.v.y);
        mesh.vertices.push(tri.vertex1.v.z);
        const u1 = tri.vertex1.uv.x;
        const v1 = tri.vertex1.uv.y;
        mesh.uvs.push(u1);
        mesh.uvs.push(v1);
        if (tri.vertex1.uv1) {
            mesh.uvs1?.push(tri.vertex1.uv1.x);
            mesh.uvs1?.push(tri.vertex1.uv1.y);
        }
        mesh.normals.push(tri.vertex1.n.x);
        mesh.normals.push(tri.vertex1.n.y);
        mesh.normals.push(tri.vertex1.n.z);
        mesh.faces.push(mesh.vertices.length / 3 - 1);
        mesh.vertices.push(tri.vertex2.v.x);
        mesh.vertices.push(tri.vertex2.v.y);
        mesh.vertices.push(tri.vertex2.v.z);
        const u2 = tri.vertex2.uv.x;
        const v2 = tri.vertex2.uv.y;
        mesh.uvs.push(u2);
        mesh.uvs.push(v2);
        if (tri.vertex2.uv1) {
            mesh.uvs1?.push(tri.vertex2.uv1.x);
            mesh.uvs1?.push(tri.vertex2.uv1.y);
        }
        mesh.normals.push(tri.vertex2.n.x);
        mesh.normals.push(tri.vertex2.n.y);
        mesh.normals.push(tri.vertex2.n.z);
        mesh.faces.push(mesh.vertices.length / 3 - 1);
        mesh.vertices.push(tri.vertex3.v.x);
        mesh.vertices.push(tri.vertex3.v.y);
        mesh.vertices.push(tri.vertex3.v.z);
        const u3 = tri.vertex3.uv.x;
        const v3 = tri.vertex3.uv.y;
        mesh.uvs.push(u3);
        mesh.uvs.push(v3);
        if (tri.vertex3.uv1) {
            mesh.uvs1?.push(tri.vertex3.uv1.x);
            mesh.uvs1?.push(tri.vertex3.uv1.y);
        }
        mesh.normals.push(tri.vertex3.n.x);
        mesh.normals.push(tri.vertex3.n.y);
        mesh.normals.push(tri.vertex3.n.z);
        mesh.faces.push(mesh.vertices.length / 3 - 1);

        // 收集补面信息
        if (sideFaceEdgeMap) {
            for (const line of exturder.line2ds) {
                const ret1 = this.calcLinePlaneEdge(line, tri.vertex1.v, tri.vertex2.v);
                if (ret1) {
                    if (sideFaceEdgeMap.has(line)) {
                        sideFaceEdgeMap.get(line)!.push(ret1);
                    } else {
                        sideFaceEdgeMap.set(line, [ret1]);
                    }
                }
                const ret2 = this.calcLinePlaneEdge(line, tri.vertex2.v, tri.vertex3.v);
                if (ret2) {
                    if (sideFaceEdgeMap.has(line)) {
                        sideFaceEdgeMap.get(line)!.push(ret2);
                    } else {
                        sideFaceEdgeMap.set(line, [ret2]);
                    }
                }
                const ret3 = this.calcLinePlaneEdge(line, tri.vertex3.v, tri.vertex1.v);
                if (ret3) {
                    const extended = ret3; //.extendDouble(1e-4);
                    if (sideFaceEdgeMap.has(line)) {
                        sideFaceEdgeMap.get(line)!.push(extended);
                    } else {
                        sideFaceEdgeMap.set(line, [extended]);
                    }
                }
            }
        }
    }
    /**
     * 准备补面数据使用：计算边是否在草图轮廓线上
     * @param line 局部坐标系下的二维草图轮廓线
     * @param v1 起点
     * @param v2 终点
     * @returns
     */
    private static calcLinePlaneEdge(line: Ln2, v1: types.IXYZ, v2: types.IXYZ): Ln3 | undefined {
        // 查询共线的线条
        if (Math.abs(v1.x - v2.x) < 1e-6 && Math.abs(v1.y - v2.y) < 1e-6) {
            // 垂直面
            if (line.containsPt(v1) || line.getStartPt().equals(v1) || line.getEndPt().equals(v1)) {
                return new Ln3(v1, v2);
            }
        }
        const l1 = new Ln2(v1, v2);
        const ret = alg.CalcOverlap.curve2ds(line, l1);
        if (ret.length > 0 && ret[0].range2.getLength() > 1e-6) {
            // 记录下对应的edge
            const l11 = new Ln3(v1, v2);
            l11.setRange(ret[0].range2);
            // 记录下范围
            return l11;
        }
        return;
    }
    /**
     * 切割三角面片，得到切割后的三角面片
     * 待优化：一次计算好三角面片的顶点顺序，避免矫正
     */
    private static cutTriangle(extruder: Extruder, vertex1: IVertex, vertex2: IVertex, vertex3: IVertex) {
        const dir1 = { x: vertex2.v.x - vertex1.v.x, y: vertex2.v.y - vertex1.v.y, z: vertex2.v.z - vertex1.v.z };
        const dir2 = { x: vertex3.v.x - vertex1.v.x, y: vertex3.v.y - vertex1.v.y, z: vertex3.v.z - vertex1.v.z };
        const triPlaneNormal = {
            x: dir1.y * dir2.z - dir2.y * dir1.z,
            y: -(dir1.x * dir2.z - dir2.x * dir1.z),
            z: dir1.x * dir2.y - dir2.x * dir1.y,
        };
        const cross = this.crossVector3(dir1, dir2);
        if (Math.abs(this.V3SQLength(cross)) < 1e-16) {
            return [];
        }
        // 加速：基于BoundingBox进行一次判断
        if (!extruder.edgeBoxInterTri(vertex1, vertex2, vertex3)) {
            // 要么完全在内部，要么完全在外部
            if (extruder.inside(vertex1.v)) {
                // 完全包含：这里遵从设定，拉伸体草图轮廓一定为凸
                return [];
            } else {
                //完全在外
                return [{ vertex1, vertex2, vertex3 }];
            }
        }
        if (Math.abs(triPlaneNormal.z) < 1e-6) {
            // 三角面片垂直于拉伸平面, 投影为一条线
            return ExtrudeClip.cutVerticalTriangle(extruder, vertex1, vertex2, vertex3);
        } else {
            // 三角面片不垂直于拉伸平面, 投射到2维上处理
            return ExtrudeClip.cutInVerticalTriangle(extruder, vertex1, vertex2, vertex3);
        }
    }
    /**
     * 垂直于草图平面的三角面片被拉伸体切割算法
     * @param extruder 拉伸体
     * @param v1 顶点1
     * @param v2 顶点2
     * @param v3 顶点3
     * @returns 切割后的三角面片
     */
    private static cutVerticalTriangle(
        extruder: Extruder,
        vertex1: IVertex,
        vertex2: IVertex,
        vertex3: IVertex,
    ): { vertex1: IVertex; vertex2: IVertex; vertex3: IVertex }[] {
        const plane = Plane.makeBy3Pts(vertex1.v, vertex2.v, vertex3.v);
        if (!plane) {
            return [];
        }
        //1. 提取平面上的草图线
        const line3dsOnPlane: Ln3[] = [];
        extruder.localLine3ds.forEach(line3d => {
            if (plane.containsCurve(line3d)) {
                line3dsOnPlane.push(line3d);
            }
        });
        if (line3dsOnPlane.length === 0) {
            // 线如何被区域打断
            const baseLine: Ln2 =
                Math.sqrt(Math.pow(vertex1.v.x - vertex2.v.x, 2) + Math.pow(vertex1.v.y - vertex2.v.y, 2)) < this.tol
                    ? new Ln2({ x: vertex1.v.x, y: vertex1.v.y }, { x: vertex3.v.x, y: vertex3.v.y })
                    : new Ln2({ x: vertex1.v.x, y: vertex1.v.y }, { x: vertex2.v.x, y: vertex2.v.y });
            const params = [
                baseLine.getStartParam(),
                baseLine.getEndParam(),
                baseLine.getParamAt({ x: vertex3.v.x, y: vertex3.v.y }),
            ];
            baseLine.setRange(Math.min(...params), Math.max(...params));
            const polyCurve: PolyCurve = new PolyCurve([baseLine]);
            const ret = alg.BoolOperate2d.polylineDifference(polyCurve, [extruder.loop], true);
            let splittedLines: Ln2[] = [];
            if (ret.length === 0) {
                // 三角面片完全被拉伸体吃掉了
                splittedLines = [];
            } else if (
                ret.length === 1 &&
                ret[0].getAllCurves().length === 1 &&
                Math.abs(ret[0].getAllCurves()[0].getLength() - baseLine.getLength()) <= ExtrudeClip.tol
            ) {
                // 三角面片完全在拉伸体外部
                return [{ vertex1, vertex2, vertex3 }];
            } else {
                // 三角面片部分被切割
                splittedLines = ret.reduce((total: Ln2[], curr) => {
                    total.push(...(curr.getAllCurves() as Ln2[]));
                    return total;
                }, []);
            }
            if (splittedLines.length === 0) {
                // 三角面片被完全吃掉
                return [];
            }
            const baseLineDir = baseLine.getDirection();
            const splitedLinesParam = splittedLines.map(_ => {
                if (_.getDirection().isSameDirection(baseLineDir)) {
                    return {
                        startParam: baseLine.getParamAt(_.getStartPt()),
                        endParam: baseLine.getParamAt(_.getEndPt()),
                    };
                }
                return {
                    startParam: baseLine.getParamAt(_.getEndPt()),
                    endParam: baseLine.getParamAt(_.getStartPt()),
                };
            });
            splitedLinesParam.sort((a, b) => a.startParam - b.startParam);
            const cutLines: Ln3[] = [];
            const startParam = baseLine.getStartParam(),
                endParam = baseLine.getEndParam();
            let start = startParam,
                end = splitedLinesParam.length > 0 ? splitedLinesParam[0].startParam : endParam,
                id = 0;
            while (start < endParam && id <= splitedLinesParam.length) {
                if (id === splitedLinesParam.length) {
                    end = endParam;
                } else {
                    end = splitedLinesParam[id].startParam;
                }
                if (Math.abs(start - end) > ExtrudeClip.tol) {
                    const p_from = baseLine.getPtAt(start);
                    const p_to = baseLine.getPtAt(end);
                    cutLines.push(new Ln3({ x: p_from.x, y: p_from.y, z: -20 }, { x: p_to.x, y: p_to.y, z: -20 }));
                }
                if (id > splitedLinesParam.length) break;
                if (id === splitedLinesParam.length) {
                    start = endParam;
                } else {
                    start = splitedLinesParam[id].endParam;
                }
                ++id;
            }
            return ExtrudeClip.cutVerticalTriangleByLines(extruder, plane, vertex1, vertex2, vertex3, cutLines);
        }
        return ExtrudeClip.cutVerticalTriangleByLines(extruder, plane, vertex1, vertex2, vertex3, line3dsOnPlane);
    }
    /**
     * 三角面片被平面上的线条代表的拉伸矩形区域切割
     * @param extruder 拉伸体
     * @param triPlane 三角面片所在的平面
     * @param vertex1 顶点1
     * @param vertex2 顶点2
     * @param vertex3 顶点3
     * @param cutLines 代表切割区域的线条
     * @returns 切割结果
     */
    private static cutVerticalTriangleByLines(
        extruder: Extruder,
        triPlane: Plane,
        vertex1: IVertex,
        vertex2: IVertex,
        vertex3: IVertex,
        cutLines: Ln3[],
    ): { vertex1: IVertex; vertex2: IVertex; vertex3: IVertex }[] {
        const baseDir = ExtrudeClip.getTriangleNorm(vertex1.v, vertex2.v, vertex3.v);
        //2. 基于平面上的草图线构造矩形
        //2.1 三角形区域
        const triLoop = new Loop([
            triPlane.getUVAt(vertex1.v),
            triPlane.getUVAt(vertex2.v),
            triPlane.getUVAt(vertex3.v),
        ]);
        if (!triLoop.isAnticlockwise()) triLoop.reverse();
        //2.2 拉伸体交线构造拉伸矩形
        const quardLoops: Loop[] = [];
        cutLines.forEach((line3d: Ln3) => {
            const pt1 = line3d.getStartPt().toXYZ();
            const pt2 = line3d.getEndPt().toXYZ();
            const pt3 = { x: pt2.x, y: pt2.y, z: pt2.z + extruder.height };
            const pt4 = { x: pt1.x, y: pt1.y, z: pt1.z + extruder.height };
            const uva = triPlane.getUVAt(pt1);
            const uvb = triPlane.getUVAt(pt2);
            const uvc = triPlane.getUVAt(pt3);
            const uvd = triPlane.getUVAt(pt4);
            const loop = new Loop([uva, uvb, uvc, uvd]);
            if (!loop.isAnticlockwise()) loop.reverse();
            quardLoops.push(loop);
        });
        //3. 求切割后的三角面片区域
        let uvTransform: Matrix4 | undefined;
        const ret: Polygon = alg.BoolOperate2d.difference(triLoop, quardLoops);
        //4. 离散
        //4.1 准备离散数据
        //注意：这里的loops可能是多Outer的结构，也可能是带洞的情况
        const loops = ret.getLoops();
        const pts: number[][] = [];
        const holes: number[][] = [];
        for (let i = 0; i < loops.length; ++i) {
            if (Math.abs(loops[i].calcArea()) < 1e-8 || !loops[i].isClosed()) continue;
            const pt3ds: number[] = loops[i].getAllPoints().reduce((total: number[], pt2d) => {
                total.push(pt2d.x);
                total.push(pt2d.y);
                return total;
            }, []);
            if (pt3ds.length <= 4) continue;
            if (loops[i].isAnticlockwise()) {
                // 外圈
                pts.push(pt3ds);
                holes.push([]);
            } else {
                //洞
                holes[holes.length - 1].push(pts[pts.length - 1].length / 2);
                pts[pts.length - 1].push(...pt3ds);
            }
        }
        //4.2 执行切割
        const totalTris: { vertex1: IVertex; vertex2: IVertex; vertex3: IVertex }[] = [];
        for (let i = 0; i < pts.length; ++i) {
            const triangles = earcut(pts[i], holes[i].length ? holes[i] : undefined, 2);
            const vt = triangles.length / 3;
            for (let vi = 0; vi < vt; ++vi) {
                const ptid1 = triangles[3 * vi];
                const ptid2 = triangles[3 * vi + 1];
                const ptid3 = triangles[3 * vi + 2];
                const nv1 = triPlane.getPtAt({ x: pts[i][2 * ptid1], y: pts[i][2 * ptid1 + 1] });
                const nv2 = triPlane.getPtAt({ x: pts[i][2 * ptid2], y: pts[i][2 * ptid2 + 1] });
                const nv3 = triPlane.getPtAt({ x: pts[i][2 * ptid3], y: pts[i][2 * ptid3 + 1] });
                const ret = ExtrudeClip.reviseTriangleDir([nv1, nv2, nv3], baseDir);
                // 构造三角形
                const v1 = ret[0],
                    v2 = ret[1],
                    v3 = ret[2];
                let vn1 = baseDir,
                    vn2 = baseDir,
                    vn3 = baseDir;
                if (ExtrudeClip.sameVertex(v1, vertex1.v)) {
                    vn1 = vertex1.n;
                } else if (ExtrudeClip.sameVertex(v1, vertex2.v)) {
                    vn1 = vertex2.n;
                } else if (ExtrudeClip.sameVertex(v1, vertex3.v)) {
                    vn1 = vertex3.n;
                }
                if (ExtrudeClip.sameVertex(v2, vertex1.v)) {
                    vn2 = vertex1.n;
                } else if (ExtrudeClip.sameVertex(v2, vertex2.v)) {
                    vn2 = vertex2.n;
                } else if (ExtrudeClip.sameVertex(v2, vertex3.v)) {
                    vn2 = vertex3.n;
                }
                if (ExtrudeClip.sameVertex(v3, vertex1.v)) {
                    vn3 = vertex1.n;
                } else if (ExtrudeClip.sameVertex(v3, vertex2.v)) {
                    vn3 = vertex2.n;
                } else if (ExtrudeClip.sameVertex(v3, vertex3.v)) {
                    vn3 = vertex3.n;
                }

                const [[vuv1, vuv11], [vuv2, vuv12], [vuv3, vuv13]] = [v1, v2, v3].map(v => [false, true].map(isUV1 => {
                    let vuv = ExtrudeClip.getUVBySplit(v, vertex1, vertex2, vertex3, isUV1);
                    if (!vuv) {
                        if (!uvTransform) uvTransform = ExtrudeClip.getTriangleUVTransform(vertex1, vertex2, vertex3, isUV1);
                        vuv = ExtrudeClip.getUVByUVTransform(v, uvTransform);
                    }
                    return vuv;
                }));

                const triVertex1: IVertex = {
                    v: v1,
                    n: vn1,
                    uv: vuv1,
                    uv1: vuv11,
                };
                const triVertex2: IVertex = {
                    v: v2,
                    n: vn2,
                    uv: vuv2,
                    uv1: vuv12,
                };
                const triVertex3: IVertex = {
                    v: v3,
                    n: vn3,
                    uv: vuv3,
                    uv1: vuv13,
                };
                totalTris.push({ vertex1: triVertex1, vertex2: triVertex2, vertex3: triVertex3 });
            }
        }

        return totalTris;
    }
    /**
     * 非垂直于草图平面的三角面片被拉伸体切割算法
     * 投影后求交，重新三角化
     * @param extruder 拉伸体
     * @param v1 顶点1
     * @param v2 顶点2
     * @param v3 顶点3
     * @returns 切割后的三角面片
     */
    private static cutInVerticalTriangle(
        extruder: Extruder,
        vertex1: IVertex,
        vertex2: IVertex,
        vertex3: IVertex,
    ): { vertex1: IVertex; vertex2: IVertex; vertex3: IVertex }[] {
        const plane = Plane.makeBy3Pts(vertex1.v, vertex2.v, vertex3.v);
        if (!plane) {
            return [];
        }
        const baseDir = ExtrudeClip.getTriangleNorm(vertex1.v, vertex2.v, vertex3.v);
        const triLoop = new Loop([vertex1.v, vertex2.v, vertex3.v]);
        if (!triLoop.isAnticlockwise()) triLoop.reverse();
        //1. 切割
        const ret: Polygon = alg.BoolOperate2d.difference(triLoop, [extruder.loop]);
        if (ret.getLoops().length === 0) return [];
        if (
            ret.getLoops().length === 1 &&
            ret.getLoops()[0].getAllPoints().length === 3 &&
            Math.abs(1 - ret.getLoops()[0].calcArea() / ExtrudeClip.calcTriangleArea(vertex1.v, vertex2.v, vertex3.v)) <
            ExtrudeClip.tol
        ) {
            return [{ vertex1, vertex2, vertex3 }];
        }
        let uvTransform: Matrix4 | undefined;
        //2. 切割后的结果
        const eo = plane.getOrigin();
        const en = plane.getNorm();
        //2.1 准备离散数据
        const loops = ret.getLoops();
        const pts: number[][] = [];
        const holes: number[][] = [];
        for (let i = 0; i < loops.length; ++i) {
            if (Math.abs(loops[i].calcArea()) < 1e-8 || !loops[i].isClosed()) continue;
            const pt3ds: number[] = loops[i].getAllPoints().reduce((total: number[], pt2d) => {
                const z = eo.z - (en.x * (pt2d.x - eo.x) + en.y * (pt2d.y - eo.y)) / en.z;
                total.push(...[pt2d.x, pt2d.y, z]);
                return total;
            }, []);
            if (pt3ds.length <= 4) continue;
            if (loops[i].isAnticlockwise()) {
                // 外圈
                pts.push(pt3ds);
                holes.push([]);
            } else {
                //洞
                holes[holes.length - 1].push(pts[pts.length - 1].length / 3);
                pts[pts.length - 1].push(...pt3ds);
            }
        }
        //2.2 执行切割
        const tris: { vertex1: IVertex; vertex2: IVertex; vertex3: IVertex }[] = [];
        for (let i = 0; i < pts.length; ++i) {
            const triangles = earcut(pts[i], holes[i].length ? holes[i] : undefined, 3);
            const vt = triangles.length / 3;
            for (let vi = 0; vi < vt; ++vi) {
                const ptid1 = triangles[3 * vi];
                const ptid2 = triangles[3 * vi + 1];
                const ptid3 = triangles[3 * vi + 2];
                const nv1 = { x: pts[i][3 * ptid1], y: pts[i][3 * ptid1 + 1], z: pts[i][3 * ptid1 + 2] };
                const nv2 = { x: pts[i][3 * ptid2], y: pts[i][3 * ptid2 + 1], z: pts[i][3 * ptid2 + 2] };
                const nv3 = { x: pts[i][3 * ptid3], y: pts[i][3 * ptid3 + 1], z: pts[i][3 * ptid3 + 2] };
                const ret = ExtrudeClip.reviseTriangleDir([nv1, nv2, nv3], baseDir);
                // 构造三角形
                const v1 = ret[0],
                    v2 = ret[1],
                    v3 = ret[2];
                let vn1 = baseDir,
                    vn2 = baseDir,
                    vn3 = baseDir;
                if (ExtrudeClip.sameVertex(v1, vertex1.v)) {
                    vn1 = vertex1.n;
                } else if (ExtrudeClip.sameVertex(v1, vertex2.v)) {
                    vn1 = vertex2.n;
                } else if (ExtrudeClip.sameVertex(v1, vertex3.v)) {
                    vn1 = vertex3.n;
                }
                if (ExtrudeClip.sameVertex(v2, vertex1.v)) {
                    vn2 = vertex1.n;
                } else if (ExtrudeClip.sameVertex(v2, vertex2.v)) {
                    vn2 = vertex2.n;
                } else if (ExtrudeClip.sameVertex(v2, vertex3.v)) {
                    vn2 = vertex3.n;
                }
                if (ExtrudeClip.sameVertex(v3, vertex1.v)) {
                    vn3 = vertex1.n;
                } else if (ExtrudeClip.sameVertex(v3, vertex2.v)) {
                    vn3 = vertex2.n;
                } else if (ExtrudeClip.sameVertex(v3, vertex3.v)) {
                    vn3 = vertex3.n;
                }
                const [[vuv1, vuv11], [vuv2, vuv12], [vuv3, vuv13]] = [v1, v2, v3].map(v => [false, true].map(isUV1 => {
                    let vuv = ExtrudeClip.getUVBySplit(v, vertex1, vertex2, vertex3, isUV1);
                    if (!vuv) {
                        if (!uvTransform) uvTransform = ExtrudeClip.getTriangleUVTransform(vertex1, vertex2, vertex3, isUV1);
                        vuv = ExtrudeClip.getUVByUVTransform(v, uvTransform);
                    }
                    return vuv;
                }));
                const triVertex1: IVertex = {
                    v: v1,
                    n: vn1,
                    uv: vuv1,
                    uv1: vuv11,
                };
                const triVertex2: IVertex = {
                    v: v2,
                    n: vn2,
                    uv: vuv2,
                    uv1: vuv12,
                };
                const triVertex3: IVertex = {
                    v: v3,
                    n: vn3,
                    uv: vuv3,
                    uv1: vuv13,
                };
                tris.push({ vertex1: triVertex1, vertex2: triVertex2, vertex3: triVertex3 });
            }
        }

        return tris;
    }
    /**
     * 纠正三角面片的方向
     * @param vtx 三角面片的顶点
     * @param dir 基准方向: 必须是单位向量
     */
    private static reviseTriangleDir(vtx: types.IXYZ[], dir: types.IXYZ): types.IXYZ[] {
        if (vtx.length !== 3) {
            console.assert(false, 'extrude clip: please give three point!');
            return [];
        }
        const triDir = ExtrudeClip.getTriangleNorm(vtx[0], vtx[1], vtx[2]);
        if (
            Math.abs(triDir.x - dir.x) <= 1e-6 &&
            Math.abs(triDir.y - dir.y) <= 1e-6 &&
            Math.abs(triDir.z - dir.z) <= 1e-6
        ) {
            return vtx;
        }
        return [vtx[2], vtx[1], vtx[0]];
    }
    /**
     * 给定三角面片的三个顶点，计算面积
     * @param v1 顶点1
     * @param v2 顶点2
     * @param v3 顶点3
     */
    private static calcTriangleArea(v1: types.IXYZ, v2: types.IXYZ, v3: types.IXYZ) {
        const a = Math.sqrt(Math.pow(v1.x - v2.x, 2) + Math.pow(v1.y - v2.y, 2) + Math.pow(v1.z - v2.z, 2));
        const b = Math.sqrt(Math.pow(v2.x - v3.x, 2) + Math.pow(v2.y - v3.y, 2) + Math.pow(v2.z - v3.z, 2));
        const c = Math.sqrt(Math.pow(v3.x - v1.x, 2) + Math.pow(v3.y - v1.y, 2) + Math.pow(v3.z - v1.z, 2));
        const p = (a + b + c) / 2;
        return Math.sqrt(p * (p - a) * (p - b) * (p - c));
    }
    /**
     * 获取归一化的三角面片法向
     * @param v1 第一个顶点
     * @param v2 第二个顶点
     * @param v3 第三个顶点
     * @returns 法向 - 单位化
     */
    private static getTriangleNorm(v1: types.IXYZ, v2: types.IXYZ, v3: types.IXYZ) {
        const dir1 = { x: v2.x - v1.x, y: v2.y - v1.y, z: v2.z - v1.z };
        const dir2 = { x: v3.x - v1.x, y: v3.y - v1.y, z: v3.z - v1.z };
        const triDir = {
            x: dir1.y * dir2.z - dir2.y * dir1.z,
            y: -(dir1.x * dir2.z - dir2.x * dir1.z),
            z: dir1.x * dir2.y - dir2.x * dir1.y,
        };
        const len = Math.sqrt(triDir.x * triDir.x + triDir.y * triDir.y + triDir.z * triDir.z);
        return { x: triDir.x / len, y: triDir.y / len, z: triDir.z / len };
    }
    /**
     * 给定三角面片，计算其对应的uvTransform矩阵
     * @param vertex1
     * @param vertex2
     * @param vertex3
     */
    private static getTriangleUVTransform(vertex1: IVertex, vertex2: IVertex, vertex3: IVertex, isUV1 = false): Matrix4 {
        const v1 = vertex1.v;
        const v2 = vertex2.v;
        const v3 = vertex3.v;
        let uv1 = vertex1.uv;
        let uv2 = vertex2.uv;
        let uv3 = vertex3.uv;
        if (isUV1 && vertex1.uv1 && vertex2.uv1 && vertex3.uv1) {
            uv1 = vertex1.uv1;
            uv2 = vertex2.uv1;
            uv3 = vertex3.uv1;
        }
        //1. vertex平面
        const plane1 = Plane.makeBy3Pts(v1, v2, v3);
        if (!plane1) {
            return new Matrix4();
        }
        const coord1 = plane1.getCoord();
        const mt1 = coord1.getWorldToLocalMatrix();
        const t1 = this.transformXYZ(v1, mt1);
        const t2 = this.transformXYZ(v2, mt1);
        const t3 = this.transformXYZ(v3, mt1);
        // debug
        {
            // const dir1 = new Vec2(t2.x - t1.x, t2.y - t1.y);
            // const dir2 = new Vec2(t3.x - t1.x, t3.y - t1.y);
            // const angle1 = dir1.angleTo(dir2);
            // const dir11 = new Vec2(uv2.x - uv1.x, uv2.y - uv1.y);
            // const dir22 = new Vec2(uv3.x - uv1.x, uv3.y - uv3.y);
            // const angle2 = dir11.angleTo(dir22);
            // if(Math.abs(angle1 - angle2) > 1e-4){
            //     console.assert(false, 'angle is not right!');
            // }
        }
        //2. uv平面
        const preUVPlane = Plane.makeBy3Pts(t1, t2, t3);
        const uvPlane = Plane.makeBy3Pts(
            { x: uv1.x, y: uv1.y, z: 0 },
            { x: uv2.x, y: uv2.y, z: 0 },
            { x: uv3.x, y: uv3.y, z: 0 },
        );
        if (!preUVPlane || !uvPlane) {
            return new Matrix4();
        }
        const preUVOrigin = preUVPlane.getOrigin();
        const uvPlaneOrigin = uvPlane.getOrigin();
        const dx = uvPlaneOrigin.x - preUVOrigin.x;
        const dy = uvPlaneOrigin.y - preUVOrigin.y;
        const baseDir = new Vec2({ x: t2.x - t1.x, y: t2.y - t1.y });
        const baseUVDir = new Vec2({ x: uv2.x - uv1.x, y: uv2.y - uv1.y });
        const rm = Matrix4.makeRotateZ(baseDir.angleTo(baseUVDir));
        const tm = Matrix4.makeTranslate({ x: dx, y: dy, z: 0 });
        //3. scale
        const t11 = this.transformXYZ(this.transformXYZ(t1, rm), tm);
        const t22 = this.transformXYZ(this.transformXYZ(t2, rm), tm);
        const t33 = this.transformXYZ(this.transformXYZ(t3, rm), tm);
        //debug: 校验旋转后的方向
        {
            // const dir_test = new Vec2(t33.x - t11.x, t33.y - t11.y).normalized();
            // const dir_base = new Vec2(uv3.x - uv1.x, uv3.y - uv1.y).normalized();
            // if(!dir_test.isSameDirection(dir_base)){
            //     console.assert(false, 'direction uv3 -> uv1 error!');
            // }
        }
        let scaleX = 1;
        if (Math.abs(uv2.x - uv1.x) > 1e-6 && Math.abs(t22.x - t11.x) > 1e-6) {
            scaleX = Math.abs(uv2.x - uv1.x) / Math.abs(t22.x - t11.x);
        } else if (Math.abs(uv3.x - uv1.x) > 1e-6 && Math.abs(t33.x - t11.x) > 1e-6) {
            scaleX = Math.abs(uv3.x - uv1.x) / Math.abs(t33.x - t11.x);
        } else if (Math.abs(uv3.x - uv2.x) > 1e-6 && Math.abs(t33.x - t22.x) > 1e-6) {
            scaleX = Math.abs(uv3.x - uv2.x) / Math.abs(t33.x - t22.x);
        }
        let scaleY = 1;
        if (Math.abs(uv2.y - uv1.y) > 1e-6 && Math.abs(t22.y - t11.y) > 1e-6) {
            scaleY = Math.abs(uv2.y - uv1.y) / Math.abs(t22.y - t11.y);
        } else if (Math.abs(uv3.y - uv1.y) > 1e-6 && Math.abs(t33.y - t11.y) > 1e-6) {
            scaleY = Math.abs(uv3.y - uv1.y) / Math.abs(t33.y - t11.y);
        } else if (Math.abs(uv3.y - uv2.y) > 1e-6 && Math.abs(t33.y - t22.y) > 1e-6) {
            scaleY = Math.abs(uv3.y - uv2.y) / Math.abs(t33.y - t22.y);
        }
        const scaleZ = 1;
        const sm = Matrix4.makeScale({ x: 0, y: 0, z: 0 }, { x: scaleX, y: scaleY, z: scaleZ });
        //4. final transform
        const nt11 = this.transformXYZ(t11, sm);
        // const nt22 = this.transformXYZ(t22, sm);
        // const nt33 = this.transformXYZ(t33, sm);
        const deltax = nt11.x - uv1.x;
        const deltay = nt11.y - uv1.y;
        const tm2 = Matrix4.makeTranslate({ x: -deltax, y: -deltay, z: 0 });
        const mt = mt1.preMultiplied(rm).preMultiplied(tm).preMultiplied(sm).preMultiplied(tm2);
        // for debug
        {
            // const uv1_t = this.transformXYZ(vertex1.v, mt);
            // const uv2_t = this.transformXYZ(vertex2.v, mt);
            // const uv3_t = this.transformXYZ(vertex3.v, mt);
            // if(!new Vec2(uv1_t).equals(vertex1.uv)){
            //     console.assert(false, 'uv1 not match');
            // }
            // if(!new Vec2(uv2_t).equals(vertex2.uv)){
            //     console.assert(false, 'uv2 not match');
            // }
            // if(!new Vec2(uv3_t).equals(vertex3.uv)){
            //     console.assert(false, 'uv3 not match');
            // }
        }
        return mt;
    }
    /**
     * 对xyz坐标进行矩阵变换
     * @param v 坐标点
     * @param mt 变换矩阵
     */
    private static transformXYZ(v: types.IXYZ, mt: Matrix4): types.IXYZ {
        return {
            x: mt.data[0][0] * v.x + mt.data[1][0] * v.y + mt.data[2][0] * v.z + mt.data[3][0],
            y: mt.data[0][1] * v.x + mt.data[1][1] * v.y + mt.data[2][1] * v.z + mt.data[3][1],
            z: mt.data[0][2] * v.x + mt.data[1][2] * v.y + mt.data[2][2] * v.z + mt.data[3][2],
        };
    }
    /**
     * 求顶点的uv值
     * @param v 顶点坐标
     * @param uvTransform 变换矩阵
     */
    private static getUVByUVTransform(v: types.IXYZ, uvTransform: Matrix4) {
        return {
            x:
                uvTransform.data[0][0] * v.x +
                uvTransform.data[1][0] * v.y +
                uvTransform.data[2][0] * v.z +
                uvTransform.data[3][0],
            y:
                uvTransform.data[0][1] * v.x +
                uvTransform.data[1][1] * v.y +
                uvTransform.data[2][1] * v.z +
                uvTransform.data[3][1],
        };
    }
    /**
     * 基于分割关系求uv
     * @param v 带求顶点
     * @param vertex1 原三角面片顶点1
     * @param vertex2 原三角面片顶点2
     * @param vertex3 原三角面片顶点3
     */
    private static getUVBySplit(
        v: types.IXYZ,
        vertex1: IVertex,
        vertex2: IVertex,
        vertex3: IVertex,
        isUV1 = false,
    ): types.IXY | undefined {
        let uv1 = vertex1.uv;
        let uv2 = vertex2.uv;
        let uv3 = vertex3.uv;
        if (isUV1 && vertex1.uv1 && vertex2.uv1 && vertex3.uv1) {
            uv1 = vertex1.uv1;
            uv2 = vertex2.uv1;
            uv3 = vertex3.uv1;
        }
        // 和顶点共点
        if (this.sameVertex(v, vertex1.v)) {
            return uv1;
        }
        if (this.sameVertex(v, vertex2.v)) {
            return uv2;
        }
        if (this.sameVertex(v, vertex3.v)) {
            return uv3;
        }

        const calcDistance = (v1: types.IXY, v2: types.IXY) => {
            return Math.sqrt((v1.x - v2.x) * (v1.x - v2.x) + (v1.y - v2.y) * (v1.y - v2.y));
        };

        // 在v1 -> v2上
        const dir1 = { x: v.x - vertex1.v.x, y: v.y - vertex1.v.y, z: 0 };
        const dir1_com = { x: vertex2.v.x - vertex1.v.x, y: vertex2.v.y - vertex1.v.y, z: 0 };
        if (this.sameDirection(dir1, dir1_com)) {
            const d1 = calcDistance(vertex1.v, v);
            const d2 = calcDistance(vertex2.v, v);
            const a1 = d2 / (d1 + d2);
            const a2 = 1 - a1;
            return { x: uv1.x * a1 + uv2.x * a2, y: uv1.y * a1 + uv2.y * a2 };
        }

        // 在v2 -> v3上
        const dir2 = { x: v.x - vertex2.v.x, y: v.y - vertex2.v.y, z: 0 };
        const dir2_com = { x: vertex3.v.x - vertex2.v.x, y: vertex3.v.y - vertex2.v.y, z: 0 };
        if (this.sameDirection(dir2, dir2_com)) {
            const d1 = calcDistance(vertex2.v, v);
            const d2 = calcDistance(vertex3.v, v);
            const a1 = d2 / (d1 + d2);
            const a2 = 1 - a1;
            return { x: uv2.x * a1 + uv3.x * a2, y: uv2.y * a1 + uv3.y * a2 };
        }

        // 在v3 -> v1上
        const dir3 = { x: v.x - vertex3.v.x, y: v.y - vertex3.v.y };
        const dir3_com = { x: vertex1.v.x - vertex3.v.x, y: vertex1.v.y - vertex3.v.y };
        if (this.sameDirection(dir3, dir3_com)) {
            const d1 = calcDistance(vertex3.v, v);
            const d2 = calcDistance(vertex1.v, v);
            const a1 = d2 / (d1 + d2);
            const a2 = 1 - a1;
            return { x: uv3.x * a1 + uv1.x * a2, y: uv3.y * a1 + uv1.y * a2 };
        }

        return;
    }
    private static sameDirection(va: types.IXY, vb: types.IXY) {
        return new Vec2(va).isParallel(vb, 1e-3);
    }
    private static crossVector3(v1: types.IXYZ, v2: types.IXYZ) {
        const x = v1.y * v2.z - v1.z * v2.y;
        const y = v1.z * v2.x - v1.x * v2.z;
        const z = v1.x * v2.y - v1.y * v2.x;
        return { x, y, z };
    }
    private static V3SQLength(v: types.IXYZ) {
        return v.x * v.x + v.y * v.y + v.z * v.z;
    }
    /**
     * 判断两个顶点是否共点
     * @param va 顶点a
     * @param vb 顶点b
     * @returns
     */
    private static sameVertex(va: types.IXYZ, vb: types.IXYZ) {
        if (Math.abs(va.x - vb.x) <= 1e-6 && Math.abs(va.y - vb.y) <= 1e-6 && Math.abs(va.z - vb.z) <= 1e-6) {
            return true;
        }
        return false;
    }
    // 对mesh顶点进行分类
    // private static classifyVtx(extruder: Extruder, mesh: types.IFlatMesh){
    //   const vn = mesh.vertices.length / 3;
    //   const vtxPoss = new Array<PositionType>(vn);
    //   const innerVtxIDS: number[] = [];
    //   const onVtxIDS: number[] = [];
    //   const outerVtxIDS: number[] = [];
    //   for(let vi = 0; vi < vn; ++vi){
    //     const v = {x: mesh.vertices[3 * vi], y: mesh.vertices[3 * vi + 1], z: mesh.vertices[3 * vi + 2]};
    //     if(v.z < -ExtrudeClip.tol || v.z > extruder.height + ExtrudeClip.tol){ //在拉伸体外部
    //       outerVtxIDS.push(vi);
    //       vtxPoss[vi] = PositionType.outer;
    //       continue;
    //     }
    //     const ret = alg.PJ.ptToLoop(new Vec2(v), extruder.loop).type;
    //     switch(ret){
    //       case alg.PtLoopPJType.IN:
    //         innerVtxIDS.push(vi);
    //         vtxPoss[vi] = PositionType.inner;
    //         break;
    //       case alg.PtLoopPJType.OUT:
    //         outerVtxIDS.push(vi);
    //         vtxPoss[vi] = PositionType.outer;
    //         break;
    //       case alg.PtLoopPJType.ONEDGE:
    //       case alg.PtLoopPJType.ONVERTEX:
    //       default:
    //         onVtxIDS.push(vi);
    //         vtxPoss[vi] = PositionType.on;
    //         break;
    //     }
    //   }
    //   return {vtxPoss, innerVtxIDS, onVtxIDS, outerVtxIDS};
    // }
}
