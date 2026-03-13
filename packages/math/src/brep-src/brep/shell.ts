/* eslint-disable prettier/prettier */
import { TopoObject } from './topo_object';
import { Vertex } from './vertex';
import { Edge } from './edge';
import { Face } from './face';
import { BrepUtil } from '../util/util';
import { IDBShell, IDBTopoObject } from '../type_define/i_types';
import { Wire } from './wire';
import { Coedge3d } from './coedge3d';
import { registerGeo } from '../../loader/register_geo';
import { IGeometry3d } from '../../type_define/i_geometry';
import { Surface } from '../../geometry/surface';
import { MathAssert } from '../../util/assert';
import { Ln3 } from '../../geometry/ln3';
import { Vec3 } from '../../base/vec3';
import { Curve3 } from '../../geometry/curve3d';
import { types } from '../../type_define/i_types';
import { Matrix4 } from '../../base/matrix4';
import { Box2 } from '../../base/box2';
import { Box3 } from '../../base/box3';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { Loader } from '../../loader/loader';
import { MathError, MathErrorType } from '../../util/math_error';

declare type VertexTag = string;
declare type EdgeTag = string;

/**
 * 壳，标识不封闭的body
 */
@registerGeo
class Shell extends TopoObject implements IGeometry3d {
    protected readonly _vTagToVertexMap: Map<VertexTag, Vertex> = new Map();

    protected readonly _eTagToEdgeMap: Map<EdgeTag, Edge> = new Map();

    protected readonly _faceList: Face[] = [];

    private _tol?: number;

    /**
     * shell是否是空的（没有任何的Edge和Face）
     */
    public isEmpty() {
        return !this._faceList.length && !this._eTagToEdgeMap.size;
    }

    /**
     * 是否只包含平面
     */
    public isOnlyPlane() {
        return this._faceList.every(face => face.getSurface().isPlane());
    }

    public clear() {
        this._faceList.splice(0);
        this._vTagToVertexMap.clear();
        this._eTagToEdgeMap.clear();
    }

    /**
     * 获取所有的面
     */
    public getFaces(): ReadonlyArray<Face> {
        return this._faceList;
    }

    /**
     * 获取所有的边
     */
    public getEdges() {
        return [...this._eTagToEdgeMap.values()];
    }

    /**
     * 获取所有的顶点
     */
    public getVertexs() {
        return [...this._vTagToVertexMap.values()];
    }

    public get tolerance() {
        return this._tol;
    }

    /**
     *  向body中添加一个面
     */
    public createFace(surface: Surface, faceDir: boolean, wires?: Wire[], tag?: string) {
        const face = new Face(surface, faceDir, wires);
        if (tag) face.tag = tag;
        this.addFace(face);
        return face;
    }

    /**
     *  向body中添加face，若face没有合法的索引，则会分配一个
     * @param face
     */
    public addFace(face: Face) {
        if (!face.tag) {
            face.tag = BrepUtil.generateShortUUID();
        }
        face.setParent(this);
        this._faceList.push(face);
    }

    /**
     * 删除face
     * @param face
     */
    public deleteFace(face: Face) {
        const faceIdx = this._faceList.findIndex(f => {
            return f.tag === face.tag;
        });

        if (faceIdx < 0) {
            return;
        }

        // 删除面
        face.setParent(undefined);
        this._faceList.splice(faceIdx, 1);
    }

    /**
     *  删除face
     * @param face
     */
    public deleteFaceByTag(tag: string) {
        const faceIdx = this._faceList.findIndex(face => {
            return tag === face.tag;
        });

        if (faceIdx < 0) {
            return;
        }

        // 删除面
        this._faceList[faceIdx].setParent(undefined);
        this._faceList.splice(faceIdx, 1);
    }

    /**
     * 根据tag获取face
     * @param index
     */
    public getFaceByTag(uuid: string): Face | undefined {
        return this._faceList.find(face => {
            return uuid === face.tag;
        });
    }

