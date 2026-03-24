/**
 * 吸附类型
 */
export enum EN_SNAP_TYPE {
    /**无效*/
    InvalidType = -1,
    /**端点*/
    EndPoint,
    /**极点*/
    Pole,
    /**交点*/
    XPt,
    /**中点*/
    MiddlePoint,
    /**圆心*/
    Center,

    /**
     * 垂足点
     * 确定点A -> 移动靠近参考线-> 计算A到参考线的垂足
     */
    PerpendicularPoint,
    /**点在线上*/
    PointOnCurve,
    /**点在参考线上*/
    ReferCurve,
    /**延长线上的点*/
    ExtensionPoint,
    /**
    * 垂直方向上点
    * 确定点A -> 移动命中曲线 -> 获取B使AB垂直于曲线
    */
    VerticalToCurve,
    /**
    * 平行方向上点
    */
    ParallelToCurve,
    /**
    * 封闭线平行于X轴
    * 已有点A,当前点B被约束成和A水平
    */
    ClosedLineParallelToX,
    /**封闭线平行于Y轴*/
    ClosedLineParallelToY,
    /**点在面上*/
    PointOnFace,
    /**点在吸附平面上*/
    PointOnSnapPlane,
}
