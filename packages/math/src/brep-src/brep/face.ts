

import { Shell } from './shell';
import { Vertex } from './vertex';
import { Edge } from './edge';
import { Wire } from './wire';
import { Coedge3d } from './coedge3d';
import { TopoObject } from './topo_object';
import { BrepUtil } from '../util/util';
import { IDBFace, IDBTopoObject } from '../type_define/i_types';
import { registerGeo } from '../../loader/register_geo';
import { Coord3 } from '../../base/coord3';
import { Ln2 } from '../../geometry/ln2';
import { Plane } from '../../geometry/plane';
import { Surface } from '../../geometry/surface';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';
import { MathAssert } from '../../util/assert';
import { types } from '../../type_define/i_types';
import { Vec3 } from '../../base/vec3';
import { Vec2 } from '../../base/vec2';
import { TrimmedSurface } from '../../topology/trimmed_surface';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { DiscreteParam } from '../../base/discrete_param';
import { Cylinder } from '../../geometry/cylinder';
import { Tol } from '../../base/tol';
import { Box3 } from '../../base/box3';
import * as alg from '../../algorithm'
import { UvUtil } from '../../util/uv_util';
import { Polygon } from '../../topology/polygon';
import { gaussIntegration } from '../../math/gauss_integration';
import { Loader } from '../../loader/loader';
/**
 * @author tiansk
 *  拓扑面（有边界的面）
 */
