import { Ln2 } from '../../geometry/ln2';
import { Vec2 } from '../../base/vec2';
import { types } from '../../type_define/i_types';



export class HalfPlane {
    public static createByLine2d(line: Ln2): HalfPlane {
        const dir = line.getDirection();
        const start = line.getStartPt();
        return new HalfPlane({ x: -dir.y, y: dir.x }, start.x * dir.y - start.y * dir.x);
    }

    public w!: types.IXY;

    public b!: number;

    constructor(w: types.IXY, b: types.IXY | number);

    constructor(w: types.IXY, b: any) {
        if (typeof b.x === 'number') {
            this.w = { x: w.y - b.y, y: b.x - w.x };
            const len = Math.sqrt(this.w.x * this.w.x + this.w.y * this.w.y);
            this.w.x /= len;
            this.w.y /= len;
            this.b = -(this.w.x * w.x + this.w.y * w.y);
        } else {
            this.w = { x: w.x, y: w.y };
            this.b = b;
        }
    }

    public get normal() {
        return new Vec2(this.w);
    }

    public distance(p: types.IXY) {
        return this.w.x * p.x + this.w.y * p.y + this.b;
    }

    public clone(): HalfPlane {
        return new HalfPlane(this.w, this.b);
    }

    public toLine2d() {
        let tmp: types.IXY;

        if (Math.abs(this.w.x) > Math.abs(this.w.y)) {
            tmp = { x: -this.b / this.w.x, y: 0 };
        } else {
            tmp = { x: 0, y: -this.b / this.w.y };
        }

        return new Ln2(tmp, { x: tmp.x + this.w.y, y: tmp.y - this.w.x });
    }

    public offset(c: number): HalfPlane {
        this.b -= c;
        return this;
    }

    public intersect(h: HalfPlane): types.IXY {
        const cross = (p1: types.IXY, p2: types.IXY) => {
            return p1.x * p2.y - p1.y * p2.x;
        };
        const delta = cross(this.w, h.w);
        return {
            x: (this.w.y * h.b - h.w.y * this.b) / delta,
            y: (h.w.x * this.b - this.w.x * h.b) / delta,
        };
    }

    public parallel(h: HalfPlane, tol: number = 1e-6) {
        return Math.abs(h.w.x * this.w.y - h.w.y * this.w.x) < tol;
    }

    public dump() {
        return {
            w: { x: this.w.x, y: this.w.y },
            b: this.b,
        };
    }

    public load(data: any) {
        return new HalfPlane(data.w, data.b);
    }
}

