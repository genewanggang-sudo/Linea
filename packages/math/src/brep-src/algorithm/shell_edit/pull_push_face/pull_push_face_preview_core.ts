/* eslint-disable no-console */
import {
    Vec3,
    Plane,
    Ln3,
    MathAssert,
    Arc3,
    Cylinder,
    Coord3,
    Surface,
    Loop,
    Polygon,
    SmoothPoly2,
    DiscreteParam,
} from '../../../..';
import { addShellModifyInfo, IShellModelingResult } from '../shell_modeling_result';
import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';
import { Wire } from '../../../brep/wire';
import { Vertex } from '../../../brep/vertex';
import { Edge } from '../../../brep/edge';
import { checkPullPushCondition } from './pull_push_face_core';
import { Coedge3d } from '../../../brep/coedge3d';
import { ExtrudeBody } from '../../body_builder/extrude_body';



interface IVertexInfo {
    v: Vertex; // 原顶点（有可能被偏移过）

    v_?: Vertex; // 新增的顶点

    ce: Coedge3d;

    newEdge?: Edge; // 新增的侧面edge vv_
}

function newLineEdge(v1: Vertex, v2: Vertex) {
    const line = new Ln3(v1.getPoint(), v2.getPoint());
    const edge = new Edge(line, v1, v2);
    edge.setSmooth(v1.getSmooth());
    return edge;
}

// 返回有序的顶点序列 【顶点，几何点，顶点的后一条coedge,顶点的前一条coedge】
function getWireVertexesAndEdge(wire: Wire): [Vertex, Vec3, Coedge3d, Coedge3d][] {
    const ces = wire.getCoedge3ds();
    return ces.map((ce, idx) => [
        ce.getStartVertex(),
        // 为了避免多次移动顶点造成错误的结果
        ce.getStartVertex().getPoint().clone(),
        ce,
        ces[(idx - 1 + ces.length) % ces.length],
    ]);
}

// 真曲线的推拉，为了保证非真曲线的稳定性，暂时保留原始推拉preview
export class PullPushFacePreviewUtil {
    private _face: Face;

    private _pullPushVec: Vec3;

    private _bClosedBottom: boolean;

    constructor(face: Face, pullPushVec: Vec3, bClosedBottom: boolean) {
        this._face = face;
        this._pullPushVec = pullPushVec;
        this._bClosedBottom = bClosedBottom;
    }

    public execute(): IShellModelingResult {
        // 0. 检测推拉条件
        // checkPullPushCondition(this._face, this._pullPushVec);

        const result: IShellModelingResult = {};
        result.deleteShells = [];
        result.modifiedShellsMap = new Map();

        const shell = this._face.getShell()!;
        const newFaces: Face[] = [];
        const modifiedFaces: Face[] = [this._face];

        // 1.逐个处理侧面
        const wiresInfos: IVertexInfo[][] = []; // 每个环的vertexes分成一组，多个环就有多组
        const surfNormal = this._face.getSurface().getNormAt({ x: 0, y: 0 });
        for (const wire of this._face.getWires()) {
            const wireVertexInfos = this._dealVertexesAndSideEdges(wire, surfNormal);
            this._dealSideFaces(wireVertexInfos, surfNormal, newFaces, modifiedFaces);
            wiresInfos.push(wireVertexInfos);
        }

        // 2.重新构造顶面
        const sur = this._face.getSurface() as Plane;
        const sameDir = this._face.getSameDirWithSurface();

        const top = sur.clone().translate(this._pullPushVec);
        this._face.setSurface(top);
        this._regenerateFaceByVertexes(this._face, wiresInfos);

        // 3.添加底面
        if (this._bClosedBottom) {
            const bottom = new Face(sur, !sameDir);
            shell.addFace(bottom);
            this._regenerateFaceByVertexes(bottom, wiresInfos);
            newFaces.push(bottom);
        }

        addShellModifyInfo(result.modifiedShellsMap!, shell, newFaces, undefined, modifiedFaces);
        return result;
    }

