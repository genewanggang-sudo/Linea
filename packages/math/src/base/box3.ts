import { Box } from './box';
import { Vec3 } from './vec3';
import { types } from '../type_define/i_types';
import { Interval } from './interval';
import { Tol } from './tol';



/**
 * 三维AABB包围盒
 */
class Box3 extends Box<Vec3> {
    constructor(points?: types.IXYZ[]) {
        super();
        this.setFromPoints(points);
    }

    public makeEmpty(): this {
        if (!this.min) {
            this.min = new Vec3(Infinity, Infinity, Infinity);
        } else {
            this.min.x = Infinity;
            this.min.y = Infinity;
            this.min.z = Infinity;
        }
        if (!this.max) {
            this.max = new Vec3(-Infinity, -Infinity, -Infinity);
        } else {
            this.max.x = -Infinity;
            this.max.y = -Infinity;
            this.max.z = -Infinity;
        }
        return this;
    }

    /**
     * 前四个点为底面角点，后四个为顶面角点，点顺序为逆时针（从上往下看）
     */
    public getCornerPts(): Vec3[] {
        if (!this.isValid()) {
            return [];
        }
        const size = this.getSize();

        const p0 = this.min.clone();
        const p1 = this.min.clone();
        p1.x += size.x;

        const p2 = p1.clone();
        p2.y += size.y;
        const p3 = p0.clone();
        p3.y += size.y;

        const p4 = p0.clone();
        const p5 = p1.clone();
        const p6 = p2.clone();
        const p7 = p3.clone();
        [p4, p5, p6, p7].forEach(p => {
            p.z += size.z;
        });

        return [p0, p1, p2, p3, p4, p5, p6, p7];
    }

    public expandByPoint(...points: types.IXYZ[]): this {
        const mi = this.min.data;
        const ma = this.max.data;

        for (const point of points) {
            const p = point instanceof Vec3 ? point.data : [point.x, point.y, point.z];
            if (p[0] < mi[0]) mi[0] = p[0];
            if (p[1] < mi[1]) mi[1] = p[1];
            if (p[2] < mi[2]) mi[2] = p[2];
            if (p[0] > ma[0]) ma[0] = p[0];
            if (p[1] > ma[1]) ma[1] = p[1];
            if (p[2] > ma[2]) ma[2] = p[2];
        }
        return this;
    }

    public containsPt(point: types.IXYZ, tolerance: number = Tol.LENGTH): boolean {
        if (!this.isValid()) {
            return false;
        }
        const t = tolerance;
        const { data } = new Vec3(point);
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

    public getSquareDistanceTo(that: types.IXYZ | Box3): number {
        const minPt0 = this.min;
        const maxPt0 = this.max;
        const [minPt1, maxPt1] = that instanceof Box3 ? [that.min, that.max] : [that, that];

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

        if (maxPt1.z < minPt0.z) {
            const d = minPt0.z - maxPt1.z;
            sqrDist += d * d;
        } else if (minPt1.z > maxPt0.z) {
            const d = minPt1.z - maxPt0.z;
            sqrDist += d * d;
        }

        return sqrDist;
    }

    public setFromCenterAndSize(center: types.IXYZ, size: types.IXYZ): this {
        const halfSize = new Vec3(size).multiply(0.5);
        this.max = new Vec3(center).add(halfSize);
        this.min = new Vec3(center).subtract(halfSize);

        return this;
    }

    public clone(): Box3 {
        return new Box3([this.min, this.max]);
    }
}

export { Box3 };