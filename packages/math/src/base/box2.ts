import { Box } from './box';
import { Vec2 } from './vec2';
import { types } from '../type_define/i_types';
import { Interval } from './interval';
import { Tol } from './tol';



/**
 * 二维AABB包围盒
 */
class Box2 extends Box<Vec2> {
    constructor(points?: types.IXY[]) {
        super();
        this.setFromPoints(points);
    }

    public makeEmpty(): this {
        if (!this.min) {
            this.min = new Vec2(Infinity, Infinity);
        } else {
            this.min.x = Infinity;
            this.min.y = Infinity;
        }
        if (!this.max) {
            this.max = new Vec2(-Infinity, -Infinity);
        } else {
            this.max.x = -Infinity;
            this.max.y = -Infinity;
        }
        return this;
    }

    public getCornerPts(): Vec2[] {
        return [this.min, new Vec2(this.max.x, this.min.y), this.max, new Vec2(this.min.x, this.max.y)];
    }

    public expandByPoint(...points: types.IXY[]): this {
        const mi = this.min.data;
        const ma = this.max.data;

        for (const point of points) {
            const p = point instanceof Vec2 ? point.data : [point.x, point.y];
            if (p[0] < mi[0]) mi[0] = p[0];
            if (p[1] < mi[1]) mi[1] = p[1];
            if (p[0] > ma[0]) ma[0] = p[0];
            if (p[1] > ma[1]) ma[1] = p[1];
        }
        return this;
    }

    public containsPt(point: types.IXY, tolerance: number = Tol.LENGTH): boolean {
        if (!this.isValid()) {
            return false;
        }
        const t = tolerance;
        const { data } = new Vec2(point);
        const minData = this.min.data;
        const maxData = this.max.data;

        for (let i = 0; i < minData.length; i++) {
            const range = new Interval(minData[i], maxData[i]);
            if (!range.containsPt(data[i], t)) {
                return false;
            }
        }
        return true;
    }

    public getSquareDistanceTo(that: types.IXY | Box2): number {
        const minPt0 = this.min;
        const maxPt0 = this.max;
        const [minPt1, maxPt1] = that instanceof Box2 ? [that.min, that.max] : [that, that];

        let sqrDist = 0;
        if (maxPt1.x < minPt0.x) {
            const d = minPt0.x - maxPt1.x;
            sqrDist += d * d;
        } else if (minPt1.x > maxPt0.x) {
            const d = minPt1.x - maxPt0.x;
            sqrDist += d * d;
        }

        if (maxPt1.y < minPt0.y) {
            const d = minPt0.y - maxPt1.y;
            sqrDist += d * d;
        } else if (minPt1.y > maxPt0.y) {
            const d = minPt1.y - maxPt0.y;
            sqrDist += d * d;
        }

        return sqrDist;
    }

    public setFromCenterAndSize(center: types.IXY, size: types.IXY): this {
        const halfSize = new Vec2(size).multiply(0.5);

        this.max = new Vec2(center).add(halfSize);
        this.min = new Vec2(center).subtract(halfSize);

        return this;
    }

    public clone(): Box2 {
        return new Box2([this.min, this.max]);
    }
}

export { Box2 };