import { Curve2 } from '../geometry/curve2';
import { PolyCurve } from './polycurve';
import { types } from '../type_define/i_types';
import { Vec2 } from '../base/vec2';
import { Ln2 } from '../geometry/ln2';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Tol } from '../base/tol';
import { DiscreteParam } from '../base/discrete_param';



/**
 * 环，封闭且无自交的曲线序列
 */
@registerGeo
export class Loop extends PolyCurve {
    /**
     *  由2点构造一个矩形Loop,逆时针
     * @param points
     */
    public static createByRectangle(cornerPt1: types.IXY, cornerPt2: types.IXY): Loop {
        let minX;
        let minY;
        let maxX;
        let maxY;

        if (cornerPt1.x > cornerPt2.x) {
            minX = cornerPt2.x;
            maxX = cornerPt1.x;
        } else {
            minX = cornerPt1.x;
            maxX = cornerPt2.x;
        }

        if (cornerPt1.y > cornerPt2.y) {
            minY = cornerPt2.y;
            maxY = cornerPt1.y;
        } else {
            minY = cornerPt1.y;
            maxY = cornerPt2.y;
        }

        const pts = [
            new Vec2(minX, minY),
            new Vec2(maxX, minY),
            new Vec2(maxX, maxY),
            new Vec2(minX, maxY),
        ];

        return new Loop(pts);
    }

    /**
     *  由一系列点构造Polyline
     * @param points
     */
    constructor(points?: types.IXY[]);

    /**
     *  由一系列点构造Polyline
     * @param points
     */
    constructor(curves?: Curve2[]);

    /**
     *  由一系列点构造Polyline
     * @param params
     */
    constructor(params?: (types.IXY | Curve2)[]) {
        super();

        if (params && params.length > 0) {
            if (!(params[0] instanceof Curve2)) {
                for (let i = 0; i < params.length; i++) {
                    if (!new Vec2(params[i] as types.IXY).equals(params[(i + 1) % params.length] as types.IXY)) {
                        this.addCurve(new Ln2(params[i] as types.IXY, params[(i + 1) % params.length] as types.IXY));
                    }
                }
            } else {
                params.forEach(p => this.addCurve(p as Curve2));
            }
        }
    }

    /**
     * 判断环是否封闭
     */
    public isClosed(tol = new Tol()): boolean {
        const curves = this._curves;
        const len = curves.length;
        for (let i = 0; i < len; i++) {
            const prevIndex = i - 1 < 0 ? i - 1 + len : i - 1;
            const isConnect = curves[i].getStartPt().equals(curves[prevIndex].getEndPt(), tol.lengthEps);
            if (!isConnect) {
                return false;
            }
        }

        return true;
    }

    /**
     * @todo 计算有没有自交
     *  环是否合法，封闭且无自交
     */
    public isValid(tol = new Tol()): boolean {
        if (!super.isValid(tol)) {
            return false;
        }

        const { length } = this._curves;
        if (length <= 0) {
            return false;
        }

        // 首尾封闭
        return this._curves[0].getStartPt().equals(this._curves[this._curves.length - 1].getEndPt(), tol.edgeLengthEps);
    }

    /**
     * 提取所有直线/曲线的角点（或者说轮廓点），如果是曲线，可以用离散精度控制点的疏密程度
     * @param params 对于曲线有用，控制曲线轮廓点的疏密程度
     */
    public toPath(params = DiscreteParam.NORMAL): Vec2[] {
        const pts: Vec2[] = [];
        this._curves.forEach(cv => {
            if (!cv.isLine2d()) {
                const discreatePts = cv.discrete(params);
                discreatePts.pop();
                pts.push(...discreatePts);
            } else {
                pts.push(cv.getStartPt());
            }
        });
        return pts;
    }

    /**
     * 获取所有直线/曲线的端点
     */
    public getAllPoints(): Vec2[] {
        const pts: Vec2[] = [];
        this._curves.forEach(cv => {
            pts.push(cv.getStartPt());
        });
        return pts;
    }

    // override Geometry
    public getType(): EN_GEO_TYPE.LOOP {
        return EN_GEO_TYPE.LOOP;
    }

    public dump(): types.IDBLoop {
        return super.dump() as any;
    }

    public load(db: types.IDBLoop): this {
        return super.load(db) as any;
    }

    public clone(): Loop {
        return super.clone() as any;
    }

    public makeStartEndConnected(): this {
        super.makeStartEndConnected(true);
        return this;
    }
}