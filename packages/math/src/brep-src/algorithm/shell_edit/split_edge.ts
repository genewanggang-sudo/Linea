import { Vec3 } from '../../..';
import { splitEdgeByVertices } from './operator/split_edge';
import { Edge } from '../../brep/edge';
import ShellModelingBase from './shell_modeling_base';
import { IShellModelingResult } from './shell_modeling_result';
import { Shell } from '../../brep/shell';



export default class SplitEdge extends ShellModelingBase {
    private _edge: Edge;

    private _pts: Vec3[];

    constructor(edge: Edge, pts: Vec3[]) {
        super([]);
        this._edge = edge;
        this._pts = pts;
    }

    protected _executeImpl(): IShellModelingResult {
        const shell = this._edge.getParent() as Shell;
        const vertices = this._pts.map(pt => {
            const v = shell.createVertex(pt);
            return v;
        });
        splitEdgeByVertices(this._edge, vertices);
        return {};
    }
}