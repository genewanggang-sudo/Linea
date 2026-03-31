import * as numeric from 'numeric';
import { Ln3, Vec3, Arc3, EN_GEO_TYPE, Util, Plane } from '../../../..';
import { Edge } from '../../../brep/edge';
import { Coedge3d } from '../../../brep/coedge3d';
import { Shell } from '../../../brep/shell';
import { Vertex } from '../../../brep/vertex';
import { Face } from '../../../brep/face';
import ShellModelingBase from '../shell_modeling_base';
import { IShellModelingResult, addShellModifyInfo } from '../shell_modeling_result';
import { splitEdgeByVertex } from '../operator/split_edge';
import { ContinuousUtil } from '../../../continuous';

const errorRounding2DNotAdjacent = '倒圆角的边不相邻';
const errorRounding2DNotLine = '倒圆角的边不是直线边';
const errorRounding2DNoFace = '倒圆角的边不共面';
const errorRounding2DNotCoplanar = '倒圆角边关联的面不在同一平面上';
const errorRounding2DColinear = '倒圆角的边共线';

/**
 * 相邻的两个edge倒圆角, errorCode: 1 success，-1 不相邻，不倒圆角, -2 不是直线，-3 edge不存在face，-4 edge相关联的face个数大于1
 * @param edge1 输入edge1
 * @param edge2 输入edge2
 * @param radius 输入倒圆角半径
 */
export class Rounding2D extends ShellModelingBase {
    // 第一条边
    private _edge1: Edge;

    // 第二条边
    private _edge2: Edge;

    // 倒圆角半径
    private _radius: number;

    // 是否使用连续边
    private _useSmooth: boolean;

    // 两条边的公共点
    private _commonV: Vertex;

    // 两条边的公共面
    private _commonF: Face[];

    constructor(edge1: Edge, edge2: Edge, radius: number, context: Shell[], useSmooth: boolean) {
        super(context);
        this._edge1 = edge1;
        this._edge2 = edge2;
        this._radius = radius;
        this._useSmooth = useSmooth;
    }

