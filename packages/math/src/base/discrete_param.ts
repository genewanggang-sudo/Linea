import { CONST } from '../type_define/const';
import { Tol } from './tol';



export class DiscreteParam {
    public static readonly LOW = new DiscreteParam(new Tol(36, CONST.PI / 6), 1200, 4, 150, 3000, false);

    public static readonly NORMAL = new DiscreteParam(new Tol(12, CONST.PI / 12), 400, 4, 400, 10000, false);

    public static readonly HIGH = new DiscreteParam(new Tol(4, CONST.PI / 36), 120, 10, 1200, 30000, true);

    public static readonly BorderScale = 10e-2;

    public static readonly UvDisEps = 10e-2;

    //
    public static readonly CALCULATE = new DiscreteParam(
        new Tol(1, CONST.PI / 108),
        30,
        40,
        5000,
        100000,
        true,
    );

    private static readonly _MIN_HINT_SEGMENT_COUNT = 4;

    private static readonly _MIN_TOLER_ANGLE_EPS = CONST.PI / 6;

    constructor(
        public tolerance: Tol,
        public crossEps: number, // 差乘容差，用于面离散时判断是否需要拆分边
        public hintSegmentCount: number,
        public maxSegmentCount: number,
        public maxFaceletCount: number,
        public enableSurfaceRefiner: boolean,
    ) { }

    public clone({
        tolerance = this.tolerance,
        crossEps = this.crossEps,
        hintSegmentCount = this.hintSegmentCount,
        maxSegmentCount = this.maxSegmentCount,
        maxFaceletCount = this.maxFaceletCount,
        enableSurfaceRefiner = this.enableSurfaceRefiner,
    }): DiscreteParam {
        return new DiscreteParam(
            tolerance,
            crossEps,
            hintSegmentCount,
            maxSegmentCount,
            maxFaceletCount,
            enableSurfaceRefiner,
        );
    }

    public ratioed(ratio = 0.5, enableSurfaceRefiner = this.enableSurfaceRefiner) {
        const tol = this.tolerance;
        const anlgeEps = Math.max(tol.angleEps * ratio, DiscreteParam._MIN_TOLER_ANGLE_EPS);
        const hintSegment = Math.max(this.hintSegmentCount / ratio, DiscreteParam._MIN_HINT_SEGMENT_COUNT);

        return new DiscreteParam(
            new Tol(tol.lengthEps * ratio, anlgeEps),
            this.crossEps * ratio,
            hintSegment,
            this.maxSegmentCount / ratio,
            this.maxFaceletCount / ratio,
            enableSurfaceRefiner,
        );
    }
}