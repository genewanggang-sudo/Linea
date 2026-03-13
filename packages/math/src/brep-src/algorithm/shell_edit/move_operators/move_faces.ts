import { Vec3 } from '../../../..';
import { Face } from '../../../brep/face';
import { Edge } from '../../../brep/edge';
import { MoveEdges } from './move_edges';
import { IShellModelingResult } from '../shell_modeling_result';
import ShellModelingBase from '../shell_modeling_base';
import { Shell } from '../../../brep/shell';



export class MoveFaces extends ShellModelingBase {
    private _faces: Set<Face>;

    private _transVect: Vec3;

    constructor(faces: Face[], moveVect: Vec3, context: Shell[] = []) {
        super(context);
        this._faces = new Set(faces);
        this._transVect = moveVect;
    }

    /**
     * move faces and connect edges, vertices. // move face不会导致移动的face自相交，因此后续可改进，移动edge不用判断自相交。或者都继承自一个基类 //
     */
    protected _executeImpl(): IShellModelingResult {
        const allMoveEdges: Set<Edge> = new Set();
        for (const iFace of this._faces) {
            for (const iCoedge of iFace.getCoedge3ds()) {
                allMoveEdges.add(iCoedge.getEdge()!);
            }
        }

        // 判断如果shell所有的vertex都在moveset中，直接move shell
        // 暂时也不支持多个shell的face一起移动，因此直接调用MoveEdges可判断。

        const move = new MoveEdges(Array.from(allMoveEdges), this._transVect);
        return move.execute();
    }
}