    private _dealVertexesAndSideEdges(wire: Wire, faceNormal: Vec3) {
        const thisShell = this._face!.getParent()! as Shell;
        const wireEdges = new Set<Edge>();
        for (const ce of wire.getCoedge3ds()) {
            wireEdges.add(ce.getEdge()!);
        }

        const vertexInfos: IVertexInfo[] = [];
        const shouldCreatedVs = new Set<string>(); // 新增对应的顶点
        const shouldModifyEdges = new Set<string>();

        // 先get face相关的顶点和edge等信息
        const vertexesOnFace = getWireVertexesAndEdge(wire);
        vertexesOnFace.forEach(([v, point, ce, prevCe]) => {
            if (shouldCreatedVs.has(v.tag)) {
                return;
            }

            if (ce.getTwin() && prevCe.getTwin()) {
                const edges = v.getEdges().filter(e => !wireEdges.has(e));

                if (edges.length === 0) {
                    if (ce.getTwin()?.getFace()) {
                        if (this._isSurfacePerpendicularPlane(ce.getTwin()!.getFace()!.getSurface(), faceNormal)) {
                            return; // ？？啥情况会进来？暂时没遇到？？
                        }
                    }
                } else {
                    let allSidesParallel = true;
                    for (const ice of edges) {
                        const curv = ice.getCurve();
                        if (!(curv instanceof Ln3) || !curv.getDirection().isParallel(faceNormal)) {
                            allSidesParallel = false;
                        }
                    }
                    if (allSidesParallel) {
                        edges.map(e => shouldModifyEdges.add(e.tag));
                        return; // 只有所有的平面外edge都平行拉伸方向的时候才移动Vertex，都则都是新增Vertex
                    }
                }
            }

            shouldCreatedVs.add(v.tag); // 需要新增顶点
        });

        // 执行新增和移动
        vertexesOnFace.forEach(([v, point, ce]) => {
            const newPt = point.added(this._pullPushVec);
            if (shouldCreatedVs.has(v.tag)) {
                const v_ = new Vertex(newPt);
                thisShell.addVertex(v_);

                const newEdge = newLineEdge(v, v_); // new侧面edge，都是直线
                thisShell.addEdge(newEdge);
                vertexInfos.push({ v, v_, ce, newEdge });
            } else {
                v.setPoint(newPt); // 移动后，更新侧面edge的vertex

                const edges = v.getEdges().filter(e => shouldModifyEdges.has(e.tag));
                for (const ice of edges) {
                    const newLine = new Ln3(ice.getStartVertex().getPoint(), ice.getEndVertex().getPoint());
                    ice.setCurve(newLine); // 更新侧面edge
                }
                vertexInfos.push({ v, ce });
            }
        });

        return vertexInfos;
    }

    private _dealSideFaces(
        wireVertexInfos: IVertexInfo[],
        surfNormal: Vec3,
        newFaces: Face[],
        modifiedFaces: Face[],
    ) {
        for (let i = 0; i < wireVertexInfos.length; i++) {
            const ice = wireVertexInfos[i].ce;
            const stVertexInfo = wireVertexInfos[i];
            const endVertexInfo = wireVertexInfos[(i + 1) % wireVertexInfos.length];

            // 两边vertex都是移动的，直接平移了原始edge
            if (!stVertexInfo.v_ && !endVertexInfo.v_) {
                const thisEdge = ice.getEdge()!;
                const newCurve = thisEdge.getCurve().clone().translate(this._pullPushVec); // 更新侧面的的底边edge
                thisEdge.setCurve(newCurve);

                const twins = ice
                    .getTwins()
                    .map(_ => _.getFace()!)
                    .filter(_ => !!_);

                if (twins.length) {
                    modifiedFaces.push(...new Set(twins));
                }
                continue;
            }

            // 两边vertex都是新增的，直接补面，或者是修改侧面
            if (stVertexInfo.v_ && endVertexInfo.v_) {
                const { newFace, modifiedFace } = this._handleNewNew(ice, stVertexInfo, endVertexInfo, surfNormal);
                if (newFace) {
                    newFaces.push(newFace);
                }
                if (modifiedFace) {
                    modifiedFaces.push(modifiedFace);
                }
                continue;
            }

            // 一边是vertex是新增的，一边vertex是移动的
            let mf: Face | undefined;
            if (!stVertexInfo.v_ && endVertexInfo.v_) {
                mf = this._handleTanslateNew(ice, stVertexInfo, endVertexInfo);
            } else {
                mf = this._handleNewTanslate(ice, stVertexInfo, endVertexInfo);
            }

            if (mf) {
                modifiedFaces.push(mf);
            }
        }
    }

