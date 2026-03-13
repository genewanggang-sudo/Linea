import { types } from '../type_define/i_types';
import { CONST } from '../type_define/const';



export class Tol {
    /**
     * 默认的double数值级别的容差
     */
    public static NUMBER = 1e-6;

    public static NUMBER_2 = Tol.NUMBER * Tol.NUMBER;

    /**
     * 默认的长度容差 1e-6mm
     */
    public static LENGTH = 1e-6;

    public static LENGTH_2 = Tol.LENGTH * Tol.LENGTH;

    /**
     * 几何体的默认长度容差 0.001mm。譬如说edge和vertex之间可能存在容差，但是要小于0.001
     */
    public static EDGE_LENGTH_EPS = 1e-3;

    public static EDGE_LENGTH_EPS2 = Tol.EDGE_LENGTH_EPS * Tol.EDGE_LENGTH_EPS;

    /**
     * 计算中间过程的容差，比长度容差略小
     */
    public static PROCESS_LENGTH_EPS = 1e-7;

    /**
     * 默认的角度容差
     */
    public static ANGLE = 1e-6;

    /**
     * 粗糙角度容差，用于退化情况的判断
     */
    public static ROUGH_ANGLE_EPS = 1e-3;

    // 几何库内部使用
    public static DELTA_EPS = 1e-10;

    // 解方程容差判断
    public static NUMBER_CALC_EPS = 1e-8;

    // 判断一个浮点数是否为0
    public static ZERO_JUDGE_EPS = 1e-14;

    public static ZERO_JUDGE_EPS2 = 1e-28;

    // 底层基础运算用，精确判断，判 0，Nan，曲线求值
    public static CALCULATE_EPS = 1e-12;

    public static CALCULATE_EPS2 = Tol.CALCULATE_EPS * Tol.CALCULATE_EPS;

    public static CALCULATE_EPS4 = Tol.CALCULATE_EPS2 * Tol.CALCULATE_EPS2;

    public static CLIPPER_SCALE = 1e8;

    public static readonly DEFAULT = new Tol(Tol.LENGTH);

    public readonly lengthEps2: number;

    public readonly processLengthEps2: number;

    public readonly edgeLengthEps2: number;

    /**
     * 设置全局默认的容差
     * @param lengthEps 判定用长度容差
     * @param angleEps 判定用角度容差
     * @param processLengthEps 生成几何用的长度容差
     */
    constructor(
        public readonly lengthEps: number = Tol.LENGTH,
        public readonly angleEps: number = lengthEps,
        public readonly processLengthEps = lengthEps * 0.1,
        public readonly edgeLengthEps: number = Tol.EDGE_LENGTH_EPS,
    ) {
        this.lengthEps2 = lengthEps * lengthEps;
        this.processLengthEps2 = processLengthEps * processLengthEps;
        this.edgeLengthEps2 = edgeLengthEps * edgeLengthEps;
    }

    /**
     * @deprecated
     * 请使用this.numberEps代替
     */
    public get numEps() {
        return this.angleEps;
    }

    /**
     * 判定用数值容差。不鼓励使用此值，应尽量根据几何信息进行容差判断
     */
    public get numberEps() {
        return this.angleEps;
    }

    /**
     * 判断两个角度是否相等
     * @param a
     * @param b
     */
    public areAnglesEqual(a: number, b: number): boolean {
        return Math.abs(a - b) < this.angleEps;
    }

    /**
     * 判断两个长度是否相等
     * @param a
     * @param b
     */
    public areLengthEqual(a: number, b: number): boolean {
        return Math.abs(a - b) < this.lengthEps;
    }

    /**
     * 判断两个参数是否相等
     * @param a
     * @param b
     */
    public areParamEqual(a: number, b: number): boolean {
        return Math.abs(a - b) < this.numberEps;
    }

    /**
     * 判断长度是否接近 0
     * @param a
     */
    public isLengthZero(a: number): boolean {
        return Math.abs(a) < this.lengthEps;
    }

    /**
     * 判断长度的平方是否接近 0
     * @param a
     */
    public isSquareLengthZero(a: number): boolean {
        return a < this.lengthEps * this.lengthEps;
    }

    /**
     * 判断参数是否在周期参数域的0点或周期点上
     * @param a
     * @param period
     */
    public isParamOnPeriodEnd(a: number, period: number = CONST.PI2): boolean {
        const da = a % period;
        return Math.abs(da) < this.numberEps || Math.abs(da + period) < this.numberEps;
    }

    /**
     * 判断两个向量是否平行
     * @param a
     * @param b
     */
    public areParralel(a: types.IXY, b: types.IXY): boolean;

    /**
     * 判断两个向量是否平行
     * @param a
     * @param b
     */
    public areParralel(a: types.IXYZ, b: types.IXYZ): boolean;

    public areParralel(a: types.IXY | types.IXYZ, b: types.IXY | types.IXYZ): boolean {
        const az = (a as any).z || 0;
        const bz = (b as any).z || 0;
        const lenA = a.x * a.x + a.y * a.y + az * az;
        const lenB = b.x * b.x + a.y * a.y + bz * bz;
        const crossZ = a.x * b.y - a.y * b.x;
        const crossX = a.y * bz - az * b.y;
        const crossY = az * b.x - a.x * bz;
        return (crossX * crossX + crossY * crossY + crossZ * crossZ) / (lenA * lenB) < Math.sin(this.angleEps) ** 2;
    }

    /**
     * 判断两个顶点是否重合
     * @param a
     * @param b
     */
    public areNear(a: types.IXY, b: types.IXY): boolean;

    /**
     * 判断两个顶点是否重合
     * @param a
     * @param b
     */
    public areNear(a: types.IXYZ, b: types.IXYZ): boolean;

    public areNear(a: types.IXY | types.IXYZ, b: types.IXY | types.IXYZ): boolean {
        const az = (a as any).z || 0;
        const bz = (b as any).z || 0;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = az - bz;
        return dx * dx + dy * dy + dz * dz < this.lengthEps * this.lengthEps;
    }
}