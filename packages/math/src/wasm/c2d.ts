import { P2D, IP2D } from "./pt";
import { Curve2 as MathCurve } from "../geometry/curve2";
import { IBx2 } from "./bx2"



export enum C2dType {
    line = 0,
    arc = 1,
    ellipse = 2,
    bezier2d3 = 3,
    hyperbola = 4,
    any = 5,
}

export abstract class C2d {
    start: P2D;
    end: P2D;
    id: number;
    constructor(start: IP2D | undefined, end: IP2D | undefined, id: number = -1) {
        this.start = start ? new P2D(start.x, start.y) : new P2D();
        this.end = end ? new P2D(end.x, end.y) : new P2D();
        this.id = id;
    }

    _toBuffer(ty: number, type: Int32Array, data: Float64Array, typeStep: number, dataStep: number, index: number): number {
        type[index * typeStep] = ty;
        type[index * typeStep + 1] = this.id;
        let offset = index * dataStep + 1;
        data[offset++] = this.start.x;
        data[offset++] = this.start.y;
        data[offset++] = this.end.x;
        data[offset++] = this.end.y;
        return offset;
    }

    abstract toMathCurve(): MathCurve;

    abstract get type(): C2dType;

    abstract rev(): C2d;

    abstract toRev(): C2d;

    abstract toBuffer(type: Int32Array, data: Float64Array, typeStep: number, dataStep: number, index: number): void;

    abstract updateBox2d(b: IBx2): void;

    static curveSizeWasm: number = 0;
}

export interface ConfigurableCurve {
    curve: MathCurve;
    rate: number | undefined;
};