    /*
        // 构造侧拉伸面，保证除去构造的wire都是逆时针，且保证侧拉伸面face方向都指向体外
        endPt _______
             |       |
             |       |
        stPt  ———>———
              coedge
    */
    private _newSideSurface(
        coedge: Coedge3d,
        stPt: Vec3,
        endPt: Vec3,
        surfNormal: Vec3,
    ): { surf: Surface; sameDir: boolean } {
        const vDir = endPt.subtracted(stPt);
        const outDir = surfNormal.dot(vDir) > 0;

        const coedgeCurv = coedge.getCurve();
        if (coedgeCurv instanceof Ln3) {
            const coedgeDir = coedgeCurv.getDirection();
            const plane = new Plane(stPt, coedgeDir, vDir); // 利用了coedge方向和拉伸方向
            return { surf: plane, sameDir: outDir };
        }

        if (coedgeCurv instanceof Arc3) {
            const arcCrd = coedgeCurv.getCoord();
            const coord = new Coord3(arcCrd.getOrigin(), arcCrd.getDx(), vDir.cross(arcCrd.getDx()));
            const cyl = new Cylinder(coord, coedgeCurv.getA(), coedgeCurv.getB()); // 利用了coedge方向和拉伸方向
            return { surf: cyl, sameDir: outDir };
        }

        throw new Error('not supported');
    }

    private _isSurfacePerpendicularPlane(surf: Surface, norm: Vec3): boolean {
        if (surf instanceof Plane) {
            return surf.getNorm().isPerpendicular(norm);
        }

        if (surf instanceof Cylinder) {
            return surf.getCenterAxis().isParallel(norm);
        }

        return false;
    }

    /*
             2个顶点都是新增的
                    ce
              新增 _______  新增
                 /       \
                /_________\
                     |
                    \|/
                     v
                   newEdge
           st.v_   _______  end.v_
         st.Edge  |       | end.Edge
            st.v  |.......| end.v
                  /  ce   \
                 /_________\
    */
    private _handleNewNew(
        ce: Coedge3d,
        stVtInfo: IVertexInfo,
        endVtInfo: IVertexInfo,
        bottomSurfNorm: Vec3,
    ): { newFace?: Face; modifiedFace?: Face } {
        const shell = stVtInfo.ce.getShell()!;

        // 修改侧面
        const twins = ce.getTwins();
        if (twins.length > 1) {
            console.warn('请处理该情况');
        }

        const thisEdge = ce.getEdge()!;

        const newCurve = ce.getCurve().translate(this._pullPushVec); // 顶边edge,方向始终与底边coedge的方向相同
        const topEdge = new Edge(newCurve, stVtInfo.v_!, endVtInfo.v_!);
        shell.addEdge(topEdge);

        if (twins.length === 1) {
            const twinSurf = twins[0].getFace()!.getSurface();
            if (this._isSurfacePerpendicularPlane(twinSurf, bottomSurfNorm)) {
                // 对于相邻的face是平面且垂直于当前推拉的face，不需要构建新的surface，只要在之前的face上对wire做些修改就能达到效果
                const twin = twins[0];
                const wire = twin.getWire()!;
                const idx = wire.getCoedge3ds().findIndex(_coe => _coe === twin);

                // if (twin.getStartVertex().tag === stVtInfo.v.tag) { // 如果遇到周期性曲线，起点和终点相同，就会出问题
                if (twin.getSameDirWithEdge() === ce.getSameDirWithEdge()) {
                    const ce1 = new Coedge3d(stVtInfo.newEdge!, true);
                    const ce2 = new Coedge3d(topEdge, true);
                    const ce3 = new Coedge3d(endVtInfo.newEdge!, false);
                    wire.replaceCoedge3d(idx, [ce1, ce2, ce3]); // 很巧妙，只是预览，不用管coedge重合问题，加入这三条coedge，可以把原来的去掉一块甚至从视觉上给完全去掉
                } else {
                    const ce3 = new Coedge3d(endVtInfo.newEdge!, true);
                    const ce2 = new Coedge3d(topEdge, false);
                    const ce1 = new Coedge3d(stVtInfo.newEdge!, false);
                    wire.replaceCoedge3d(idx, [ce3, ce2, ce1]);
                }

                const ok = shell.deleteEdge(thisEdge);
                MathAssert.assert(ok, '删除失败');
                return { modifiedFace: wire.getFace() };
            }
        }

        const wire = new Wire();
        const surfInfo = this._newSideSurface(ce, stVtInfo.v.getPoint(), stVtInfo.v_!.getPoint(), bottomSurfNorm);
        const sideFace = new Face(surfInfo.surf, surfInfo.sameDir, [wire]);
        wire.addCoedge3d(new Coedge3d(endVtInfo.newEdge!, true));
        wire.addCoedge3d(new Coedge3d(topEdge, false));
        wire.addCoedge3d(new Coedge3d(stVtInfo.newEdge!, false));
        if (ce.getSameDirWithEdge()) {
            wire.addCoedge3d(new Coedge3d(thisEdge, true)); // 注意，此时thisEdge的两个coedge方向都为true（期望在构造底面的时候，对其进行修改）
        } else {
            wire.addCoedge3d(new Coedge3d(thisEdge, false));
        }

        shell.addFace(sideFace);
        return { newFace: sideFace };
    }

