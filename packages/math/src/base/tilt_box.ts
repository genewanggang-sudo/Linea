import { Box3 } from './box3';
import { Coord3 } from './coord3';
import { Vec3 } from './vec3';



export class TiltBox3 extends Box3 {
    public coord: Coord3;

    constructor(box: Box3, coord: Coord3) {
        super();
        this.min = box.min;
        this.max = box.max;
        this.coord = coord;
    }

    public getCoord(): Coord3 {
        return this.coord.clone();
    }

    public getBox(): Box3 {
        return new Box3([this.min, this.max]);
    }

    public getCornerPts(): Vec3[] {
        const worldPts: Vec3[] = [];
        const coord = this.coord;
        for (const pt of this.getBox().getCornerPts()) {
            const worldPt = coord.getWorldPtAt(pt);
            worldPts.push(worldPt);
        }

        return worldPts;
    }

    public union(box: Box3) {
        if (!box.isValid()) {
            return this;
        }

        const pts = box.getCornerPts();
        for (const pt of pts) {
            const localPt = this.coord.getLocalPtAt(pt);
            this.expandByPoint(localPt);
        }

        return this;
    }
}