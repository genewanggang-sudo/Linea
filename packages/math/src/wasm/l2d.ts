import { C2d, C2dType } from "./c2d";
import { IP2D } from "./pt";
import { Curve2 as MathCurve } from "../geometry/curve2";
import { Ln2 as MathLine2d } from '../geometry/ln2';
import { IBx2 } from "./bx2";
export class L2D extends C2d {
    constructor(start: IP2D, end: IP2D, id: number = -1) {
        super(start, end, id);
    }



    get type(): C2dType {
        return C2dType.line;
    }

    toRev(): C2d {
        return new L2D(this.end.clone(), this.start.clone(), this.id)
    }

    static toMathCurve(line: L2D): MathCurve {
        return new MathLine2d(line.start, line.end);
    }

    toMathCurve(): MathCurve {
        return new MathLine2d(this.start, this.end);
    }

    rev(): C2d {
        let tmp = this.end;
        this.end = this.start;
        this.start = tmp;
        return this;
    }

    toBuffer(type: Int32Array, data: Float64Array, typeStep: number, dataStep: number, index: number): void {
        this._toBuffer(this.type, type, data, typeStep, dataStep, index);
    }

    updateBox2d(b: IBx2): void {
        if (b.min.x > this.start.x) b.min.x = this.start.x;
        if (b.min.x > this.end.x) b.min.x = this.end.x;
        if (b.max.x < this.start.x) b.max.x = this.start.x;
        if (b.max.x < this.end.x) b.max.x = this.end.x;

        if (b.min.y > this.start.y) b.min.y = this.start.y;
        if (b.min.y > this.end.y) b.min.y = this.end.y;
        if (b.max.y < this.start.y) b.max.y = this.start.y;
        if (b.max.y < this.end.y) b.max.y = this.end.y;
    }
}