    protected _executeImpl(): IShellModelingResult {
        const errorStr = this._canRounding(this._edge1, this._edge2);
        if (errorStr) {
            return { errorStr };
        }
        const bStart1 = this._edge1.getStartVertex() === this._commonV;
        const bStart2 = this._edge2.getStartVertex() === this._commonV;

        const result: IShellModelingResult = { modifiedShellsMap: new Map() };
        // 计算切割点
        // 计算切割edge的长度
        const line1 = this._edge1.getCurve() as Ln3;
        const line2 = this._edge2.getCurve() as Ln3;
        let cosAngle = line1.getDirection().dot(line2.getDirection());
        if (bStart1 !== bStart2) {
            cosAngle = -cosAngle;
        }
        if (Util.isNearlyEqual(cosAngle, 1) || Util.isNearlyEqual(cosAngle, -1)) {
            return { errorStr: errorRounding2DColinear };
        }

        const tanHalfAngle = Math.sqrt((1 - cosAngle) / (1 + cosAngle));
        const roundLength = this._radius / tanHalfAngle;
        const edgeLength1 = this._edge1.getStartVertex().getPoint().distanceTo(this._edge1.getEndVertex().getPoint());
        const edgeLength2 = this._edge2.getStartVertex().getPoint().distanceTo(this._edge2.getEndVertex().getPoint());
        let realCutLength: number = roundLength;
        if (
            Util.isNearlyBiggerOrEqual(roundLength, edgeLength1) ||
            Util.isNearlyBiggerOrEqual(roundLength, edgeLength2)
        ) {
            realCutLength = Math.min(edgeLength1, edgeLength2);
        }

        let commonPt: Vec3 = this._commonV.getPoint();
        if (!line1.containsPt(commonPt) || !line2.containsPt(commonPt)) {
            // 重新计算交点,防止因为edge之间容差导致计算倒角的打断点误差而引起一系列误差问题
            const dir1: Vec3 = line1.getDirection();
            const dir2: Vec3 = line2.getDirection();
            const posVec: Vec3 = line2.getOrigin().subtracted(line1.getOrigin());
            const A = [
                [dir1.dot(dir1), -dir1.dot(dir2)],
                [dir2.dot(dir1), -dir2.dot(dir2)],
            ];
            const b = [dir1.dot(posVec), dir2.dot(posVec)];
            const t = numeric.solve(A, b);

            commonPt = line1.getPtAt(t[0]);
        }

        // 计算倒角点在直线上的参数para1和para2
        const t1 = line1.getParamAt(commonPt);
        const t2 = line2.getParamAt(commonPt);
        let para1: number;
        let para2: number;
        if (bStart1) {
            para1 = t1 + realCutLength;
        } else {
            para1 = t1 - realCutLength;
        }
        if (bStart2) {
            para2 = t2 + realCutLength;
        } else {
            para2 = t2 - realCutLength;
        }

        // 分割第一条边
        let newV1 = bStart1 ? this._edge1.getEndVertex() : this._edge1.getStartVertex();
        let newEdge1 = this._edge1;
        if (!line1.getRange().containsPtAtStartOrEnd(para1)) {
            newV1 = new Vertex(line1.getPtAt(para1));
            const tmpEdges = splitEdgeByVertex(this._edge1, newV1);
            newEdge1 = bStart1 ? tmpEdges[0] : tmpEdges[1];
        }

        // 分割第二条边
        let newV2 = bStart2 ? this._edge2.getEndVertex() : this._edge2.getStartVertex();
        let newEdge2 = this._edge2;
        if (!line2.getRange().containsPtAtStartOrEnd(para2)) {
            newV2 = new Vertex(line2.getPtAt(para2));
            const tmpEdges = splitEdgeByVertex(this._edge2, newV2);
            newEdge2 = bStart2 ? tmpEdges[0] : tmpEdges[1];
        }

        // 构造新的边数组
        const shell = this._edge1.getParent() as Shell;
        const newArc = this._calRoundingArc3d(line1, line2, newV1.getPoint(), newV2.getPoint());
        const newArcEdges: Edge[] = [];
        if (!this._useSmooth) {
            const tmpEdge = new Edge(newArc, newV1, newV2);
            newArcEdges.push(tmpEdge);
            shell.addEdge(tmpEdge);
        } else {
            const tmpPts = newArc.discreteBySpan();
            tmpPts.pop();
            tmpPts.shift();
            const tmpVs = tmpPts.map(pt => new Vertex(pt));
            tmpVs.forEach(v => {
                v.setSmooth(true);
                shell.addVertex(v);
            });
            tmpVs.push(newV2);
            tmpVs.unshift(newV1);
            for (let ii = 0; ii < tmpVs.length - 1; ii++) {
                const tmpEdge = new Edge(
                    new Ln3(tmpVs[ii].getPoint(), tmpVs[ii + 1].getPoint()),
                    tmpVs[ii],
                    tmpVs[ii + 1],
                );
                newArcEdges.push(tmpEdge);
                shell.addEdge(tmpEdge);
            }

            // 添加连续边信息
            ContinuousUtil.addContinuousEdgeInfo(newArcEdges, () => newArc);
        }

        // 修改共同的面，修改环
        const coedges1 = newEdge1.getCoedge3ds();
        const coedges2 = newEdge2.getCoedge3ds();
        const coedgePairs: { c1: Coedge3d; c2: Coedge3d; sameDir: boolean }[] = [];
        for (const c1 of coedges1) {
            const nxtC1 = c1.getNextCoedge()!;
            if (coedges2.indexOf(nxtC1) > -1) {
                coedgePairs.push({ c1, c2: nxtC1, sameDir: true });
                continue;
            }
            const preC1 = c1.getPrevCoedge()!;
            if (coedges2.indexOf(preC1) > -1) {
                coedgePairs.push({ c1, c2: preC1, sameDir: false });
                continue;
            }
        }
        for (const coedgePair of coedgePairs) {
            if (coedgePair.sameDir) {
                const tmpWire = coedgePair.c1.getWire()!;
                tmpWire.deleteCoedge3d(coedgePair.c2);
                const newCoedges = newArcEdges.map(e => new Coedge3d(e, true));
                tmpWire.replaceCoedge3d(coedgePair.c1.getIndexInWire(), newCoedges);
                newEdge1.deleteCoedge3d(coedgePair.c1);
                newEdge2.deleteCoedge3d(coedgePair.c2);
            } else {
                const tmpWire = coedgePair.c1.getWire()!;
                tmpWire.deleteCoedge3d(coedgePair.c1);
                const newCoedges = newArcEdges.map(e => new Coedge3d(e, false)).reverse();
                tmpWire.replaceCoedge3d(coedgePair.c2.getIndexInWire(), newCoedges);
                newEdge1.deleteCoedge3d(coedgePair.c1);
                newEdge2.deleteCoedge3d(coedgePair.c2);
            }
        }

        // 删除无用的拓扑
        if (!newEdge1.getCoedge3ds().length) {
            newEdge1.dispose();
            shell.deleteEdge(newEdge1);
        }
        if (!newEdge2.getCoedge3ds().length) {
            newEdge2.dispose();
            shell.deleteEdge(newEdge2);
        }
        if (!this._commonV.getEdges().length) {
            const s = (this._commonV.getParent() as Shell) || shell;
            s.deleteVertex(this._commonV);
        }

        // TODO... 可能发生重叠, 合并到场景中
        addShellModifyInfo(result.modifiedShellsMap!, shell, undefined, undefined, this._commonF);
        return result;
    }