    private _handleTanslateNew(
        ice: Coedge3d,
        { v: thisV, ce }: IVertexInfo,
        { v_: thatV_, newEdge: thatNewEdge }: IVertexInfo,
    ): Face | undefined {
        // 修改侧面
        const twins = ce.getTwins();
        if (twins.length === 0) {
            return undefined;
        }
        if (twins.length > 1) {
            //
        }

        // edge的curve位置变了和起点终点vertex变了
        const edge = ce.getEdge()!;
        edge.getCurve().translate(this._pullPushVec);
        if (ce.getSameDirWithEdge()) {
            edge.setEndVertex(thatV_!); // 主要是终点vertex整个都变了，起点vertex只是位置变了
        } else {
            edge.setStartVertex(thatV_!);
        }

        const twin = twins[0];
        const wire = twin.getWire()!;
        const idx = wire.getCoedge3ds().findIndex(_ce => _ce === twin);
        if (twin.getSameDirWithEdge() === ce.getSameDirWithEdge()) {
            const ce1 = new Coedge3d(thatNewEdge!, true);
            wire.insertCoedge3d(idx + 1, ce1);
        } else {
            const ce1 = new Coedge3d(thatNewEdge!, true);
            wire.insertCoedge3d(idx, ce1);
        }
        return wire.getFace();
    }

    private _handleNewTanslate(
        ice: Coedge3d,
        { v: thisV, v_: thisV_, ce, newEdge: thisNewEdge }: IVertexInfo,
        { v: thatV }: IVertexInfo,
    ) {
        // 修改侧面
        const twins = ce.getTwins();
        if (twins.length === 0) {
            // console.warn('请处理该情况');
            return undefined;
        }
        if (twins.length > 1) {
            console.warn('找到多个twin');
        }

        // edge的curve位置变了和起点终点vertex变了
        const edge = ce.getEdge()!;
        edge.getCurve().translate(this._pullPushVec);
        if (ce.getSameDirWithEdge()) {
            edge.setStartVertex(thisV_!); // 主要是起点vertex整个都变了，终点vertex只是位置变了
        } else {
            edge.setEndVertex(thisV_!);
        }

        const twin = twins[0];
        const wire = twin.getWire()!;
        const idx = wire.getCoedge3ds().findIndex(_ce => _ce === twin);
        if (twin.getSameDirWithEdge() === ce.getSameDirWithEdge()) {
            const ce1 = new Coedge3d(thisNewEdge!, true);
            wire.insertCoedge3d(idx, ce1);
        } else {
            const ce1 = new Coedge3d(thisNewEdge!, true);
            wire.insertCoedge3d(idx + 1, ce1);
        }
        return wire.getFace();
    }

