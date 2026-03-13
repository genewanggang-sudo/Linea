import { C2d, C2dType } from "./c2d";
import { P2D, IP2D } from "./pt";
import { Curve2 as MathCurve } from '../geometry/curve2';
import { Arc2 as MathArc2d } from '../geometry/arc2d';
import { IBx2 } from "./bx2";
export class A2D extends C2d {
    r: number;
    center: P2D;
    beta: number;
    constructor(start: IP2D,
        end: IP2D,
        r: number,
        beta: number,
        center: IP2D,
        id: number = -1) {
        super(start, end, id);
        this.r = r;
        this.center = new P2D(center.x, center.y);
        this.beta = beta;
    } 



    get type(): C2dType {
        return C2dType.arc
    }

    static toMathCurve(curve2d: A2D): MathArc2d {
        let angle = Math.atan2(curve2d.start.y - curve2d.center.y, curve2d.start.x - curve2d.center.x);
        return MathArc2d.makeArcByStartEndAngles(curve2d.center, curve2d.r, angle, angle + curve2d.beta, curve2d.beta > 0);
    }

    toMathCurve(): MathCurve {
        let angle = Math.atan2(this.start.y - this.center.y, this.start.x - this.center.x);
        return MathArc2d.makeArcByStartEndAngles(this.center, this.r, angle, angle + this.beta, this.beta > 0);
    }

    rev(): C2d {
        let tmp = this.end;
        this.end = this.start;
        this.start = tmp;
        this.beta = -this.beta;
        return this;
    }

    toRev(): C2d {
        return new A2D(this.end.clone(),
            this.start.clone(),
            this.r,
            -this.beta,
            this.center.clone(),
            this.id
        );
    }

    toBuffer(type: Int32Array, data: Float64Array, typeStep: number, dataStep: number, index: number): void {
        let offset = this._toBuffer(this.type, type, data, typeStep, dataStep, index);
        data[offset++] = this.r;
        data[offset++] = this.center.x;
        data[offset++] = this.center.y;
        data[offset++] = this.beta;
    }

    inside(pos: IP2D): boolean {
        let sx = this.start.x - this.center.x;
        let sy = this.start.y - this.center.y;
        let dx = pos.x - this.center.x;
        let dy = pos.y - this.center.y;
        let alpha = Math.atan2(sx * dy - dx * sy, sx * dx + sy * dy);
        if (alpha < 0) {
            if (this.beta < 0) {
                return alpha > this.beta;
            }
            return alpha < this.beta - Math.PI * 2;
        }
        if (this.beta > 0) return alpha < this.beta;
        return alpha > this.beta + Math.PI * 2;
    }

    updateBox2d(b: IBx2): void {
        let poss = [this.start, this.end,
        { x: this.center.x - this.r, y: this.center.y },
        { x: this.center.x + this.r, y: this.center.y },
        { x: this.center.x, y: this.center.y + this.r },
        { x: this.center.x, y: this.center.y - this.r },
        ]
        for (let i = 0; i < poss.length; ++i) {
            if (i > 1 && !this.inside(poss[i])) continue;
            b.min.x = Math.min(poss[i].x, b.min.x);
            b.min.y = Math.min(poss[i].y, b.min.y);
            b.max.x = Math.max(poss[i].x, b.max.x);
            b.max.y = Math.max(poss[i].y, b.max.y);
        }
    }
}