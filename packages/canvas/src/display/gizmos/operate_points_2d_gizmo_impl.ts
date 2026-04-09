import { dirtyProp, GCurve2d, GPoint2d, GPolycurve, GRep } from '@ccpc/core';
import { IMouseEvent, IKeyboardEvent } from '../../types/type_define';
import { IDisplayRenderData } from '../display_object_impl';
import { Gizmo2dImpl } from './gizmo_2d_impl';
import { IOperatePoints2DGizmoStyle, OperatePoints2DGizmo } from './operate_points_2d_gizmo';
import { Box2, Curve2, Ln2, Plane, PolyCurve, Vec2 } from '@ccpc/math';

export class OperatePoints2DGizmoImpl extends Gizmo2dImpl<OperatePoints2DGizmo> {
    private _grep!: GRep

    // TODO 实现GNodeArray
    /**点集合*/
    private _gPoints: Array<GPoint2d> = []

    /**曲线集合*/
    private _curves!: GCurve2d[]

    /**外包围框曲线*/
    private _boundPolyCurve!: GPolycurve

    /**鼠标悬停点*/
    private _hoverGPoint!: GPoint2d

    /**悬停点下标*/
    @dirtyProp()
    private _hoverIndex: number = -1;

    /**拖拽点下标*/
    @dirtyProp()
    private _dragIndex: number = -1

    /**鼠标按下时屏幕坐标*/
    private _mouseDownPos: Vec2

    /**拖拽开始*/
    private _dragStart: boolean

    /**拖拽增量起点*/
    private _lastDragPos: Vec2

    private _pointSize = new Vec2(8, 8);

    /**
     * 获取显示样式
     */
    protected get _displayStyle(): IOperatePoints2DGizmoStyle {
        const style = super._displayStyle
        const selfStyle: IOperatePoints2DGizmoStyle = {
            curveColor: 0xffffff,
            curveWidth: 2,
            curveOpacity: 1,
            curveDotted: false,
            curveDashSize: 10,
            curveGapSize: 5,
            boundCurveColor: 0xffffff,
            boundCurveWidth: 0.5,
            boundCurveOpacity: 1,
            boundCurveDotted: true,
            boundCurveDashSize: 3,
            boundCurveGapSize: 3,
        }
        Object.assign(style, selfStyle)
        if (this._display.style) {
            Object.assign(style, this._display.style)
        }
        return style
    }

    public onInit(): void {
        this._curves = []
        this._drawPoints()
    }

    /**
     * 根据样式绘制点
     */
    private _drawPoints() {
        this._grep = this.createGrep()
        const { points } = this._display
        const curves = this._getCurves()
        const boundCurve = this._getBoundCurves()
        const plane = Plane.XOY()
        const {
            curveColor,
            curveWidth,
            curveOpacity,
            // curveDotted,
            // curveDashSize,
            // curveGapSize,
            boundCurveColor,
            boundCurveWidth,
            boundCurveOpacity,
            // boundCurveDotted,
            // boundCurveDashSize,
            // boundCurveGapSize,
        } = this._displayStyle;

        const scale = this._scale2dFactor
        const pointSize = this._pointSize.clone().multiply(scale);

        // 生成点
        points.forEach((p, index) => {
            if (this._hoverIndex === index) return
            const gPoint = new GPoint2d(plane, p)
            gPoint.setStyle({
                point: {
                    size: pointSize.x,
                },
            })
            this._gPoints.push(gPoint)
        })

        const hoverPoint = new GPoint2d(plane, new Vec2())
        this._hoverGPoint = hoverPoint;
        if (this._hoverIndex !== -1) {
            const hoverP = points[this._hoverIndex]
            hoverPoint.geo = hoverP
            hoverPoint.setStyle({
                point: {
                    size: pointSize.x * 1.3,
                },
            })
            // TODO GRep层增加visible属性
            hoverPoint.visible = true
        } else {
            hoverPoint.visible = false
        }

        // 生成曲线
        const gCurves = new Array<GCurve2d>();
        for (let i = 0; i < curves.length; i++) {
            const curve = curves[i];
            const gCurve = new GCurve2d(plane, curve);
            gCurve.setStyle({
                line: {
                    color: curveColor,
                    width: curveWidth,
                    opacity: curveOpacity,
                    // dotted: curveDotted,
                    // dashSize: curveDashSize,
                    // gapSize: curveGapSize,
                },
            });
            this.setPick(gCurve, false);
            gCurves.push(gCurve);
        }

        // 生成包围框
        const gBoundCurve = new GPolycurve(plane, boundCurve);
        gBoundCurve.setStyle({
            line: {
                color: boundCurveColor,
                width: boundCurveWidth,
                opacity: boundCurveOpacity,
                // dotted: boundCurveDotted,
                // dashSize: boundCurveDashSize,
                // gapSize: boundCurveGapSize,
            },
        });

        this.setPick(gBoundCurve, false);

        this._curves = gCurves;
        this._boundPolyCurve = gBoundCurve;

        this._grep.addNodes(this._hoverGPoint)
        this._grep.addNodes(this._boundPolyCurve);
        this._grep.addNodes(...this._curves);
        this._grep.addNodes(this._gPoints);
    }

