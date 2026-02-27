import { MathError } from '../utils/math_error'

/**
 * 曲线离散参数类。
 */
export class DiscretizeOptions {
    public static readonly low = new DiscretizeOptions(5e-2, Math.PI / 18, 5e-3)

    public static readonly medium = new DiscretizeOptions(5e-3, Math.PI / 90, 5e-4)

    public static readonly high = new DiscretizeOptions(1e-4, Math.PI / 360, 1e-5)

    public static readonly ultra = new DiscretizeOptions(1e-5, Math.PI / 720, 1e-6)

    /** 弦高容差（世界坐标长度单位）。 */
    public chordTol: number

    /** 相邻采样切向转角容差（弧度）。 */
    public angleTolRad: number

    /** 允许继续细分的最小线段长度。 */
    public minSegmentLength: number

    constructor(
        chordTol = 1e-3,
        angleTolRad = Math.PI / 180,
        minSegmentLength = 1e-6,
    ) {
        MathError.assert(
            Number.isFinite(minSegmentLength) && minSegmentLength > 0,
            'DiscretizeOptionsError: minSegmentLength 必须是大于 0 的有限数',
        )
        this.chordTol = chordTol
        this.angleTolRad = angleTolRad
        this.minSegmentLength = minSegmentLength
    }

    public clone(): DiscretizeOptions {
        return new DiscretizeOptions(this.chordTol, this.angleTolRad, this.minSegmentLength)
    }

}
