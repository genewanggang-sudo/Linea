import { Curve2 } from '../geometry/curve2';
import { Vec2 } from '../base/vec2';



export interface IGrapher2DInput {
    id?: number | string;
};

export interface IGrapher2DOutput extends IGrapher2DInput {
    oldId?: (number | string)[];
};

export interface IGrapher2DInEdge extends IGrapher2DInput {
    curve: Curve2;
    lregion?: number | string;
    rregion?: number | string;
    from?: number | string;
    to?: number | string;
}

export interface IGrapher2DOutPoint extends IGrapher2DOutput {
    point: Vec2;
}

export interface IGrapher2DEdge extends IGrapher2DOutput {
    curve: Curve2;
    from: IGrapher2DOutPoint;
    to: IGrapher2DOutPoint;
    coedges: IGrapher2DCoeEdge[];
}

export interface IGrapher2DCoeEdge extends IGrapher2DOutput {
    edge: IGrapher2DEdge;
    isRev: boolean;
    region: IGrapher2DDualRegion;
}

export interface IGrapher2DDualRegion extends IGrapher2DOutput {
    outer: IGrapher2DCoeEdge[];
    holes: IGrapher2DCoeEdge[][];
    link: IGrapher2DDualRegion[];
    depth: number;
}

export interface IGrapher2DResult {
    root: IGrapher2DDualRegion;
    list: IGrapher2DDualRegion[];
}