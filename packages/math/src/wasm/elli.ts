import { C2d, C2dType } from "./c2d"
import { P2D, IP2D } from "./pt";
import { Curve2 as MathCurve } from "../geometry/curve2";
import { Arc2 as MathArc2d } from '../geometry/arc2d';
import { Coord2 } from "../base/coord2";
import { IBx2 } from "./bx2";
export class Elli extends C2d {
    a: number;
    b: number;
    rotate: number;
    center: P2D;
    beta: number;
    constructor(start: IP2D, end: IP2D, a: number, b: number, rotate: number, center: IP2D, beta: number, id: number = -1) {
        super(start, end, id);
        this.a = a;
        this.b = b;
        this.center = new P2D(center.x, center.y);
        this.rotate = rotate;
        this.beta = beta;
    }



    get type(): C2dType {
        return C2dType.ellipse;
    }

    rev(): C2d {
        let tmp = this.end;
        this.end = this.start;
        this.start = tmp;
        this.beta = -this.beta;
        return this;
    }

    toRev(): C2d {
        return new Elli(this.end.clone(),
            this.start.clone(),
            this.a,
            this.b,
            this.rotate,
            this.center.clone(),
            -this.beta,
            this.id
        );
    }

    static toMathCurve(ell: Elli): MathCurve {
        let coord = new Coord2(ell.center,
            {
                x: Math.cos(ell.beta), y: Math.sin(ell.beta)
            });
        let angle = Math.atan2(ell.start.y - ell.center.y, ell.end.x - ell.center.x);
        return new MathArc2d(coord, ell.a, ell.b, ell.beta >= 0, [angle, angle + ell.beta]);
    }

    toMathCurve(): MathCurve {
        let coord = new Coord2(this.center,
            {
                x: Math.cos(this.beta), y: Math.sin(this.beta)
            });
        let angle = Math.atan2(this.start.y - this.center.y, this.end.x - this.center.x);
        return new MathArc2d(coord, this.a, this.b, this.beta >= 0, [angle, angle + this.beta]);
    }

    toBuffer(type: Int32Array, data: Float64Array, typeStep: number, dataStep: number, index: number): void {
        let offset = this._toBuffer(this.type, type, data, typeStep, dataStep, index);
        data[offset++] = this.a;
        data[offset++] = this.b;
        data[offset++] = this.rotate;
        data[offset++] = this.center.x;
        data[offset++] = this.center.y;
        data[offset++] = this.beta;
    }

    updateBox2d(b: IBx2): void {
    }

}