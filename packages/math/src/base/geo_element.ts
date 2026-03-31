import { types } from '../type_define/i_types';
import { IGeo } from '../type_define/i_element';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Vec2 } from './vec2';
import { Vec3 } from './vec3';
import { Ln2 } from '../geometry/ln2';
import { Arc2 } from '../geometry/arc2d';
import { NurbsCurve2 } from '../geometry/nurbs_curve2';
import { OffsetCurve2 } from '../geometry/offset_curve2';
import { SmoothPoly2 } from '../geometry/smooth_poly2';
import { SmoothPoly3 } from '../geometry/smooth_poly3';
import { Loop } from '../topology/loop';
import { Ln3 } from '../geometry/ln3';
import { Arc3 } from '../geometry/arc3d';
import { Circle3d } from '../geometry/circle3d';
import { OffsetCurve3 } from '../geometry/offset_curve3';
import { NurbsCurve3 } from '../geometry/nurbs_curve3';
import { Plane } from '../geometry/plane';
import { Cylinder } from '../geometry/cylinder';
import { IArc, ILine, INurbsCurve, IOffsetCurve } from '../type_define/i_geometry';
import { Vec } from './vec';

export abstract class GeoElement implements IGeo {
    // 该字段不会被dump下来，clone时浅拷贝
    public userData!: { [key: string]: any };

    // 该字段会被dump下来，clone时也会深拷贝
    public dUserData!: { [key: string]: any };

    public abstract getType(): EN_GEO_TYPE;

    public dump(): types.IDBLibGeo {
        const obj: types.IDBLibGeo = { type: this.getType() };
        if (this.dUserData) {
            obj._d = this.dUserData;
        }

        return obj;
    }

    public load(json: types.IDBLibGeo): this {
        this.dUserData = json._d;
        return this;
    }

    // clone
    public clone(): IGeo {
        const _this = new (this as any).constructor();
        _this.load(this.dump());
        _this.userData = this.userData;
        return _this;
    }

    public toString(): string {
        return JSON.stringify(this.dump());
    }

    // 快捷用法
    public isVector2(): this is Vec2 {
        return this.getType() === EN_GEO_TYPE.VEC_2;
    }

    public isVector3(): this is Vec3 {
        return this.getType() === EN_GEO_TYPE.VEC_3;
    }

    public isLine2d(): this is Ln2 {
        return this.getType() === EN_GEO_TYPE.LN_2;
    }

    public isArc2d(): this is Arc2 {
        return this.getType() === EN_GEO_TYPE.ARC_2;
    }

    public isNurbsCurve2d(): this is NurbsCurve2 {
        return this.getType() === EN_GEO_TYPE.NURBS_CURVE_2D;
    }

    public isOffsetCurve2d(): this is OffsetCurve2 {
        return this.getType() === EN_GEO_TYPE.OFFSET_CURVE_2D;
    }

    public isSmoothPoly2d(): this is SmoothPoly2 {
        return this.getType() === EN_GEO_TYPE.SMOOTHPOLY_2D;
    }

    public isSmoothPoly3d(): this is SmoothPoly3 {
        return this.getType() === EN_GEO_TYPE.SMOOTHPOLY_3D;
    }

    public isLoop(): this is Loop {
        return this.getType() === EN_GEO_TYPE.LOOP;
    }

    public isLine3d(): this is Ln3 {
        return this.getType() === EN_GEO_TYPE.LN_3;
    }

    public isArc3d(): this is Arc3 {
        return this.getType() === EN_GEO_TYPE.ARC_3;
    }

    public isCircle3d(): this is Circle3d {
        return this.getType() === EN_GEO_TYPE.CIRCLE_3;
    }

    public isOffsetCurve3d(): this is OffsetCurve3 {
        return this.getType() === EN_GEO_TYPE.OFFSET_CURVE_3D;
    }

    public isNurbsCurve3d(): this is NurbsCurve3 {
        return this.getType() === EN_GEO_TYPE.NURBS_CURVE_3D;
    }

    public isLine(): this is ILine<Vec> {
        return this.isLine2d() || this.isLine3d();
    }

    public isArc(): this is IArc<Vec> {
        return this.isArc2d() || this.isArc3d();
    }

    public isNurbsCurve(): this is INurbsCurve<Vec> {
        return this.isNurbsCurve2d() || this.isNurbsCurve3d();
    }

    public isOffsetCurve(): this is IOffsetCurve<Vec> {
        return this.isOffsetCurve2d() || this.isOffsetCurve3d();
    }

    public isPlane(): this is Plane {
        return this.getType() === EN_GEO_TYPE.PLANE;
    }

    public isCylinder(): this is Cylinder {
        return this.getType() === EN_GEO_TYPE.CYLINDER;
    }
}