    /**
     *  向body中添加一条新的边，并赋予该edge一个索引，
     * @returns 返回新的边
     *
     */
    public createLineEdge(startVertex: Vertex, endVertex: Vertex): Edge {
        MathAssert.assert(startVertex && endVertex, 'Shell createLineEdge()失败，Vertex为空！');
        let line3d: Ln3;
        if (startVertex === endVertex) {
            line3d = new Ln3(startVertex.getPoint(), Vec3.X(), [0, 0]);
        } else {
            line3d = new Ln3(startVertex.getPoint(), endVertex.getPoint());
        }

        const edge = new Edge(line3d, startVertex, endVertex);
        this.addEdge(edge);
        return edge;
    }

    /**
     *  向body中添加一条边，并赋予该edge一个索引，
     */
    public createEdge(curve: Curve3, startVertex?: Vertex, endVertex?: Vertex, tag?: string) {
        const edge = new Edge(curve, startVertex, endVertex);
        if (tag) edge.tag = tag;
        this.addEdge(edge);
        return edge;
    }

    /**
     *  向body中添加一条边，并赋予该edge一个索引，
     */
    public addEdge(edge: Edge) {
        if (!edge.tag) {
            edge.tag = BrepUtil.generateShortUUID();
        }

        edge.setParent(this);
        this._eTagToEdgeMap.set(edge.tag, edge);
    }

    public deleteEdge(edge: Edge) {
        return this._eTagToEdgeMap.delete(edge.tag);
    }

    /**
     * 根据tag获取edge
     * @param index
     */
    public getEdgeByTag(tag: string): Edge | undefined {
        return this._eTagToEdgeMap.get(tag);
    }

    /**
     * 删除edge
     * @param edgeTag
     */
    public deleteEdgeByTag(edgeTag: string): boolean {
        return this._eTagToEdgeMap.delete(edgeTag);
    }

    /**
     *  向body中添加一条新的边，并赋予该edge一个索引，
     * @returns 返回新的边
     *
     */
    public createVertex(point: Vec3, tag?: string): Vertex {
        const vertex = new Vertex(point);
        if (tag) vertex.tag = tag;
        this.addVertex(vertex);
        return vertex;
    }

    /**
     *  向body中添加一个顶点，并赋予该vertex一个索引，
     */
    public addVertex(vertex: Vertex) {
        if (!vertex.tag) {
            vertex.tag = BrepUtil.generateShortUUID();
        }

        vertex.setParent(this);
        this._vTagToVertexMap.set(vertex.tag, vertex);
    }

    /**
     * 从Shell中删除一个点
     * @param vertex
     */
    public deleteVertex(vertex: Vertex) {
        this._vTagToVertexMap.delete(vertex.tag);
    }

    /**
     * 根据tag获取Vertex
     * @param index
     */
    public getVertexByTag(tag: string): Vertex | undefined {
        return this._vTagToVertexMap.get(tag);
    }

    /**
     * 删除顶点
     * @param vertexTag
     */
    public deleteVertexByTag(vertexTag: string) {
        return this._vTagToVertexMap.delete(vertexTag);
    }

    public updateTolerance() {
        for (const iter of this._eTagToEdgeMap) {
            if (iter[1].tolerance && iter[1].tolerance > 0) {
                if (this._tol === undefined || iter[1].tolerance > this._tol) {
                    this._tol = iter[1].tolerance;
                }
            }
        }
    }

