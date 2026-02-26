import { MathError } from '../utils/math_error'

/**
 * 曲线离散参数类。
 */
export class DiscretizeOptions {
    public static readonly low = new DiscretizeOptions(5e-3, Math.PI / 90, 2048)

    public static readonly medium = new DiscretizeOptions(1e-3, Math.PI / 180, 4096)

    public static readonly high = new DiscretizeOptions(1e-4, Math.PI / 360, 8192)

    /** 弦高容差（世界坐标长度单位）。 */
    public chordTol: number

    /** 相邻采样切向转角容差（弧度）。 */
    public angleTolRad: number

    /** 分段数量上限。 */
    public maxSegments: number

    constructor(
        chordTol = 1e-3,
        angleTolRad = Math.PI / 180,
        maxSegments = 4096,
    ) {
        MathError.assert(
            Number.isInteger(maxSegments) && maxSegments >= 1,
            'DiscretizeOptionsError: maxSegments 必须是大于等于 1 的整数',
        )
        this.chordTol = chordTol
        this.angleTolRad = angleTolRad
        this.maxSegments = maxSegments
    }

    public clone(): DiscretizeOptions {
        return new DiscretizeOptions(this.chordTol, this.angleTolRad, this.maxSegments)
    }

}
