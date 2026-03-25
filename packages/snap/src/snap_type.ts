/**
 * 吸附类型
 */
export enum EN_SNAP_TYPE {
    /** 无效 */
    InvalidType = -1,
    /** 端点 */
    EndPoint,
    /** 极点 */
    Pole,
    /** 交点 */
    XPt,
    /** 中点 */
    MiddlePoint,
    /** 圆心 */
    Center,

    /**
     * 垂足点
     * 确定点 A 后，移动靠近参考线，计算 A 到参考线的垂足
     */
    PerpendicularPoint,
    /** 点在线上 */
    PointOnCurve,
    /** 点在参考线上 */
    ReferCurve,
    /**
     * 延长线上的点
     * 先画线，再移动鼠标到延长线上
     */
    ExtensionPoint,
    /**
     * 垂直方向上的点
     * 确定点 A 后，移动命中曲线，获取 B 使 AB 垂直于曲线
     */
    VerticalToCurve,
    /**
     * 平行于曲线方向上的点
     */
    ParallelToCurve,
    /**
     * 相对上一点，平行于 X 轴
     */
    ParallelToX,
    /**
     * 相对上一点，平行于 Y 轴
     */
    ParallelToY,
    /**
     * 闭合线相对首点平行于 X 轴
     * 已有首点 A，当前点 B 被约束为与 A 水平
     */
    ClosedLineParallelToX,
    /**
     * 闭合线相对首点平行于 Y 轴
     */
    ClosedLineParallelToY,
    /** 点在面上 */
    PointOnFace,
    /** 点在吸附平面上 */
    PointOnSnapPlane,
}
