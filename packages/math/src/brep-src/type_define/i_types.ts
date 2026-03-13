import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { types } from '../../type_define/i_types';



// --------------brep----------------
export interface IDBTopoObject extends types.IDBLibGeo {
    tag: string;
    flag?: number;
    data?: { [key: string]: any };
}

export interface IDBVertex extends IDBTopoObject {
    type: EN_GEO_TYPE.BREP_VERTEX;
    p: types.IXYZArr;
}

export interface IDBEdge extends IDBTopoObject {
    type: EN_GEO_TYPE.BREP_EDGE;
    c: types.IDBCurve3d | undefined;
    sVTag: string;
    eVTag: string;
}

export interface IDBCoedge3d extends IDBTopoObject {
    type: EN_GEO_TYPE.BREP_COEDGE;
    eTag: string;
    dir: number;
    pCrv?: types.IDBCurve2d;
}

export interface IDBWire extends IDBTopoObject {
    type: EN_GEO_TYPE.BREP_WIRE;
    ces: IDBCoedge3d[];
}

export interface IDBFace extends IDBTopoObject {
    type: EN_GEO_TYPE.BREP_FACE;
    dir: number;
    s: types.IDBSurface;
    ws: IDBWire[];
}

export interface IDBShell extends IDBTopoObject {
    fs: IDBFace[];
    es: IDBEdge[];
    vs: IDBVertex[];
}

export interface IDBBrepBody extends IDBShell {
    type: EN_GEO_TYPE.BREP_BODY;
}

// -------------- user data ----------------
export interface ITopoDebugData {
    debugTag: string;
}