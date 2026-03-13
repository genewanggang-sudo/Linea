import { Edge } from '../brep/edge';
import { Shell } from '../brep/shell';
import { ContinuousEdge } from './continuous_edge';
import { Face } from '../brep/face';
import { ContinuousFace } from './continuous_face';
import { Wire } from '../brep/wire';
import { Curve3 } from '../../geometry/curve3d';
import { Matrix4 } from '../../base/matrix4';



const CE_ID = '$CE_ID';
const CE_PREFIX = '$CE_';

export class ContinuousUtil {
    /**
     * 获取可交互的边（一个边、多个边组成的连续边）
     */
    public static getAllInteractiveEdges(shell: { getEdges(): Edge[] }): {
        edges: Set<Edge>;
        contEdges: Set<ContinuousEdge>;
    } {
        const shellEdges = shell.getEdges();
        const commonEdges = shellEdges.filter(e => !this.isValidSmoothEdge(e));

        const edges: Set<Edge> = new Set();
        const contEdges: Set<ContinuousEdge> = new Set();
        const grouped = new Set<Edge>();
        for (const edge of commonEdges) {
            if (grouped.has(edge)) {
                continue;
            }

            const group = this._getContinuousEdges(edge);
            if (!group) {
                edges.add(edge);
            } else {
                contEdges.add(group);
                group.getEdges().forEach(e => grouped.add(e));
            }
        }
        return {
            edges,
            contEdges,
        };
    }

    /**
     * 从环中获取三维曲线(包含smoothpoly)
     * @param wire
     */
    public static getSmoothCurvesFromWire(wire: Wire): Curve3[] {
        const edgeSet = new Set<Edge>();
        wire.getCoedge3ds().forEach(co => edgeSet.add(co.getEdge()!));
        const obj = {
            getEdges: () => {
                return Array.from(edgeSet);
            },
        };
        const interactEdges = this.getAllInteractiveEdges(obj);

        const curves: Curve3[] = [];
        const visitContEdgeSet = new Set<ContinuousEdge>();
        for (const coedge of wire.getCoedge3ds()) {
            const edge = coedge.getEdge()!;
            if (interactEdges.edges.has(edge)) {
                curves.push(coedge.getCurve());
                continue;
            }
            for (const contEdge of interactEdges.contEdges) {
                if (visitContEdgeSet.has(contEdge)) {
                    continue;
                }
                const index = contEdge.getEdges().indexOf(edge);
                if (index > -1) {
                    const smoothPoly = contEdge.getSmoothPoly();
                    if (smoothPoly) {
                        curves.push(
                            contEdge.getFlags()[index] === coedge.getSameDirWithEdge()
                                ? smoothPoly
                                : smoothPoly.reverse(),
                        );
                    }
                    visitContEdgeSet.add(contEdge);
                    break;
                }
            }
        }
        return curves;
    }

    /**
     * 是有效的平滑边
     * @param edge
     */
    public static isValidSmoothEdge(edge: Edge) {
        if (!edge.getSmooth()) {
            return false;
        }

        let adoptedCount = 0;
        for (const coedge of edge.getCoedge3ds()) {
            if (coedge.getWire() && coedge.getFace()) {
                adoptedCount += 1;
            }
        }
        return adoptedCount === 2;
    }

    /**
     * 获取可交互的面（一个面、多个面组成的连续面）
     */
    public static getAllInteractiveFaces(shell: { getEdges(): ReadonlyArray<Edge>; getFaces(): ReadonlyArray<Face> }): {
        faces: Set<Face>;
        contFaces: Set<ContinuousFace>;
    } {
        const edges = shell.getEdges();
        const softEdges = edges.filter(e => this.isValidSmoothEdge(e));

        const candidateFaces = new Set<Face>();
        for (const edge of softEdges) {
            edge.getFaces()
                .filter(f => f)
                .forEach(f => candidateFaces.add(f));
        }

        const faces: Set<Face> = new Set();
        const contFaces: Set<ContinuousFace> = new Set();
        const grouped = new Set<Face>();
        for (const face of candidateFaces) {
            if (grouped.has(face)) {
                continue;
            }

            const group = this._getContinuousFaces(face);
            if (!group) {
                continue;
            }

            contFaces.add(group);
            group.getFaces().forEach(f => grouped.add(f));
        }

        for (const face of shell.getFaces()) {
            if (!grouped.has(face)) {
                faces.add(face);
            }
        }
        return {
            faces,
            contFaces,
        };
    }

    public static addContinuousEdgeInfo(edges: Edge[], getSmoothCurve: (e: Edge) => Curve3 | undefined) {
        const contInfoMap = new Map<Curve3, string>();

        for (const edge of edges) {
            const smooth = getSmoothCurve(edge);
            if (!smooth) {
                continue;
            }
            let id = contInfoMap.get(smooth);
            if (!id) {
                const shell = edge.getParent() as Shell;
                if (!shell) {
                    continue;
                }
                id = this._addContinuousEdge(shell, smooth);
                contInfoMap.set(smooth, id);
            }
            this._setContinuousEdgeId(edge, id);
        }
    }

