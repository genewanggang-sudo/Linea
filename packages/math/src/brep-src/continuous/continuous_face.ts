import { Plane } from '../../geometry/plane';
import { Face } from '../brep/face';



/**
 * 多个面组成的连续面
 */
export class ContinuousFace {
    private _faces: Face[];

    constructor(f: Face[]) {
        this._faces = f;
    }

    public getFaces(): ReadonlyArray<Face> {
        return this._faces;
    }

    public isPlane(): boolean {
        if (!this._faces.length) {
            return false;
        }

        const planes = this._faces.map(f => f.getSurface() as Plane);
        if (planes.every(p => p.isCoplanar(planes[0]))) {
            return true;
        }
        return false;
    }
}