    /**
     * 根据顶点序列重新生成face的wire，face的tag保持不变
     * @param face
     * @param vertexesArr
     */
    private _regenerateFaceByVertexes(face: Face, vertexesArr: IVertexInfo[][]) {
        const shell = face.getParent() as Shell;
        face.deleteAllWires();

        vertexesArr.forEach((vertexes, id) => {
            const wire = new Wire();
            face.addWire(wire);
            vertexes.forEach((iv, idx) => {
                const v = iv.v_ ?? iv.v;
                const vedges = v.getEdges();
                const newxtIV = vertexes[(idx + 1) % vertexes.length];
                const newxtV = newxtIV.v_ ?? newxtIV.v;
                let edge: Edge | undefined;
                for (const ie of vedges) {
                    if (ie.getEndVertexTag() === newxtV.tag || ie.getStartVertexTag() === newxtV.tag) {
                        // 同一起点和终点的edge可能有多条，取哪一条？拉伸出来的顶面和底面的curve的类型相同，并且切向也会相同
                        // 并且当wire是一个整圆时，起点和终点是同一个点，任意过该点的edge都可能起点终点都过这两个vt。也是要这样判断是不是这条edge
                        if (iv.ce.getCurve().getType() !== ie.getCurve().getType()) {
                            continue;
                        }
                        const stTangent = iv.ce.getCurve().getStartTangent();
                        const endTangent = iv.ce.getCurve().getEndTangent();
                        const ieStTanget = ie.getCurve().getStartTangent();
                        const ieEndTangent = ie.getCurve().getEndTangent();
                        if (
                            (ieStTanget.isParallel(stTangent) && ieEndTangent.isParallel(endTangent)) ||
                            (ieStTanget.isParallel(endTangent) && ieEndTangent.isParallel(stTangent))
                        ) {
                            edge = ie;
                            break;
                        }
                    }
                }

                if (!edge) {
                    edge = newLineEdge(v, newxtV);
                    shell.addEdge(edge);
                }

                // 当wire是一个整圆时，起点和终点是同一个点，edge.getStartVertexTag() === v.tag没用。需要计算wire投影的面积来判断顺逆时针
                if (newxtV.tag === v.tag) {
                    const pcurve = face.getSurface().getCurve2d(edge.getCurve());
                    const loop = new Loop([pcurve]);
                    const clockSign = loop.calcArea() > 0;
                    const isOutLoop = id === 0;
                    wire.addCoedge3d(new Coedge3d(edge, isOutLoop === clockSign));
                } else {
                    wire.addCoedge3d(new Coedge3d(edge, edge.getStartVertexTag() === v.tag));
                }
            });
        });
    }
}

/*
    2个顶点都是新增的
            ce
     新增  _______  新增
          /       \
         /_________\

              |
             \|/
              v

           newEdge
     thisV_ _______  thatV_  
thisNewEdge|       |  thatNewEdge
     thisV |.......|  thatV
           /       \
          /_________\
*/
function handleNewNew(
    { v: thisV, v_: thisV_, ce, newEdge: thisNewEdge }: IVertexInfo,
    { v: thatV, v_: thatV_, newEdge: thatNewEdge }: IVertexInfo,
): { newFace?: Face; modifiedFace?: Face } {
    const shell = thisV.getParent() as Shell;
    const thisNorm = ce.getFace()!.getCenterNorm();

    // 修改侧面
    const twins = ce.getTwins();
    // if (twins.length > 1) {
    //     console.warn('请处理该情况');
    //     return {};
    // }

    const thisEdge = ce.getEdge()!;

    const newEdge = newLineEdge(thisV_!, thatV_!);
    shell.addEdge(newEdge);

    if (twins.length === 1) {
        const twinFace = twins[0].getFace()!;
        const twinPlane = twinFace.getSurface() as Plane;
        if (twinPlane.isPlane() && twinPlane.getNorm().isPerpendicular(thisNorm)) {
            const twin = twins[0];
            const wire = twin.getWire()!;
            const idx = wire.getCoedge3ds().findIndex(_ => _ === twin);

            if (twin.getStartVertex().tag === thisV.tag) {
                const ce1 = new Coedge3d(thisNewEdge!, true);
                const ce2 = new Coedge3d(newEdge!, true);
                const ce3 = new Coedge3d(thatNewEdge!, false);
                wire.replaceCoedge3d(idx, [ce1, ce2, ce3]);
            } else {
                const ce3 = new Coedge3d(thatNewEdge!, true);
                const ce2 = new Coedge3d(newEdge!, false);
                const ce1 = new Coedge3d(thisNewEdge!, false);
                wire.replaceCoedge3d(idx, [ce1, ce2, ce3]);
            }

            const ok = shell.deleteEdge(thisEdge);
            MathAssert.assert(ok, '删除失败');
            return { modifiedFace: wire.getFace() };
        }
    }
    // 直接新建face
    const surface = new Plane(
        thisV.getPoint(),
        new Vec3(thisV.getPoint(), thatV!.getPoint()),
        new Vec3(thisV.getPoint(), thisV_!.getPoint()),
    );
    const wire = new Wire();
    const sideFace = new Face(surface, true, [wire]);
    wire.addCoedge3d(new Coedge3d(thatNewEdge!, true));
    wire.addCoedge3d(new Coedge3d(newEdge, false));
    wire.addCoedge3d(new Coedge3d(thisNewEdge!, false));
    if (thisEdge.getStartVertex().tag === thisV.tag) {
        wire.addCoedge3d(new Coedge3d(thisEdge, true));
    } else {
        wire.addCoedge3d(new Coedge3d(thisEdge, false));
    }
    shell.addFace(sideFace);
    return { newFace: sideFace };
}

