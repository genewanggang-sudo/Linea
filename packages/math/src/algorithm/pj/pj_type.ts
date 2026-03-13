/**
 * 曲线间位置关系类型
 *
 * 重叠，十位数为1：
 * - OVERLAP 部分或完全重叠x



 *
 * 相交，十位数为2
 * - INTERSECT_IN 在曲线内部相交
 * - INTERSECT_ON 在曲线端点处相交
 *
 * 不相交（为0）
 * - NOT_INTERSECT 不相交
 */
enum CurvesPJType {
    NOT_INTERSECT = 0,
    OVERLAP = 10,
    TOTALLY_OVERLAP = 11,
    INTERSECT_IN = 21,
    INTERSECT_ON = 22,
}

/**
 * 点与loop的关系类型:
 * - OUT 点在loop外部
 * - ON  点在loop边界上
 * - IN 点在loop内部
 */
enum PtLoopPJType {
    OUT = 0,

    ONEDGE = -1,

    ONVERTEX = -2,

    IN = 1,
}

/**
 * loop与loop的关系
 */
enum LoopsPJType {
    // 相交
    INTERSECT = 'x',

    // 几何上相等
    EQUAL = 'eq',

    // A在B的内部
    IN = 'in',
    // A包含B，B在A的内部
    CONTAIN = 'ct',
    // 在外部
    OUT = 'out',
}

export { CurvesPJType, PtLoopPJType, LoopsPJType };