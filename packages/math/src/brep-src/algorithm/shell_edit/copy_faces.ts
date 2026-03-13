import { Matrix4 } from '../../..';
import { Shell } from '../../brep/shell';
import { Face } from '../../brep/face';
import { Wire } from '../../brep/wire';
import { Coedge3d } from '../../brep/coedge3d';
import { Vertex } from '../../brep/vertex';
import { Edge } from '../../brep/edge';
import { BrepUtil } from '../../util/util';
import { addEvolutionInfo, IShellModelingResult } from './shell_modeling_result';
import { ContinuousUtil } from '../../continuous';
import ShellModelingBase from './shell_modeling_base';



export default class CopyFaces extends ShellModelingBase {
    private _faces: Face[];

    private _reuseTag: boolean | undefined;

    private _matrix: Matrix4 | undefined;

    constructor(faces: Face[], reuseTag?: boolean, matrix?: Matrix4, context: Shell[] = []) {
        super(context);
        this._faces = faces;
        this._reuseTag = reuseTag;
        this._matrix = matrix;
    }

    /**
     * 复制面到新的位置，深拷贝
     * @param this._faces source face
     * @param this._reuseTag
     * @param this._matrix
     * @returns origin face --> new face map
     */
    protected _executeImpl(): IShellModelingResult {
        const shellFacesMap = new Map<Shell, Face[]>();
        for (const face of this._faces) {
            const shell = face.getShell();
            if (!shell) {
                continue;
            }

            if (shellFacesMap.has(shell)) {
                shellFacesMap.get(shell)!.push(face);
            } else {
                shellFacesMap.set(shell, [face]);
            }
        }

        // 分不同的shell, 依次进行处理
        const result: IShellModelingResult = { addShells: [], evolutionMap: new Map() };
        for (const [shell, faceGroup] of shellFacesMap) {
            // clone
            const copyFacesMap = new Map();
            const newShell = this._cloneFacesByShell(shell, faceGroup, this._reuseTag, copyFacesMap);

            // transform
            if (this._matrix) {
                newShell.transform(this._matrix);
                // 变换连续边信息
                ContinuousUtil.transformContinuousEdgeInfo(newShell.getEdges(), this._matrix);
            }
            for (const [key, value] of copyFacesMap) {
                addEvolutionInfo(result, key, value);
            }
            result.addShells!.push(newShell);
        }

        return result;
    }

    private _cloneFacesByShell(shell: Shell, faces: Face[], reuseTag?: boolean, faceMap?: Map<Face, Face>) {
        const MY = 'TOPO_CLONE';

        // eslint-disable-next-line no-shadow
        function cloneCoedge(coedge: Coedge3d, reuseTag?: boolean): Coedge3d {
            const newEdge = coedge.getEdge()!.userData[MY];
            const newCoedge = new Coedge3d(newEdge, coedge.getSameDirWithEdge());
            newCoedge.setPCurve(coedge.getPCurve()?.clone());
            if (reuseTag) {
                newCoedge.tag = coedge.tag;
            }
            return newCoedge;
        }

        // eslint-disable-next-line no-shadow
        function cloneWire(wire: Wire, reuseTag?: boolean): Wire {
            const newCoedges = wire.getCoedge3ds().map(coedge => cloneCoedge(coedge, reuseTag));
            const newWire = new Wire(newCoedges);
            if (reuseTag) {
                newWire.tag = wire.tag;
            }
            return newWire;
        }

        // eslint-disable-next-line no-shadow
        function cloneFace(face: Face, reuseTag?: boolean): Face {
            const newFace = new Face(face.getSurface().clone(), face.getSameDirWithSurface());
            newFace.setData(BrepUtil.loadMapObj(BrepUtil.dumpMapObj(face.getData())));
            if (reuseTag) {
                newFace.tag = face.tag;
            }

            for (const wire of face.getWires()) {
                const newWire = cloneWire(wire, reuseTag);
                newFace.addWire(newWire);
            }
            return newFace;
        }

        function cloneVertices(vertices: Vertex[]): Vertex[] {
            const newVs: Vertex[] = [];
            for (let i = 0, iLen = vertices.length; i < iLen; i++) {
                const vertex = vertices[i];
                const newVertex = new Vertex(vertex.getPoint());
                newVertex.setFlags(vertex.getFlags());
                newVertex.setData(BrepUtil.loadMapObj(BrepUtil.dumpMapObj(vertex.getData())));

                vertex.userData = vertex.userData || {};
                vertex.userData[MY] = newVertex;
                newVs.push(newVertex);
            }
            return newVs;
        }

        // eslint-disable-next-line no-shadow
        function cloneEdges(edges: Edge[], reuseTag?: boolean): Edge[] {
            const newEs: Edge[] = [];
            for (let i = 0, iLen = edges.length; i < iLen; i++) {
                const edge = edges[i];
                const vertexA = edge.getStartVertex()!;
                const vertexB = edge.getEndVertex()!;
                const newVertexA = vertexA.userData[MY];
                const newVertexB = vertexB.userData[MY];
                const newEdge = new Edge(edge.getCurve().clone(), newVertexA, newVertexB);
                newEdge.setFlags(edge.getFlags());
                newEdge.setData(BrepUtil.loadMapObj(BrepUtil.dumpMapObj(edge.getData())));

                edge.userData = edge.userData || {};
                edge.userData[MY] = newEdge;
                if (reuseTag) {
                    newEdge.tag = edge.tag;
                }
                newEs.push(newEdge);
            }
            return newEs;
        }

        const newShell = new Shell();
        if (reuseTag) {
            newShell.tag = shell.tag;
        }
        if (!faces.length) {
            return newShell;
        }

        const oldVertexSet = new Set<Vertex>();
        const oldEdgeSet = new Set<Edge>();
        faces.forEach(f => {
            f.getEdges().forEach(e => oldEdgeSet.add(e));
            f.getVertexes().forEach(v => oldVertexSet.add(v));
        });

        // 复制所有的点
        const oldVertice = Array.from(oldVertexSet);
        cloneVertices(oldVertice).forEach(v => newShell.addVertex(v));

        // 复制所有的边
        const oldEdges = Array.from(oldEdgeSet);
        cloneEdges(oldEdges, reuseTag).forEach(e => newShell.addEdge(e));

        // 添加连续边信息
        ContinuousUtil.cloneContinuousEdgeInfo(oldEdges, (e: Edge) => e.userData[MY] as Edge | undefined);

        // 复制所有的面
        for (const face of faces) {
            const newFace = cloneFace(face, reuseTag);
            newShell.addFace(newFace);
            if (faceMap) {
                faceMap.set(face, newFace);
            }
        }

        for (const oldVertex of oldVertice) {
            oldVertex.userData[MY] = undefined;
        }

        for (const oldEdge of oldEdges) {
            oldEdge.userData[MY] = undefined;
        }

        return newShell;
    }
}