    public static cloneContinuousEdgeInfo(
        sourceEdges: IterableIterator<Edge> | Edge[],
        getCloned: (e: Edge) => Edge | undefined,
        matrix?: Matrix4,
    ) {
        const classifyInfoMap = this._groupEdgesByContinuousEdgeId(sourceEdges);
        for (const [key, val] of classifyInfoMap) {
            const shell = val[0].getParent() as Shell;
            const targetShell = getCloned(val[0])?.getParent() as Shell;
            if (!shell || !shell.getData() || !targetShell) {
                continue;
            }

            let curve = shell.getData()![key] as Curve3 | undefined;
            if (!curve) {
                continue;
            }

            curve = curve.clone();
            if (matrix) {
                curve.transform(matrix);
            }

            const newId = this._addContinuousEdge(targetShell, curve);
            val.forEach(e => {
                const targetE = getCloned(e);
                if (targetE) {
                    this._setContinuousEdgeId(targetE, newId);
                }
            });
        }
    }

    public static transformContinuousEdgeInfo(edges: Edge[], matrix: Matrix4) {
        const classifyInfoMap = this._groupEdgesByContinuousEdgeId(edges);
        for (const [key, val] of classifyInfoMap) {
            const shell = val[0].getParent() as Shell;
            if (!shell || !shell.getData()) {
                continue;
            }

            const curve = shell.getData()![key] as Curve3 | undefined;
            if (!curve) {
                continue;
            }

            shell.getData()![key] = curve.clone().transform(matrix);
        }
    }

    public static transferContinuousEdgeInfo(
        edges: Edge[],
        oldShell: Shell,
        newShell: Shell,
        removeOldInfo: boolean = true,
    ) {
        if (oldShell === newShell || !oldShell.getData()) {
            return;
        }

        // 按照连续边分类
        const classifyInfoMap = this._groupEdgesByContinuousEdgeId(edges);
        for (const [key, val] of classifyInfoMap) {
            const curve = oldShell.getData()![key] as Curve3 | undefined;
            if (!curve) {
                continue;
            }

            const newId = this._addContinuousEdge(newShell, curve.clone());
            val.forEach(e => this._setContinuousEdgeId(e, newId));

            // 从旧的shell中删除
            if (removeOldInfo) {
                this._removeContinuousEdgeInfo(oldShell, key);
            }
        }
    }

    public static removeContinuousEdgeInfo(edges: IterableIterator<Edge> | Edge[]) {
        const classifyInfoMap = this._groupEdgesByContinuousEdgeId(edges);
        for (const [key, val] of classifyInfoMap) {
            const shell = val[0].getParent() as Shell;
            if (!shell || !shell.getData()) {
                continue;
            }

            this._removeContinuousEdgeInfo(shell, key);
            val.forEach(e => this._removeContinuousEdgeId(e));
        }
    }

    public static removeUnusedContinuousEdgeInfo(shell: Shell) {
        const shellData = shell.getData();
        if (!shellData) {
            return;
        }
        const useCountMap = new Map<string, number>();
        for (const key in shellData) {
            if (key.startsWith(CE_PREFIX)) {
                useCountMap.set(key, 0);
            }
        }
        if (useCountMap.size <= 0) {
            return;
        }

        const edges = shell.getEdges();
        for (const edge of edges) {
            const key = this._getContinuousEdgeId(edge);
            if (key) {
                useCountMap.set(key, 1);
            }
        }

        for (const [key, val] of useCountMap) {
            if (val === 0) {
                delete shellData[key];
            }
        }
    }

    public static getContinuousEdgeInfo(edge: Edge): Curve3 | undefined {
        const id = this._getContinuousEdgeId(edge);
        const shell = edge.getParent() as Shell;
        if (!id || !shell || !shell.getData()) {
            return undefined;
        }
        return shell.getData()![id];
    }

    private static _addContinuousEdge(shell: Shell, curve: Curve3): string {
        const id = this._createContinuousEdgeInfoId(shell);

        let data = shell.getData();
        if (!data) {
            data = {};
            shell.setData(data);
        }
        data[id] = curve;

        return id;
    }

    private static _createContinuousEdgeInfoId(shell: Shell): string {
        const data = shell.getData();
        if (!data) {
            return `${CE_PREFIX}0`;
        }
        let max: number = -1;
        for (const key in data) {
            if (!key.startsWith(CE_PREFIX)) {
                continue;
            }
            // eslint-disable-next-line radix
            const num = parseInt(key.slice(CE_PREFIX.length), undefined);
            if (!Number.isNaN(num) && num > max) {
                max = num;
            }
        }
        return CE_PREFIX + (max + 1).toString();
    }

    private static _removeContinuousEdgeInfo(shell: Shell, id: string) {
        const data = shell.getData();
        if (!data) {
            return;
        }
        delete data[id];
    }

    private static _setContinuousEdgeId(edge: Edge, id: string) {
        let data = edge.getData();
        if (!data) {
            data = {};
            edge.setData(data);
        }
        data[CE_ID] = id;
    }

