import { MathError, MathErrorType, Tol } from '../../..';
import { Edge } from '../../brep/edge';
import { Face } from '../../brep/face';
import type { Shell } from '../../brep/shell';
import { Vertex } from '../../brep/vertex';
import { Wire } from '../../brep/wire';
import {
    BaseBRepTopoError,
    BRepCoedgeEdgeError,
    BRepCoedgeNotConnectedError,
    BRepCoedgeParentError,
    BRepCoedgePCurveError,
    BRepCurveNullError,
    BRepCurveVertexError,
    BRepEdgeParentError,
    BRepEmptyFaceError,
    BRepEmptyWireError,
    BRepFaceNoSurfaceError,
    BRepFaceParentError,
    BRepShellEdgeError,
    BRepShellEdgeSizeError,
    BRepShellVertexError,
    BRepShellVertexSizeError,
    BRepVertexEdgeError,
    BRepVertexParentError,
    BRepWireParentError,
} from './base_brep_topo_error';



// 诊断拓扑关系的合法性
export class DiagnoseShell {
    public static execute(shell: Shell): BaseBRepTopoError[] {
        const result: BaseBRepTopoError[] = [];
        // 遍历topo关系
        const edges = new Set<Edge>();
        const vertices = new Set<Vertex>();
        for (const f of shell.getFaces()) {
            result.push(...this._validateFace(shell, f));
            f.getEdges().forEach(e => {
                edges.add(e);
                vertices.add(e.getStartVertex());
                vertices.add(e.getEndVertex());
            });
        }

        // 校验边
        if (edges.size !== shell.getEdges().length) {
            result.push(new BRepShellEdgeSizeError(shell, shell));
        }
        edges.forEach(e => {
            if (!shell.getEdgeByTag(e.tag)) {
                result.push(new BRepShellEdgeError(shell, shell, e));
            }
            result.push(...this._validateEdge(shell, e));
        });

        // 校验点
        if (vertices.size !== shell.getVertexs().length) {
            result.push(new BRepShellVertexSizeError(shell, shell));
        }
        vertices.forEach(it => {
            if (!shell.getVertexByTag(it.tag)) {
                result.push(new BRepShellVertexError(shell, shell, it));
            }
            result.push(...this._validateVertex(shell, it));
        });
        return result;
    }

    /**
     * 校验拓扑合法性，失败则抛异常
     * @param shell
     */
    public static validate(shell: Shell) {
        // if (process.env.NODE_ENV !== 'development') {
        //     return;
        // }
        const rets = this.execute(shell);
        const msgs = rets.map(_ => _.message());
        MathError.assert(rets.length === 0, '拓扑合法性检验失败', MathErrorType.Geometry, ...msgs);
    }

    private static _validateFace(shell: Shell, face: Face): BaseBRepTopoError[] {
        const result: BaseBRepTopoError[] = [];
        if (face.getParent() !== shell) {
            result.push(new BRepFaceParentError(shell, face));
        }
        if (!face.getSurface()) {
            result.push(new BRepFaceNoSurfaceError(shell, face));
        }

        const wires = face.getWires();
        if (!wires.length) {
            result.push(new BRepEmptyFaceError(shell, face));
        }
        wires.forEach(w => result.push(...this._validateWire(shell, face, w)));

        return result;
    }

    private static _validateWire(shell: Shell, face: Face, wire: Wire): BaseBRepTopoError[] {
        const result: BaseBRepTopoError[] = [];
        if (wire.getParent() !== face) {
            result.push(new BRepWireParentError(shell, wire, face));
        }

        const coedges = wire.getCoedge3ds();
        if (!coedges.length) {
            result.push(new BRepEmptyWireError(shell, wire));
        }

        for (let i = 0; i < coedges.length; i++) {
            const j = (i + 1) % coedges.length;
            const cur = coedges[i];
            const next = coedges[j];
            if (cur.getWire() !== wire) {
                result.push(new BRepCoedgeParentError(shell, cur, wire));
            }
            if (cur.getEndVertex() !== next.getStartVertex()) {
                result.push(new BRepCoedgeNotConnectedError(shell, wire, cur, next));
            }

            const edge = cur.getEdge()!;
            if (!edge || edge.getCoedge3ds().filter(c => c === cur).length !== 1) {
                result.push(new BRepCoedgeEdgeError(shell, cur, edge));
            }

            const pCrv = cur.getPCurve();
            if (pCrv) {
                const srf = face.getSurface();
                const stPt = srf.getPtAt(pCrv.getStartPt());
                const edPt = srf.getPtAt(pCrv.getEndPt());
                if (!stPt.equals(cur.getStartVertex().getPoint()) || !edPt.equals(cur.getEndVertex().getPoint())) {
                    result.push(new BRepCoedgePCurveError(shell, cur, pCrv));
                }
            }
        }

        return result;
    }

    private static _validateEdge(shell: Shell, edge: Edge): BaseBRepTopoError[] {
        const validateTol = shell.tolerance ? shell.tolerance + Tol.EDGE_LENGTH_EPS : Tol.EDGE_LENGTH_EPS;
        const result: BaseBRepTopoError[] = [];
        if (edge.getParent() !== shell) {
            result.push(new BRepEdgeParentError(shell, edge));
        }
        const va = edge.getStartVertex();
        if (va.getEdges().filter(vEdge => vEdge === edge).length !== 1) {
            result.push(new BRepVertexEdgeError(shell, va, edge));
        }
        const vb = edge.getEndVertex();
        if (vb.getEdges().filter(vEdge => vEdge === edge).length !== 1) {
            result.push(new BRepVertexEdgeError(shell, vb, edge));
        }
        const curve = edge.getCurve();
        if (!curve) {
            result.push(new BRepCurveNullError(shell, edge));
        } else {
            if (!curve.getStartPt().equals(va.getPoint(), validateTol)) {
                result.push(new BRepCurveVertexError(shell, edge, va));
            }
            if (!curve.getEndPt().equals(vb.getPoint(), validateTol)) {
                result.push(new BRepCurveVertexError(shell, edge, vb));
            }
        }
        return result;
    }

    private static _validateVertex(shell: Shell, vertex: Vertex): BaseBRepTopoError[] {
        const result: BaseBRepTopoError[] = [];
        if (vertex.getParent() !== shell) {
            result.push(new BRepVertexParentError(shell, vertex));
        }

        return result;
    }
}