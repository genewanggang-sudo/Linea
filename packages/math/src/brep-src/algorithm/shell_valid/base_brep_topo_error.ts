import { Curve2, alg, GeoElement } from '../../..';
import { TopoObject } from '../../brep/topo_object';
import { Face } from '../../brep/face';
import { Shell } from '../../brep/shell';
import { Wire } from '../../brep/wire';
import { Coedge3d } from '../../brep/coedge3d';
import { Edge } from '../../brep/edge';
import { Vertex } from '../../brep/vertex';



export enum EN_BREP_INVALID_TYPE {
    NULL,
    SHELL_VERTEX_SIZE_ERROR,
    SHELL_EDGE_SIZE_ERROR,
    SHELL_EDGE_ERROR,
    SHELL_VERTEX_ERROR,
    FACE_PARENT_ERROR,
    FACE_NO_WIRE_ERROR,
    FACE_NO_SURFACE_ERROR,
    WIRE_PARENT_ERROR,
    WIRE_NO_COEDGE_ERROR,
    COEDGE_PARENT_ERROR,
    COEDGE_CONNECT_ERROR,
    COEDGE_EDGE_ERROR,
    COEDGE_PCURVE_ERROR,
    EDGE_PARENT_ERROR,
    CURVE_NULL_ERROR,
    CURVE_VERTEX_ERROR,
    VERTEX_PARENT_ERROR,
    VERTEX_EDGE_ERROR,
}

export class BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: TopoObject) {
        //
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.NULL;
    }

    public canFix() {
        return true;
    }

    public fix() {
        //
    }

    public message(): string {
        let msg = `${this.constructor.name} - `;

        for (const key of Object.keys(this)) {
            const v = (this as any)[key];
            if (v instanceof Shell) {
                // msg += `${v.constructor.name} `;
                // msg += `F${v.getFaces().length} E${v.getEdges().length} V${v.getVertexs().length}; `;
            } else if (v instanceof TopoObject) {
                let extraInfo = '';
                if (v instanceof Face) {
                    extraInfo = v.getSurface().constructor.name;
                } else if (v instanceof Edge) {
                    extraInfo = v.getCurve().constructor.name;
                } else if (v instanceof Vertex) {
                    extraInfo = JSON.stringify(v.getPoint().data.map(_ => Math.round(_ * 100) / 100));
                } else if (v instanceof Coedge3d) {
                    extraInfo = `F_${v.getFace()?.getDebugTag()} E_${v.getEdge()?.getDebugTag()}`;
                } else if (v instanceof Wire) {
                    extraInfo = `F_${v.getFace()?.getDebugTag()}`;
                }
                msg += `${v.constructor.name} ${v.getDebugTag()} ${extraInfo}; `;
            } else if (v instanceof GeoElement) {
                msg += `${JSON.stringify(v.dump())}; `;
            }
        }
        return msg;
    }

    public toString(): string {
        return this.message();
    }
}

export class BRepShellEdgeSizeError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Shell) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.SHELL_EDGE_SIZE_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepShellEdgeError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Shell, protected _edge: Edge) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.SHELL_EDGE_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepShellVertexSizeError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Shell) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.SHELL_VERTEX_SIZE_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepShellVertexError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Shell, protected _vertex: Vertex) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.SHELL_VERTEX_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepFaceParentError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Face) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.FACE_PARENT_ERROR;
    }

    public fix() {
        this._topoObj.setParent(this._shell);
    }
}

export class BRepEmptyFaceError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Face) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.FACE_NO_WIRE_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepFaceNoSurfaceError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Face) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.FACE_NO_SURFACE_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepWireParentError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Wire, private _face: Face) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.WIRE_PARENT_ERROR;
    }

    public fix() {
        this._topoObj.setParent(this._face);
    }
}

export class BRepEmptyWireError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Wire) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.WIRE_NO_COEDGE_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepCoedgeParentError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Coedge3d, private _wire: Wire) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.COEDGE_PARENT_ERROR;
    }

    public fix() {
        this._topoObj.setParent(this._wire);
    }
}

export class BRepCoedgePCurveError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Coedge3d, protected _pCurve: Curve2) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.COEDGE_PCURVE_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepCoedgeNotConnectedError extends BaseBRepTopoError {
    constructor(
        protected _shell: Shell,
        protected _topoObj: Wire,
        protected _curCoedge: Coedge3d,
        protected _nxtCoedge: Coedge3d,
    ) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.COEDGE_CONNECT_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepCoedgeEdgeError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Coedge3d, protected _edge: Edge) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.COEDGE_EDGE_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepEdgeParentError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Edge) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.EDGE_PARENT_ERROR;
    }

    public fix() {
        this._topoObj.setParent(this._shell);
    }
}

export class BRepCurveNullError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Edge) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.CURVE_NULL_ERROR;
    }

    public canFix() {
        return (
            this._topoObj.getFaces().length === 2 && !!this._topoObj.getStartVertex() && !!this._topoObj.getEndVertex()
        );
    }

    public fix() {
        const faces = this._topoObj.getFaces().filter(_ => _);
        if (faces.length < 2) return;
        const stPt = this._topoObj.getStartVertex().getPoint();
        const edPt = this._topoObj.getEndVertex().getPoint();
        const crv = alg.X.surfacesNearPoint(
            faces[0].getSurface(),
            faces[1].getSurface(),
            stPt,
            edPt.subtracted(stPt),
        );
        if (!crv) return;
        const p1 = crv.getParamAt(stPt);
        const p2 = crv.getParamAt(edPt);
        if (p1 < p2) {
            crv.setRange(p1, p2);
        } else {
            crv.setRange(p2, p1);
            crv.reverse();
        }
        this._topoObj.setCurve(crv);
    }
}

export class BRepCurveVertexError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Edge, protected _vertex: Vertex) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.CURVE_VERTEX_ERROR;
    }

    public canFix() {
        return false;
    }
}

export class BRepVertexParentError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Vertex) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.VERTEX_PARENT_ERROR;
    }

    public fix() {
        this._topoObj.setParent(this._shell);
    }
}

export class BRepVertexEdgeError extends BaseBRepTopoError {
    constructor(protected _shell: Shell, protected _topoObj: Vertex, protected _edge: Edge) {
        super(_shell, _topoObj);
    }

    public getType(): EN_BREP_INVALID_TYPE {
        return EN_BREP_INVALID_TYPE.VERTEX_EDGE_ERROR;
    }

    public canFix() {
        return false;
    }
}