    /**
     * 获取点与点之间的连线
     */
    private _getCurves() {
        const { curves, points } = this._display
        if (curves) return curves
        const rCurves: Curve2[] = []
        for (let i = 0; i < points.length; i += 1) {
            const p1 = points[i]
            const p2 = points[(i + 1) % points.length]
            const line = new Ln2(p1, p2)
            rCurves.push(line)
        }
        return rCurves
    }

    /**
     * 获取包围轮廓线
     */
    private _getBoundCurves() {
        const { points, boundCurves } = this._display
        if (boundCurves && boundCurves.length) return new PolyCurve(boundCurves)
        const box2 = new Box2(points)
        return new PolyCurve([
            box2.min.clone(),
            new Vec2(box2.max.x, box2.min.y),
            box2.max.clone(),
            new Vec2(box2.min.x, box2.max.y),
            box2.min.clone(),
        ])
    }

    public processMouseEvent(event: IMouseEvent): boolean {
        throw new Error('Method not implemented.');
    }

    public processKeyboardEvent(event: IKeyboardEvent): boolean {
        throw new Error('Method not implemented.');
    }

    public onChange(): void {
        this.onDisplayChange()
    }

    public onDisplayChange(): void {
        const { points } = this._display;
        const curves = this._getCurves();
        const boundCurve = this._getBoundCurves();
        const scale = this.scale2dFactor;
        const pointSize = this._pointSize.clone().multiply(scale);

        if (this._dragIndex === -1) {
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                if (this._hoverIndex === i) {
                    continue;
                }
                this._gPoints[i].geo = point
                this._gPoints[i].geo.visible = true
            }
        } else {
            this._gPoints.forEach(_ => {
                _.visible = false
            })
        }

        if (this._hoverIndex !== -1) {
            const hoverPoint = points[this._hoverIndex];
            this._hoverGPoint.visible = true
            this._hoverGPoint.geo = hoverPoint
            const style = this._hoverGPoint.getStyle()
            style.point!.size = pointSize.multiplied(1.3).x
            this._hoverGPoint.setStyle(style)
        } else {
            this._hoverGPoint.visible = false
        }

        const gCurves = this._curves;
        for (let i = 0; i < curves.length; i++) {
            const curve = curves[i];
            const gCurve = gCurves[i];
            gCurve.geo = curve;
            gCurve.visible = this._display.isShowOutlineCurves;
        }

        this._boundPolyCurve.geo = boundCurve;
        this._boundPolyCurve.visible = this._display.isShowBoundCurves;

        //阵列中的svg需要单独clearRenderNode才生效，原因待查
        this._grep.clearRenderNode()
    }

    public onRender(): IDisplayRenderData | null {
        return {
            gRep: this._grep,
        }
    }

    public dispose(): void {
        super.dispose()
    }
}