/*
    前一个顶点保留，后一个新增
         ce
  保留 ________  新增
      |        \
      |_________\

           |
          \|/
           v

        newEdge
 thisV ________  thatV_  
      |\ .     |  thatNewEdge
      |    *. .|  thatV
      |        \
      |_________\
*/
function handleTanslateNew(
    { v: thisV, ce }: IVertexInfo,
    { v_: thatV_, newEdge: thatNewEdge }: IVertexInfo,
): Face | undefined {
    const shell = thisV.getParent() as Shell;

    // 修改侧面
    const twins = ce.getTwins();
    if (twins.length === 0) {
        return undefined;
    }

    if (twins.length > 1) {
        //
    }

    const twin = twins[0];

    const wire = twin.getWire()!;
    const idx = wire.getCoedge3ds().findIndex(_ => _ === twin);

    const newEdge = newLineEdge(thatV_!, thisV);
    shell.addEdge(newEdge);

    if (twin.getStartVertex().tag === thisV.tag) {
        const ce1 = new Coedge3d(newEdge, false);
        const ce2 = new Coedge3d(thatNewEdge!, false);
        wire.replaceCoedge3d(idx, [ce1, ce2]);
    } else {
        const ce1 = new Coedge3d(thatNewEdge!, true);
        const ce2 = new Coedge3d(newEdge, true);
        wire.replaceCoedge3d(idx, [ce1, ce2]);
    }
    // 删除edge
    shell.deleteEdgeByTag(ce!.getEdgeTag()!);
    return wire.getFace();
}

/*
    前一个顶点保留，后一个新增
                ce
        新增  ________ 保留  
             /        |
            /_________|
     
                 |
                \|/
                 v

              newEdge
      thisV_   ________  thatV  
 thisNewEdge  |     . /|  
        thisV |. . *   |  
              /        |
             /_________|
*/
function handleNewTanslate({ v: thisV, v_: thisV_, ce, newEdge: thisNewEdge }: IVertexInfo, { v: thatV }: IVertexInfo) {
    const shell = thisV.getParent() as Shell;

    // 修改侧面
    const twins = ce.getTwins();
    if (twins.length === 0) {
        // console.warn('请处理该情况');
        return undefined;
    }

    if (twins.length > 1) {
        console.warn('找到多个twin');
    }

    const twin = twins[0];

    const wire = twin.getWire()!;
    const idx = wire.getCoedge3ds().findIndex(_ => _ === twin);

    const newEdge = newLineEdge(thisV_!, thatV);
    shell.addEdge(newEdge);

    if (twin.getStartVertex().tag === thisV!.tag) {
        const ce1 = new Coedge3d(thisNewEdge!, true);
        const ce2 = new Coedge3d(newEdge, true);
        wire.replaceCoedge3d(idx, [ce1, ce2]);
    } else {
        const ce1 = new Coedge3d(newEdge, false);
        const ce2 = new Coedge3d(thisNewEdge!, false);
        wire.replaceCoedge3d(idx, [ce1, ce2]);
    }
    // 删除edge
    shell.deleteEdgeByTag(ce!.getEdgeTag()!);
    return wire.getFace();
}