@registerGeo
class Face extends TopoObject {
    /**
     * 根据给定坐标系与边界半长，生成表示平面
     * @param coord
     * @param halfLength
     */
    public static createPlane(coord: Coord3, halfLength: number, shell?: Shell): Face {
        const points = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ];
        const lines: Ln2[] = [];
        for (let i = 0; i < points.length; i++) {
            const p0 = points[i];
            const p1 = points[(i + 1) % points.length];
            lines.push(
                new Ln2(
                    { x: p0[0] * halfLength, y: p0[1] * halfLength },
                    { x: p1[0] * halfLength, y: p1[1] * halfLength },
                ),
            );
        }
        const plane = new Plane(coord);
        return Face.createByBoundary2d(plane, [lines], true, shell);
    }

    /**
     * 从二维边界创建
     * @param surface 底层的无限大曲面
     * @param uvPolygon 无限大曲面上，二维区域的边界
     * @param isPositive 是否同向的标记
     */
    public static createByBoundary2d(surface: Surface, loop2ds: Curve2[][], direction: boolean, shell?: Shell): Face {
        const loop3ds = loop2ds.map(loop2d => loop2d.map(curve2d => surface.getCurve3d(curve2d)));
        return Face.createByBoundary(surface, loop2ds, loop3ds, direction, shell);
    }

    /**
     * 从三维边界创建
     * @param surface 底层的无限大曲面
     * @param loop3ds 无限大曲面上，三维区域的边界
     * @param isPositive 是否同向的标记
     */
    public static createByBoundary3d(surface: Surface, loop3ds: Curve3[][], direction: boolean, shell?: Shell): Face {
        // todo: ConeTop not supported
        const lp2ds = loop3ds.map(lp => new Array<undefined>(lp.length));
        return Face.createByBoundary(surface, lp2ds, loop3ds, direction, shell);
    }

    public static createByBoundary(
        surface: Surface,
        loop2ds: (Curve2 | undefined)[][],
        loop3ds: Curve3[][],
        direction: boolean,
        shell?: Shell,
    ): Face {
        MathAssert.assert(loop2ds.length === loop3ds.length, 'loop length should equal');

        const retShell = shell || new Shell();
        const wires: Wire[] = [];
        for (let li = 0; li < loop3ds.length; li++) {
            const wire = new Wire();
            const loop3d = loop3ds[li];
            const loop2d = loop2ds[li];
            const n = loop3d.length;
            const vertices = new Array<Vertex>(n);

            for (let vi = 0; vi < n; vi++) {
                const p0 = loop3d[(vi + n - 1) % n].getEndPt();
                const p1 = loop3d[vi].getStartPt();
                vertices[vi] = retShell.createVertex(p0.midTo(p1));
            }

            for (let ei = 0; ei < loop3ds[li].length; ei++) {
                const edge = retShell.createEdge(loop3d[ei], vertices[ei], vertices[(ei + 1) % n]);
                const coedge = new Coedge3d(edge, true);
                coedge.setPCurve(loop2d[ei]);
                wire.addCoedge3d(coedge);
            }
            wires.push(wire);
        }
        return retShell.createFace(surface, direction, wires);
    }

    // 确定face的形状
    private _surface: Surface;

    // face与Surface方向是否一致
    private _sameDirWithSurface: boolean;

    // 构成面域的三维线框（一个环一个框）
    private _wireList: Wire[] = [];

    constructor(surface: Surface, sameDirWithSurface: boolean, wireList?: Wire[]) {
        super();

        this._surface = surface;
        this._sameDirWithSurface = sameDirWithSurface;
        if (wireList) {
            wireList.forEach(w => this.addWire(w));
        }
    }

    public setSurface(surface: Surface) {
        this._surface = surface.clone();
    }

    public getSurface() {
        return this._surface;
    }

    public setSameDirWithSurface(sameDirWithSurface: boolean) {
        this._sameDirWithSurface = sameDirWithSurface;
    }

    public getSameDirWithSurface() {
        return this._sameDirWithSurface;
    }

    /**
     * 将当前面反向
     */
    public reverse() {
        this._sameDirWithSurface = !this._sameDirWithSurface;
    }

    public getWires(): ReadonlyArray<Wire> {
        return this._wireList;
    }

    public setWires(wires: Wire[]) {
        this._wireList.forEach(wire => {
            wire.setParent(undefined);
        });

        this._wireList = wires.slice();

        this._wireList.forEach(wire => {
            wire.setParent(this);
        });
    }

    /**
     * 获取任意点的法矢
     * @param uv
     */
    public getNormAt(uv: types.IXY) {
        const norm = this.getSurface().getNormAt(uv);
        if (this._sameDirWithSurface) {
            return norm;
        }
        return norm.reverse();
    }

    /**
     * 获取中心点的法矢
     * @param uv
     */
    public getCenterNorm(): Vec3 {
        if (this.getSurface().isPlane()) {
            return this.getNormAt(Vec2.O());
        }

        const polygon = this.calcPolygon();
        if (!polygon.isEmpty()) {
            return this.getNormAt(polygon.getCentroidPoint());
        }
        MathAssert.assert(false, '计算Face的中心点法向失败！');
        return new Vec3();
    }

    /**
     * 获取中心点
     */
    public getCentroidPoint(): Vec3 {
        const polygon = this.calcPolygon();
        if (!polygon.isEmpty()) {
            return this._surface.getPtAt(polygon.getCentroidPoint());
        }
        MathAssert.assert(false, '计算Face的中心点失败！');
        return new Vec3();
    }

    /**
     * 添加一个环
     * @param wire
     */
    public addWire(wire: Wire) {
        if (!wire.tag) {
            wire.tag = BrepUtil.generateShortUUID();
        }

        const origFace = wire.getFace();
        if (origFace) {
            origFace.deleteWire(wire);
        }
        wire.setParent(this);
        this._wireList.push(wire);
    }

    /**
     * 在face的指定位置添加wire，若wire没有合法的索引，则会分配一个
     * @param wire
     */
    public insertWire(index: number, ...wires: Wire[]) {
        wires.forEach(wire => {
            if (!wire.tag) {
                wire.tag = BrepUtil.generateShortUUID();
            }

            const origFace = wire.getFace();
            if (origFace) {
                origFace.deleteWire(wire);
            }
            wire.setParent(this);
        });

        this._wireList.splice(index, 0, ...wires);
    }

    public deleteWire(wire: Wire) {
        const index = this._wireList.findIndex(w => {
            return wire.tag === w.tag;
        });

        if (index > -1) {
            this._wireList[index].setParent(undefined);
            this._wireList.splice(index, 1);
        }
    }

    public deleteAllWires() {
        this._wireList = [];
    }

    /**
     * 根据tag获取Wire
     * @param tag
     */
    public getWireByTag(tag: string): Wire | undefined {
        if (!this._wireList) {
            return undefined;
        }
        const index = this._wireList.findIndex(wire => {
            return wire.tag === tag;
        });

        if (index > -1) {
            return this._wireList[index];
        }
        return undefined;
    }

    /**
     * 根据tag获取Wire
     * @param tag
     */
    public deleteWireByTag(tag: string) {
        const index = this._wireList.findIndex(wire => {
            return wire.tag === tag;
        });

        if (index > -1) {
            this._wireList[index].setParent(undefined);
            this._wireList.splice(index, 1);
        }
    }

    /**
     * 获取所有的coedges
     * @param index
     */
    public getCoedge3ds(): Coedge3d[] {
        if (this._wireList.length < 1) {
            return [];
        }

        const allCoedge3ds: Coedge3d[] = [];
        for (const wire of this._wireList) {
            allCoedge3ds.push(...wire.getCoedge3ds());
        }
        return allCoedge3ds;
    }

    /**
     * 获取所有的edge
     */
    public getEdges(): Edge[] {
        const edgeSet = new Set<Edge>();
        const ce3ds = this.getCoedge3ds();
        ce3ds.forEach(ce3d => {
            const edge = ce3d.getEdge() as Edge;
            if (edge) {
                edgeSet.add(edge);
            } else {
                MathAssert.assert(false, 'Coedge3d对应的Edge为空 !');
            }
        });
        return Array.from(edgeSet);
    }

    /**
     * 获取所有的vertex
     */
    public getVertexes(): Vertex[] {
        const edges: Edge[] = this.getEdges();
        const vertexIdSet = new Set<Vertex>();
        for (const edge of edges) {
            const stVertex = edge.getStartVertex();
            const endVertex = edge.getEndVertex();
            if (stVertex) {
                vertexIdSet.add(stVertex);
            }
            if (endVertex) {
                vertexIdSet.add(endVertex);
            }
        }
        return [...vertexIdSet.values()];
    }

    /**
     * 获取有共边的Face
     */
    public getTwinFaces(onlyOuter: boolean = false): Face[] {
        const twinFaces: Set<Face> = new Set();
        let ce3ds: Coedge3d[] = [];
        if (onlyOuter && this._wireList.length) {
            ce3ds = this._wireList[0].getCoedge3ds().slice();
        } else {
            ce3ds = this.getCoedge3ds();
        }
        ce3ds.forEach(ce3d => {
            const twinCoedge3ds = ce3d.getTwins();
            for (const twinCoedge3d of twinCoedge3ds) {
                const twinFace = twinCoedge3d.getFace();
                if (twinFace) {
                    twinFaces.add(twinFace);
                }
            }
        });

        return [...twinFaces];
    }

    /**
     * 获取所有的edge
     */
    public getShell(): Shell | undefined {
        return this.getParent() as Shell;
    }

    public getTrimmedSurface(): TrimmedSurface | undefined {
        const loop = this._wireList.map(w => w.getCoedge3ds().map(e => e.getCurve()));
        let trimmedSurface;
        try {
            trimmedSurface = TrimmedSurface.createByBoundary3d(this._surface, loop, this._sameDirWithSurface);
        } catch (e) {
            console.log(e);
        }
        return trimmedSurface;
    }

    /**
     * 清除面及子拓扑的关系
     */
    public dispose() {
        this._wireList.forEach(w => w.dispose());
        this.deleteAllWires();
    }

    public getType(): EN_GEO_TYPE.BREP_FACE {
        return EN_GEO_TYPE.BREP_FACE;
    }

    /**
     * 面上是否每一条Coedge3d都已关联Edge
     */
    public isEdgeInfoValid() {
        for (const wire of this._wireList) {
            if (!wire.isEdgeInfoValid()) {
                return false;
            }
        }

        return true;
    }

    /**
     *  计算包围盒
     */
    public getBBox(params = DiscreteParam.NORMAL, tol = Tol.DEFAULT): Box3 {
        const srf = this._surface;
        if (srf instanceof Plane || srf instanceof Cylinder) {
            return this._wireList[0].getBBox();
        }

        const loops = this._getDirectedLoops();
        const pts = alg.DiscreteUtil.discreteSurfaceIntoPoints(this._surface, loops, params, tol);
        const box = new Box3(pts);
        return box;
    }

    public discrete(params = DiscreteParam.NORMAL, tol = Tol.DEFAULT): types.IMesh {
        const loops = this._getDirectedLoops();
        const mesh = alg.DiscreteUtil.discreteSurface(this._surface, loops, this._sameDirWithSurface, params, tol);
        mesh.uvs = UvUtil.parseUvInArcLength(mesh.uvs, this._surface, false);
        return mesh;
    }

    public tessellate(
        params = DiscreteParam.NORMAL,
        tol = Tol.DEFAULT,
    ): types.IRenderNode {
        const mesh = this.discrete(params, tol);
        return {
            mesh,
        };
    }

    // 计算在参数域上的二维轮廓
    // 圆柱面，需要将参数域拓展，以支持跨周期的情况
    public calcPolygon() {
        if (this._wireList.length < 1) {
            return new Polygon();
        }

        if (!this.isEdgeInfoValid()) {
            MathAssert.assert(false, '面上有Coedge3d未关联Edge，计算Polygon失败!');
            return new Polygon();
        }

        const polygon = new Polygon();
        for (const wire of this._wireList) {
            polygon.addLoop(wire.calcLoop(), false);
        }

        return polygon;
    }

    /**
     * 计算face的面积
     */
    public calcArea(): number {
        const poly2ds = this.calcPolygon();

        let ret = 0.0;
        const surf = this.getSurface();
        for (const loop of poly2ds.getLoops()) {
            for (const cv2d of loop.getAllCurves()) {
                // 对于每条curve2d，u = x(t)；v = y(t); 计算与x轴围的面积：面积元就是dv * du，积分区域是[u0, u1]、[v0, v1]；
                // 令v = f(u)，积分区域是[u0, u1]、[f(u0), f(u1)]；用u = x(t)替换参数u, 变成与t相关的函数, dv * du = dv * x'(t) * dt; t是curve2d的参数.
                // 面积元就变成了 dv * x'(t) * dt。外层积分肯定是对t的积分，就是对curve的range积分；内层积分为，Math.sqrt(EG - F * F) * dv * x'(t)
                const outFunc = (t: number) => {
                    const pt = cv2d.getPtAt(t);
                    const dut = cv2d.getDerivatives(t, 1)[1];
                    const innerFunc = (s: number) => {
                        const firstForm = surf.firstFundamentalForm({ x: pt.x, y: s });
                        const EG_F2 = firstForm[0] * firstForm[2] - firstForm[1] * firstForm[1];
                        return Math.sqrt(EG_F2);
                    };

                    // 二重积分数值计算方法：先固定u值(u=x(t),固定t的值)，计算v方向的一重积分。因为二维区域是与x轴的围成的面积，所以是[0, pt.y]
                    const innerInte = gaussIntegration(innerFunc, 0, pt.y, 1.0e-6, 1.0e-6) * dut.x;
                    return innerInte;
                };

                const range = cv2d.getRange();
                ret += gaussIntegration(outFunc, range.min, range.max, 1.0e-6, 1.0e-6);
            }
        }

        return -ret;
    }

    /**
     * 计算face外环围的面积，即face不带洞的面积
     */
    public calcAreaForOutWire(): number {
        if (this.getWires().length < 1) {
            return 0;
        }

        const outWire = this.getWires()[0];
        const outLoop = outWire.calcLoop();

        let ret = 0.0;
        const surf = this.getSurface();
        for (const cv2d of outLoop.getAllCurves()) {
            // 对于每条curve2d，u = x(t)；v = y(t); 计算与x轴围的面积：面积元就是dv * du，积分区域是[u0, u1]、[v0, v1]；
            // 令v = f(u)，积分区域是[u0, u1]、[f(u0), f(u1)]；用u = x(t)替换参数u, 变成与t相关的函数, dv * du = dv * x'(t) * dt; t是curve2d的参数.
            // 面积元就变成了 dv * x'(t) * dt。外层积分肯定是对t的积分，就是对curve的range积分；内层积分为，Math.sqrt(EG - F * F) * dv * x'(t)
            const outFunc = (t: number) => {
                const pt = cv2d.getPtAt(t);
                const dut = cv2d.getDerivatives(t, 1)[1];
                const innerFunc = (s: number) => {
                    const firstForm = surf.firstFundamentalForm({ x: pt.x, y: s });
                    const EG_F2 = firstForm[0] * firstForm[2] - firstForm[1] * firstForm[1];
                    return Math.sqrt(EG_F2);
                };

                // 二重积分数值计算方法：先固定u值(u=x(t),固定t的值)，计算v方向的一重积分。因为二维区域是与x轴的围成的面积，所以是[0, pt.y]
                const innerInte = gaussIntegration(innerFunc, 0, pt.y, 1.0e-6, 1.0e-6) * dut.x;
                return innerInte;
            };

            const range = cv2d.getRange();
            ret += gaussIntegration(outFunc, range.min, range.max, 1.0e-6, 1.0e-6);
        }

        return -ret;
    }

    /**
     *  抽取元数据，用于序列化
     * @returns 返回js对象
     */
    public dump(): IDBFace {
        const result = super.dump() as IDBFace;
        result.dir = this._sameDirWithSurface ? 1 : 0;
        result.s = this._surface.dump();
        result.ws = this._wireList.map(wire => {
            const wData = wire.dump();
            (wData as any).type = undefined;
            return wData;
        });
        return result;
    }

    public load({ tag, flag, data, dir, s, ws, _d }: IDBFace): this {
        super.load({ tag, flag, data, _d } as IDBTopoObject);

        this.setSameDirWithSurface(dir > 0);
        this._surface = Loader.load(s) as Surface;

        this._wireList = [];
        ws.forEach(w => {
            w.type = EN_GEO_TYPE.BREP_WIRE;
            this.addWire(Loader.load(w) as unknown as Wire);
        });

        return this;
    }

    private _getDirectedLoops(): alg.IDirectedCurve[][] {
        return this._wireList.map(wire =>
            wire.getCoedge3ds().map(_ => ({
                curve: _.getEdge()!.getCurve(),
                pCurve: _.getPCurve(),
                isSameDirection: _.getSameDirWithEdge(),
                startPoint: _.getStartVertex().getPoint(),
                endPoint: _.getEndVertex().getPoint(),
            })),
        );
    }
}

export { Face };