    private static _getContinuousEdgeId(edge: Edge): string | undefined {
        const data = edge.getData();
        if (!data) {
            return undefined;
        }
        return data[CE_ID];
    }

    private static _removeContinuousEdgeId(edge: Edge) {
        const data = edge.getData();
        if (data && data[CE_ID]) {
            delete data[CE_ID];
        }
    }

    private static _groupEdgesByContinuousEdgeId(edges: IterableIterator<Edge> | Edge[]): Map<string, Edge[]> {
        // 按照连续边分类
        const classifyInfoMap = new Map<string, Edge[]>();
        for (const edge of edges) {
            const ceId = this._getContinuousEdgeId(edge);
            if (!ceId) {
                continue;
            }
            let group = classifyInfoMap.get(ceId);
            if (!group) {
                group = [];
                classifyInfoMap.set(ceId, group);
            }
            group.push(edge);
        }
        return classifyInfoMap;
    }

    private static _getNextContinuousEdge(edge: Edge, next: boolean): Edge | undefined {
        const v = next ? edge.getEndVertex() : edge.getStartVertex()!;
        if (!v.getSmooth()) {
            return undefined;
        }

        const edges = v.getEdges().filter(it => it !== edge && !it.getSmooth());
        if (edges.length !== 1) {
            return undefined;
        }
        return edges[0];
    }

    private static _getConnectedContinuousEdges(
        edge: Edge,
        next: boolean,
        visited: Set<Edge>,
    ): { edges: Edge[]; flags: boolean[] } {
        const result: Edge[] = [];
        const resultFlags: boolean[] = [];

        let curEdge: Edge | undefined = edge;
        let nextFlag = next;
        do {
            const nextEdge = this._getNextContinuousEdge(curEdge, nextFlag);
            if (!nextEdge || visited.has(nextEdge) || nextEdge === edge) {
                break;
            }

            visited.add(nextEdge);
            const v = nextFlag ? curEdge.getEndVertex()! : curEdge.getStartVertex()!;
            nextFlag = v === nextEdge.getStartVertex();
            result.push(nextEdge);
            resultFlags.push(nextFlag);
            curEdge = nextEdge;
        } while (curEdge);

        return { edges: result, flags: resultFlags };
    }

    private static _getContinuousEdges(edge: Edge): ContinuousEdge | undefined {
        const visited = new Set<Edge>();
        const nextEdges = this._getConnectedContinuousEdges(edge, true, visited);
        const prevEdges = this._getConnectedContinuousEdges(edge, false, visited);
        if (nextEdges.edges.length === 0 && prevEdges.edges.length === 0) {
            return undefined;
        }

        prevEdges.edges.reverse();
        prevEdges.flags = prevEdges.flags.map(it => !it);
        prevEdges.edges.push(edge);
        prevEdges.flags.push(true);
        const edges = prevEdges.edges.concat(nextEdges.edges);
        const flags = prevEdges.flags.concat(nextEdges.flags);
        return new ContinuousEdge(edges, flags, this.getContinuousEdgeInfo(edge));
    }

    private static _getContinuousFaces(face: Face): ContinuousFace | undefined {
        if (!this._hasSmoothEdgeInFace(face)) {
            return undefined;
        }

        let currentFaces: Face[] = [face];
        const visitedFaces = new Set<Face>(currentFaces);
        const visitedEdges = new Set<Edge>();
        while (currentFaces.length > 0) {
            const nextFaces: Face[] = [];
            for (let j = 0, jLen = currentFaces.length; j < jLen; j++) {
                const curFace = currentFaces[j];
                const tmpNextFaces = this._getNextContinuousFaces(curFace, visitedFaces, visitedEdges);
                nextFaces.push(...tmpNextFaces);
            }
            currentFaces = nextFaces;
        }
        if (visitedFaces.size === 0) {
            return undefined;
        }
        const faces = Array.from(visitedFaces);
        const group = new ContinuousFace(faces);
        return group;
    }

    private static _hasSmoothEdgeInFace(face: Face): boolean {
        return face.getEdges().some(e => this.isValidSmoothEdge(e));
    }

    private static _getNextContinuousFaces(face: Face, visited: Set<Face>, visitedEdges: Set<Edge>): Face[] {
        const result: Face[] = [];
        const edges = face.getEdges();
        for (let i = 0, iLen = edges.length; i < iLen; i++) {
            const edge = edges[i];
            if (visitedEdges.has(edge)) {
                continue;
            }
            visitedEdges.add(edge);
            const nextFace = this._getNextContinuousFace(face, edge);
            if (nextFace && !visited.has(nextFace)) {
                visited.add(nextFace);
                result.push(nextFace);
            }
        }
        return result;
    }

    private static _getNextContinuousFace(face: Face, edge: Edge): Face | undefined {
        if (!edge.getSmooth()) {
            return undefined;
        }
        const faces = edge.getFaces().filter(f => f && f !== face);
        return faces.length === 1 ? faces[0] : undefined;
    }
}