    // 倒角的两条edge必须在同一个面，又因为同一个面外环与内环不能相交，因此倒圆角两条coedge一定是同在一个环里，且相邻。
    // 两条edge关联的面必须共平面，且两条边是相邻的
    private _canRounding(edge1: Edge, edge2: Edge): string | undefined {
        if (
            edge1.getCurve().getType() !== EN_GEO_TYPE.LN_3 ||
            edge2.getCurve().getType() !== EN_GEO_TYPE.LN_3
        ) {
            // 不是直线，不倒圆角
            return errorRounding2DNotLine;
        }

        const faces1 = edge1.getFaces();
        const faces2 = edge2.getFaces();
        if (
            !faces1.length ||
            edge1.getParent() === undefined ||
            !faces2.length ||
            edge2.getParent() === undefined ||
            edge1.getParent() !== edge2.getParent()
        ) {
            // edge不存在shell，不能倒角
            return errorRounding2DNoFace;
        }

        const vs1 = [edge1.getStartVertex(), edge1.getEndVertex()];
        const vs2 = [edge2.getStartVertex(), edge2.getEndVertex()];
        const commonV = vs1.filter(v => vs2.findIndex(it => it === v) > -1);
        const commonF = faces1.filter(f => faces2.findIndex(it => it === f) > -1);
        if (commonV.length !== 1 || !commonF.length) {
            // 不相邻，不倒圆角
            return errorRounding2DNotAdjacent;
        }

        const allSurfaces = [...faces1, ...faces2].map(f => f.getSurface());
        if (!allSurfaces.every(s => s.isPlane()) || !allSurfaces.every(s => (s).isCoplanar(allSurfaces[0]))) {
            // 不共平面
            return errorRounding2DNotCoplanar;
        }

        this._commonV = commonV[0];
        this._commonF = commonF;
        return undefined;
    }

    // 两直线法向交点为圆心
    private _calRoundingArc3d(line1: Ln3, line2: Ln3, startPt: Vec3, endPt: Vec3): Arc3 {
        const dir1: Vec3 = line1.getDirection();
        const dir2: Vec3 = line2.getDirection();
        const refNormal = dir1.cross(dir2);
        const newDir1 = refNormal.cross(dir1).normalize();
        const newDir2 = refNormal.cross(dir2).normalize();
        const newline1 = new Ln3(startPt, newDir1, [-10000, 10000]);
        const newline2 = new Ln3(endPt, newDir2, [-10000, 10000]);
        const posVec: Vec3 = newline2.getOrigin().subtracted(newline1.getOrigin());
        const A = [
            [newDir1.dot(newDir1), -newDir1.dot(newDir2)],
            [newDir2.dot(newDir1), -newDir2.dot(newDir2)],
        ];
        const b = [newDir1.dot(posVec), newDir2.dot(posVec)];
        const t = numeric.solve(A, b);

        const center = newline1.getPtAt(t[0]);
        const radius = center.distanceTo(startPt);
        const normal = center.subtracted(startPt).cross(center.subtracted(endPt));
        return Arc3.makeArcByStartEndPoints(center, radius, normal, startPt, endPt, true);
    }
}