function extrudeWire(
    wire: Wire,
    pullPushVec: Vec3,
): { newFaces: Face[]; vertexInfos: IVertexInfo[]; modifiedFaces: Face[] } {
    const thisFace = wire.getFace()!;
    const thisShell = thisFace!.getParent()! as Shell;

    // 先计算顶点
    const vertexesOnFace = getWireVertexesAndEdge(wire);
    const edgesOnFace = new Set(thisFace.getEdges());

    const faceNormal = thisFace.getSurface().getNormAt({ x: 0, y: 0 });

    const newVertexes: IVertexInfo[] = [];

    // 新增的顶点
    const shouldCreatedVs = new Set<string>();
    vertexesOnFace.forEach(([v, point, ce, preCE]) => {
        if (shouldCreatedVs.has(v.tag)) {
            return;
        }

        if (ce.getTwin() && preCE.getTwin()) {
            const edges = v.getEdges().filter(e => !edgesOnFace.has(e));

            if (!edges.length) {
                if (ce.getTwin()?.getFace()?.getSurface().getNormAt({ x: 0, y: 0 }).isPerpendicular(faceNormal)) {
                    return;
                }
            }

            if (edges.length === 1) {
                const edge = edges[0];
                const line = edge.getCurve() as Ln3;
                // 移动顶点
                if (line.isLine3d() && line.getDirection().isParallel(faceNormal)) {
                    return;
                }
            }
        }

        shouldCreatedVs.add(v.tag);
    });

    // 执行新增和移动
    vertexesOnFace.forEach(([v, point, ce]) => {
        const newPt = point.added(pullPushVec);
        if (shouldCreatedVs.has(v.tag)) {
            const v_ = new Vertex(newPt);
            thisShell.addVertex(v_);

            const newEdge = newLineEdge(v, v_);
            thisShell.addEdge(newEdge);
            newVertexes.push({ v, v_, ce, newEdge });
        } else {
            v.setPoint(newPt);
            newVertexes.push({ v, ce });
        }
    });

    // 移动点后更新所有的edge
    newVertexes.forEach(({ v, v_ }) => {
        if (!v_) {
            v.getEdges().forEach(eg => {
                const newLine = new Ln3(eg.getStartVertex().getPoint(), eg.getEndVertex().getPoint());
                eg.setCurve(newLine);
            });
        }
    });

    const newFaces: Face[] = [];
    const modifiedFaces: Face[] = [];
    for (let i = 0; i < newVertexes.length; i++) {
        const thisInfo = newVertexes[i];
        const thatInfo = newVertexes[(i + 1) % newVertexes.length];

        const { newEdge: thisNewEdge, ce } = thisInfo;
        const { newEdge: thatNewEdge } = thatInfo;

        // 直接平移了顶点，不需要额外处理
        if (!thisNewEdge && !thatNewEdge) {
            const twins = ce
                .getTwins()
                .map(_ => _.getFace()!)
                .filter(_ => !!_);

            if (twins.length) {
                modifiedFaces.push(...new Set(twins));
            }
            continue;
        }

        // 直接补面，或者是修改侧面
        if (thisNewEdge && thatNewEdge) {
            const { newFace, modifiedFace } = handleNewNew(thisInfo, thatInfo);
            if (newFace) {
                newFaces.push(newFace);
            }
            if (modifiedFace) {
                modifiedFaces.push(modifiedFace);
            }
            continue;
        }

        let mf: Face | undefined;
        if (!thisNewEdge && thatNewEdge) {
            mf = handleTanslateNew(thisInfo, thatInfo);
        } else {
            mf = handleNewTanslate(thisInfo, thatInfo);
        }

        if (mf) {
            modifiedFaces.push(mf);
        }
    }
    return { newFaces, vertexInfos: newVertexes, modifiedFaces };
}

/**
 * 根据顶点序列重新生成face的wire，face的tag保持不变
 * @param face
 * @param vertexesArr
 */
