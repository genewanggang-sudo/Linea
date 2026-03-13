export class CONST {
    //
    public static readonly PI = Math.PI;



    public static readonly PI2 = Math.PI * 2;

    public static readonly PI_2 = Math.PI / 2;

    public static readonly PI_4 = Math.PI / 4;

    public static readonly PI_6 = Math.PI / 6;

    public static readonly PI_16 = Math.PI / 16;

    // 最大迭代次数
    public static readonly NORMAL_ITER_NUM = 20;

    public static readonly MAX_ITER_NUM = 200;

    // 细分截至方向锥角度
    public static readonly PI_12 = Math.PI / 12;

    // 最大细分深度
    public static readonly MAX_SUBDEVIDE_DEPTH = 16;

    // 求交：最多计算交点个数（防止死循环）
    public static readonly MAX_INTERSECTION_NUM = 1000;

    // 建筑的最大的长度 1km
    public static readonly MODEL_MAX_LENGTH = 1e6;

    // 默认整圆离散的最小度数（1度）
    public static readonly APPROX_ARC_MIN = Math.PI / 180;

    // 默认整圆离散的最大度数（10度）
    public static readonly APPROX_ARC_MAX = Math.PI / 18;

    // 默认的最大正整数
    public static readonly MAX_INTEGER = 1e100;

    // 默认的最大正整数
    public static readonly MAX_NEG_INTEGER = -1e100;
}