import { IP2D, P2D } from "./pt";



export interface IBx2 {
    min: IP2D;
    max: IP2D;
}

export class Bx2 {
    min: P2D;
    max: P2D;

    constructor() {
        this.min = new P2D(Infinity, Infinity);
        this.max = new P2D(-Infinity, -Infinity);
    }

    union(b: IBx2) {
        if (this.min.x > b.min.x) this.min.x = b.min.x;
        if (this.min.y > b.min.y) this.min.y = b.min.y;
        if (this.max.x < b.max.x) this.max.x = b.max.x;
        if (this.max.y < b.max.y) this.max.y = b.max.y;
    }

    update(b: IP2D | IP2D[]) {
        if (!Array.isArray(b)) {
            if (this.min.x > b.x) this.min.x = b.x;
            if (this.min.y > b.y) this.min.y = b.y;
            if (this.max.x < b.x) this.max.x = b.x;
            if (this.max.y < b.y) this.max.y = b.y;
        } else {
            for (let i = 0; i < b.length; ++i) {
                if (this.min.x > b[i].x) this.min.x = b[i].x;
                if (this.min.y > b[i].y) this.min.y = b[i].y;
                if (this.max.x < b[i].x) this.max.x = b[i].x;
                if (this.max.y < b[i].y) this.max.y = b[i].y;
            }
        }
    }

    toArray() {
        return [{ x: this.min.x, y: this.min.y }, { x: this.max.x, y: this.min.y }, { x: this.max.x, y: this.max.y }, { x: this.min.x, y: this.max.y }]
    }
}