function regenerateFaceByVertexes(face: Face, vertexesArr: Vertex[][]) {
    const shell = face.getParent() as Shell;
    face.deleteAllWires();

    // 真曲线不能用，当wire是一个整圆时，起点和终点时同一个点，找到的edge可能不对
    vertexesArr.forEach(vertexes => {
        const wire = new Wire();
        face.addWire(wire);
        vertexes.forEach((v, idx) => {
            const vedges = v.getEdges();
            const newxtV = vertexes[(idx + 1) % vertexes.length];
            let edge: Edge | undefined;
            for (const ie of vedges) {
                // if (ie.getEndVertexTag() === newxtV.tag || ie.getStartVertexTag() === newxtV.tag) {
                if (ie.getEndVertexTag() === newxtV.tag) {
                    edge = ie;
                    break;
                }
            }

            if (!edge) {
                edge = newLineEdge(v, newxtV);
                shell.addEdge(edge);
            }

            wire.addCoedge3d(new Coedge3d(edge, edge.getStartVertexTag() === v.tag));
        });
    });
}

export function pullPushFacePreviewCore(
    face: Face,
    pullPushVec: Vec3,
    bExtrudeBehavior: boolean,
): IShellModelingResult {
    // 0. 检测推拉条件
    checkPullPushCondition(face, pullPushVec);

    if (bExtrudeBehavior) {
        // 调用extrude进行预览
        const coordinate = (face.getSurface() as Plane).getCoord().clone();
        const polygon = face.calcPolygon();
        const tessPolygon = new Polygon();
        // 使用smoothpoly 提升预览性能
        polygon.getLoops().forEach(l => {
            const ttlop = new Loop();
            l.getAllCurves().forEach(c => {
                if (c.isLine2d() || c.isArc2d()) {
                    ttlop.addCurve(c);
                } else {
                    ttlop.addCurve(new SmoothPoly2(c.discrete(DiscreteParam.LOW)));
                }
            });
            tessPolygon.addLoop(ttlop, false);
        });
        const dir = pullPushVec.normalized();
        let startH = 0;
        let endH = 0;
        if (coordinate.getDz().dot(pullPushVec) > 0) {
            endH = pullPushVec.getLength();
        } else {
            startH = -pullPushVec.getLength();
            dir.reverse();
        }
        const shell = face.getShell()!;
        const body = ExtrudeBody.execute(coordinate, tessPolygon, dir, startH, endH, false, false, [])!;
        body.getFaces().forEach(f => shell.addFace(f));
        body.getEdges().forEach(e => shell.addEdge(e));
        body.getVertexs().forEach(v => shell.addVertex(v));
        const result: IShellModelingResult = {};
        result.modifiedShellsMap = new Map();
        addShellModifyInfo(result.modifiedShellsMap!, shell, body.getFaces().slice(), undefined, undefined);
        return result;
    }

    const useRealCurves = (theFace: Face) => {
        const allEdges = theFace.getEdges();
        for (const e of allEdges) {
            if (!e.getCurve().isLine3d()) {
                return true;
            }
        }
        return false;
    };

    if (useRealCurves(face)) {
        return new PullPushFacePreviewUtil(face, pullPushVec, bExtrudeBehavior).execute();
    }

    const result: IShellModelingResult = {};
    result.deleteShells = [];
    result.modifiedShellsMap = new Map();

    const newFaces: Face[] = [];
    const modifiedFaces: Face[] = [face];

    // 1.计算侧面
    const wireInfos: IVertexInfo[][] = [];
    face.getWires().forEach(w => {
        const { newFaces: nfs, modifiedFaces: mfs, vertexInfos } = extrudeWire(w, pullPushVec);
        newFaces.push(...nfs);
        modifiedFaces.push(...mfs);
        wireInfos.push(vertexInfos);
    });

    const shell = face.getShell()!;

    // 2.重新构造顶面
    const sur = face.getSurface() as Plane;
    const sameDir = face.getSameDirWithSurface();

    const top = sur.clone().translate(pullPushVec);
    face.setSurface(top);
    const vertexesArr = wireInfos.map(wi => wi.map(({ v, v_ }) => v_ ?? v));
    regenerateFaceByVertexes(face, vertexesArr);

    // 3.添加底面
    if (bExtrudeBehavior) {
        const bottom = new Face(sur, !sameDir);
        shell.addFace(bottom);
        const vArr = wireInfos.map(wi => wi.map(({ v }) => v));
        regenerateFaceByVertexes(bottom, vArr);
        newFaces.push(bottom);
    }

    addShellModifyInfo(result.modifiedShellsMap!, shell, newFaces, undefined, modifiedFaces);
    return result;
}