    /**
     * 拓扑是否合法
     */
    public isTopoValid(): boolean {
        // 遍历topo关系
        for (const f of this.getFaces()) {
            for (const w of f.getWires()) {
                for (const ce3d of w.getCoedge3ds()) {
                    if (ce3d.getShell() !== this) {
                        return false;
                    }
                    if (ce3d.getWire() !== w) {
                        return false;
                    }
                    if (ce3d.getFace() !== f) {
                        return false;
                    }
                    if (!ce3d.getEdge()) {
                        return false;
                    }
                }
            }
        }
        for (const e of this.getEdges()) {
            if (!e.getCoedge3ds()) {
                return false;
            }
            if (!e.getCoedge3ds().length) {
                return false;
            }
            for (const ce3d of e.getCoedge3ds()) {
                const f1 = ce3d.getFace();
                if (this._faceList.findIndex(f => f === f1) < 0) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * 拓扑是否是合法的brepbody，一个edge关联2个coedge
     */
    public isTopoValidBrepBody() {
        // 遍历topo关系
        for (const f of this.getFaces()) {
            if (f.getWires().length === 0) {
                return false;
            }
            for (const w of f.getWires()) {
                if (w.getCoedge3ds().length === 0) {
                    return false;
                }
                for (const ce3d of w.getCoedge3ds()) {
                    if (ce3d.getShell() !== this) {
                        return false;
                    }
                    if (ce3d.getWire() !== w) {
                        return false;
                    }
                    if (ce3d.getFace() !== f) {
                        return false;
                    }
                    if (!ce3d.getEdge()) {
                        return false;
                    }
                    if (ce3d.getTwins().length < 1) {
                        return false;
                    }

                    for (const twin of ce3d.getTwins()) {
                        if (twin.getTwins().findIndex(_ => _.tag === ce3d.tag) === -1) {
                            return false;
                        }
                    }
                }
            }
        }

        for (const e of this.getEdges()) {
            if (e.getParent() !== this) {
                return false;
            }
            if (e.getCoedge3ds().length % 2 > 0) {
                return false;
            }
            if (!e.getStartVertex()) {
                return false;
            }
            if (!e.getEndVertex()) {
                return false;
            }
        }

        for (const v of this.getVertexs()) {
            if (v.getParent() !== this) {
                return false;
            }
            if (v.getEdges().length < 2 && !v.getEdges()[0].getCurve().isPeriodic()) {
                return false;
            }
        }
        return true;
    }

    public transform(m: types.IMatrix4 | types.numberArrs4X4, extra?: { svd: types.IMatrix4Svd }): this {
        const _svd = extra?.svd || Matrix4.make(m, false).decompose();
        const isMirror = Matrix4.isSvdMirror(_svd);
        const isEqualScale = Matrix4.isScaleEqual(_svd.scale);

        // 1.变换顶点
        this._vTagToVertexMap.forEach(v => {
            v.getPoint().transform(m);
        });

        const updatePCurveForDegenerate = (coedge: Coedge3d, surf: Surface, newSurf: Surface) => {
            const pCrv = coedge.getPCurve();
            if (!pCrv) {
                return;
            }
        };

        if (!isEqualScale) {
            // 先缓存box
            const boxes = new Map<string, Box2>();
            for (const f of this._faceList) {
                const range = f.calcPolygon().getBBox();
                if (range.isValid()) {
                    boxes.set(f.tag, range);
                }
            }

            // 2.变换Edge
            for (const e of this._eTagToEdgeMap) {
                const cv = e[1].getCurve();
                const tCv = cv.transformed(m, extra);
                e[1].setCurve(tCv);
            }

            // 3.变换Face
            for (const f of this._faceList) {
                const srf = f.getSurface();
                const transformSurf = srf.transformed(m, { ...extra, range: boxes.get(f.tag) });
                f.setSurface(transformSurf);

                // 缩放后pcurve处理
                for (const wire of f.getWires()) {
                    for (const coedge of wire.getCoedge3ds()) {
                        updatePCurveForDegenerate(coedge, srf, transformSurf);
                    }
                }

                // 镜像处理
                if (isMirror) {
                    f.getWires().forEach(w => w.reverse());
                }
            }

            return this;
        }

        // 2.变换Edge
        this._eTagToEdgeMap.forEach(e => e.getCurve().transform(m, extra));

        // 3.变换Face
        for (const f of this._faceList) {
            const srf = f.getSurface();
            const origSurf = srf.clone();
            srf.transform(m, extra);

            if (Matrix4.isOnlyTranslateAndRotate(_svd.scale)) {
                continue; // 如果只有移动和旋转，是不涉及pCurve的变化的
            }

            // 镜像处理
            if (isMirror) {
                f.getWires().forEach(w => w.reverse());
            }
        }

        return this;
    }

    /**
     * 平移
     */
    public translate(offset: types.IXYZ): this {
        const matrix4 = Matrix4.makeTranslate({ x: offset.x, y: offset.y, z: (offset as any).z || 0 });
        return this.transform(matrix4);
    }

    /**
     * 绕坐标轴/点的旋转
     * @param angle 旋转的角度
     * @param pivot 旋转轴上一点
     * @param axis  绕哪个轴旋转
     */
    public rotate(angle: number, pivot: types.IXYZ | types.IXY, axis?: types.IXYZ): this {
        // 默认绕着z轴旋转
        const fixedAxis = axis || { x: 0, y: 0, z: 1 };
        const p3 = { x: pivot.x, y: pivot.y, z: (pivot as any).z || 0 };
        const matrix = Matrix4.makeRotate(p3, fixedAxis, angle);
        return this.transform(matrix);
    }

    /**
     * 等比缩放
     * @param factor 放大因子
     * @param center 缩放中心
     */
    public scale(factor: number, center: types.IXY | types.IXYZ = { x: 0, y: 0, z: 0 }): this {
        const v: types.IXYZ = { x: center.x, y: center.y, z: (center as any).z || 0 };
        const m = Matrix4.makeScale(v, factor);
        return this.transform(m);
    }

    public getBBox(): Box3 {
        const box = new Box3();
        this._faceList.forEach(face => {
            box.union(face.getBBox());
        });

        return box;
    }

    /**
     * 深拷贝
     */
    public clone(): Shell {
        const obj = new (this.constructor as any)().load(this.dump()) as Shell;
        obj.dUserData = this.dUserData;
        obj.userData = this.userData;

        obj._faceList.forEach(face => {
            const otherFace = this.getFaceByTag(face.tag);
            if (!otherFace) {
                throw new Error('not find face by tag!');
            }
            face.userData = otherFace.userData;
            face.dUserData = otherFace.dUserData;

            face.getSurface().userData = otherFace.userData;
            face.getSurface().dUserData = otherFace.dUserData;

            const wires = otherFace.getWires();
            face.getWires().forEach((wire, wi) => {
                wire.userData = wires[wi].userData;
                wire.dUserData = wires[wi].dUserData;
                wire.getCoedge3ds().forEach((coedge, ci) => {
                    const otherEdge = wires[wi].getCoedge3ds()[ci];
                    coedge.userData = otherEdge.userData;
                    coedge.dUserData = otherEdge.dUserData;
                    const [pCurve, edge] = [coedge.getPCurve(), coedge.getEdge()];
                    if (pCurve) {
                        pCurve.userData = otherEdge.getPCurve()!.userData;
                        pCurve.dUserData = otherEdge.getPCurve()!.dUserData;
                    }
                    if (edge) {
                        edge.userData = otherEdge.getEdge()!.userData;
                        edge.dUserData = otherEdge.getEdge()!.dUserData;
                        edge.getCurve().userData = otherEdge.getEdge()!.getCurve().userData;
                        edge.getCurve().dUserData = otherEdge.getEdge()!.getCurve().dUserData;
                    }
                });
            });
        });
        obj.getEdges().forEach(edge => {
            const otherEdge = this.getEdgeByTag(edge.tag)!;
            edge.userData = otherEdge.userData;
            edge.dUserData = otherEdge.dUserData;
            edge.getCurve().userData = otherEdge.getCurve().userData;
            edge.getCurve().dUserData = otherEdge.getCurve().dUserData;
        });
        obj.getVertexs().forEach(vertex => {
            vertex.userData = this.getVertexByTag(vertex.tag)!.userData;
            vertex.dUserData = this.getVertexByTag(vertex.tag)!.dUserData;
        });
        return obj;
    }

    public getType(): EN_GEO_TYPE {
        return EN_GEO_TYPE.BREP_SHELL;
    }

    public replaceFaceTag(tag: string, newTag: string) {
        const face = this.getFaceByTag(tag);
        if (face) {
            face.tag = newTag;
        }
    }

    public replaceEdgeTag(tag: string, newTag: string) {
        const e = this.getEdgeByTag(tag);
        if (e) {
            this._eTagToEdgeMap.delete(tag);
            e.tag = newTag;
            this._eTagToEdgeMap.set(newTag, e);
        }
    }

    public replaceVertexTag(tag: string, newTag: string) {
        const v = this.getVertexByTag(tag);
        if (v) {
            this._vTagToVertexMap.delete(tag);
            v.tag = newTag;
            this._vTagToVertexMap.set(newTag, v);
        }
    }

    /**
     *  抽取元数据，用于序列化
     * @returns 返回js对象
     */
    public dump(): IDBShell {
        const result = super.dump() as IDBShell;
        result.fs = this._faceList.map(face => {
            const fData = face.dump();
            (fData as any).type = undefined;
            return fData;
        });
        result.es = this.getEdges().map(edge => {
            const eData = edge.dump();
            (eData as any).type = undefined;
            return eData;
        });
        result.vs = this.getVertexs().map(v => {
            const vData = v.dump();
            (vData as any).type = undefined;
            return vData;
        });
        return result;
    }

    public load({ tag, flag, data, fs, es, vs, _d }: IDBShell): this {
        super.load({ tag, flag, data, _d } as IDBTopoObject);

        const edgeVertexMap = new Map<string, string[]>();

        // 反射每个顶点
        for (const v of vs) {
            v.type = EN_GEO_TYPE.BREP_VERTEX;
            this.addVertex(Loader.load(v) as Vertex);
        }

        // 反射每条Edge
        for (const edge of es) {
            edge.type = EN_GEO_TYPE.BREP_EDGE;
            this.addEdge(Loader.load(edge) as Edge);
            (edgeVertexMap as any)[edge.tag] = [edge.sVTag, edge.eVTag];
        }

        // 反射每个面
        for (const face of fs) {
            face.type = EN_GEO_TYPE.BREP_FACE;
            this.addFace(Loader.load(face) as Face);
        }

        // 更新拓扑对象之间的引用关系
        this._buildTopoRelation(edgeVertexMap);

        return this;
    }

    private _buildTopoRelation(edgeVertexMap: Map<string, string[]>) {
        for (const face of this._faceList) {
            face.getCoedge3ds().forEach(coedge => {
                const eTag = coedge.getEdgeTag();
                const edge = this.getEdgeByTag(eTag);
                if (!edge) {
                    MathError.assert(edge, 'Edge not found.', MathErrorType.Input, eTag);
                }
                coedge.setEdge(edge!);
            });
        }
        for (const edge of this.getEdges()) {
            const vTags = (edgeVertexMap as any)[edge.tag];
            const vA = this.getVertexByTag(vTags[0]);
            MathError.assert(vA, 'Start vertex not found.', MathErrorType.Input, vTags[0]);
            edge.setStartVertex(vA!);
            const vB = this.getVertexByTag(vTags[1]);
            MathError.assert(vB, 'End Vertex not found.', MathErrorType.Input, vTags[1]);
            edge.setEndVertex(vB!);
            if (!edge.getCurve()) {
                edge.setCurve(new Ln3(vA!.getPoint(), vB!.getPoint()));
            }
        }
    }
}

export { Shell };