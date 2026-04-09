import { dirtyProp } from '@ccpc/core';
import { Gizmos2d, IGizmo2dStyle } from './gizmo_2d';
import { Curve2, Vec2 } from '@ccpc/math';
import { EN_GIZMOS_STATUS } from '../../types/type_define';

export type IOperatePoints2DGizmoStyle = IGizmo2dStyle & {
    /** 曲线颜色 */
    curveColor?: number;
    /** 曲线宽度 */
    curveWidth?: number;
    /** 曲线不透明度 */
    curveOpacity?: number;
    /** 曲线是否为虚线 */
    curveDotted?: boolean;
    /** 曲线虚线大小 */
    curveDashSize?: number;
    /** 曲线虚线间隔大小 */
    curveGapSize?: number;
    /** 包围框曲线颜色 */
    boundCurveColor?: number;
    /** 包围框曲线宽度 */
    boundCurveWidth?: number;
    /** 包围框曲线不透明度 */
    boundCurveOpacity?: number;
    /** 包围框曲线是否为虚线 */
    boundCurveDotted?: boolean;
    /** 包围框曲线虚线大小 */
    boundCurveDashSize?: number;
    /** 包围框曲线虚线间隔大小 */
    boundCurveGapSize?: number;
}

/**
 * 2d操作点集辅助体
 */
export class OperatePoints2DGizmo extends Gizmos2d {
    public style?: IOperatePoints2DGizmoStyle

    /**操作点集*/
    @dirtyProp()
    public points: Vec2[]

    /** 曲线集合 */
    @dirtyProp()
    public curves?: Curve2[];

    /** 包围轮廓 */
    public boundCurves?: Curve2[];

    /** 是否显示边框 对应curves */
    public isShowOutlineCurves: boolean = true;

    /** 是否显示Box包围框 对应boundCurves*/
    public isShowBoundCurves: boolean = true;

    /** 变更回调 */
    public onPointChange?: (state: EN_GIZMOS_STATUS, pointIndex: number, dx: number, dy: number) => void;

    constructor(points: Vec2[], curves?: Curve2[]) {
        super();
        this.points = points;
        this.curves = curves;
    }
}
