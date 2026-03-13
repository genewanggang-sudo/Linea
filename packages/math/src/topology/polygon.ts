import { types } from '../type_define/i_types';
import { Loop } from './loop';
import { Curve2 } from '../geometry/curve2';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Vec2 } from '../base/vec2';
import { Box2 } from '../base/box2';
import { registerGeo } from '../loader/register_geo';
import { Tol } from '../base/tol';
import { LoopCentroid } from '../algorithm/loop_property/loop-centroid';
import { DiscreteParam } from '../base/discrete_param';
import { Geometry2d } from '../geometry/geometry2d';
import { CurvesX } from '../algorithm/intersect/curves_x';



/**
 * Polygon，可以有多个外环，和多个内环（孔洞）。外环（外轮廓）为逆时针，内环（孔洞）是顺时针环
 */
@registerGeo
class Polygon extends Geometry2d {
    /**
     *  由2点构造一个矩形Loop,逆时针,然后再构造Polygon
     * @param points
     */
    public static createByRectangle(cornerPt1: types.IXY, cornerPt2: types.IXY): Polygon {
        return new Polygon(Loop.createByRectangle(cornerPt1, cornerPt2));
    }

    /**
     * polygonEx合成一个polygon
     * @param polygonExs
     */
    public static fromPolygonEx(polygonExs: Polygon[]) {
        const loops: Loop[] = [];
        polygonExs.forEach(polygon => {
            loops.push(...polygon.getLoops());
        });
        const poly = new Polygon();
        loops.forEach(l => poly.addLoop(l, false));
        return poly;
    }

    // 所有的环
    public readonly loops: Loop[] = [];

    /**
     * 默认构造方法
     */
    constructor();

    /**
     * 多个用点表示的多个环
     */
    constructor(ptsArray: types.IXY[][]);

    /**
     * 多个用点表示的单个环
     */
    constructor(pts: types.IXY[]);

    /**
     * 单个环
     */
    constructor(loop: Loop);

    /**
     * 多个环
     */
    constructor(loops: Loop[]);

    constructor(a?: any) {
        super();

        if (!a) {
            return;
        }

        if (a instanceof Loop) {
            this.addLoop(a);
        }

        if (a instanceof Array && a.length > 0) {
            if (a[0] instanceof Array) {
                const loops = a.map(pts => new Loop(pts));
                this._sortLoopByArea(loops);
                loops.forEach(l => this.addLoop(l, false));
                return;
            }

            if (a[0] instanceof Loop) {
                const loops = [...a];
                this._sortLoopByArea(loops);
                loops.forEach(l => this.addLoop(l, false));
                return;
            }

            if (
                typeof a[0] === 'object' &&
                a[0].x !== undefined &&
                typeof a[0].x === 'number' &&
                a[0].y !== undefined &&
                typeof a[0].y === 'number'
            ) {
                this.addLoop(new Loop(a));
            }
        }
    }

    public getLoops() {
        return this.loops;
    }

    public isEmpty() {
        return this.loops.length < 1;
    }

    public reverse() {
        this.loops.forEach(l => {
            l.reverse();
        });

        return this;
    }

    /**
     * 是否只包含直线
     */
    public isOnlyLines() {
        for (const ce of this.loops) {
            if (!ce.isOnlyLines()) {
                return false;
            }
        }
        return true;
    }

    /**
     * polygon是否合法
     * - 空polygon也合法
     * - 所有的内环都在外环内
     * - 环之间没有交
     * - 内环不能直接包含内环，外环不能直接包含外环，要交替包含
     * @todo 内外环交替包含
     */
    public isValid(tol = new Tol()) {
        if (this.loops.length < 1) {
            return true;
        }

        // 每一个环都是合法环
        for (const loop of this.loops) {
            if (!loop.isValid(tol)) {
                return false;
            }
        }

        if (this.loops.length === 1) {
            if (this.loops[0].isAnticlockwise()) {
                return true;
            }
            return false;
        }

        // 环与环之间的曲线不能相交(TODO...优化性能)
        const boxs = this.loops.map(l => l.getBBox());
        for (let i = 0; i < this.loops.length; i++) {
            for (let j = i + 1; j < this.loops.length; j++) {
                const loop1 = this.loops[i];
                const loop2 = this.loops[j];
                if (!boxs[i].intersectsBox(boxs[j])) {
                    continue;
                }

                for (const curve1 of loop1.getAllCurves()) {
                    for (const curve2 of loop2.getAllCurves()) {
                        if (CurvesX.curve2ds(curve1, curve2, tol).length) {
                            return false;
                        }
                    }
                }
            }
        }

        // 确保内外环交替包含
        // const nestLoops = ILoopsToPolygonExes.getNestedLoops(this.loops, t => t as Loop);
        // for (const nestLoop of nestLoops) {
        //     if (
        //         nestLoop.nesting.some(it => {
        //             const sameDir = it.isCCW === nestLoop.isCCW ? 0 : 1;
        //             return it.level % 2 !== sameDir;
        //         })
        //     ) {
        //         return false;
        //     }
        // }
        return true;
    }

    /**
     * 向polygon中加入环,可以是外环，可以是内环
     * @param loop
     * @param sort 是否需要排序
     * @returns 加入成功返回true，否则返回false
     */
    public addLoop(loop: Loop, sort: boolean = true): boolean {
        this.loops.push(loop);
        if (sort) {
            this._sortLoopByArea(this.loops);
        }
        return true;
    }

    public makeStartEndConnected() {
        this.getLoops().forEach(l => l.makeStartEndConnected());
    }

    /**
     * 删除所有环
     * @returns 加入成功返回true，否则返回false
     */
    public deleteAllLoops(): boolean {
        this.loops.splice(0, this.loops.length);
        return true;
    }

    /**
     * 拷贝所有的曲线
     */
    public copyAllCurves(): Curve2[] {
        const curves: Curve2[] = [];
        this.loops.forEach(loop => {
            curves.push(...loop.copyAllCurves());
        });
        return curves;
    }

    /**
     * 获取所有的曲线
     */
    public getAllCurves(): Curve2[] {
        const curves: Curve2[] = [];
        this.loops.forEach(loop => {
            curves.push(...loop.getAllCurves());
        });
        return curves;
    }

    /**
     * 计算Polygon的面积
     */
    public calcArea(): number {
        let sum = 0;
        for (const loop of this.loops) {
            sum += loop.calcArea();
        }
        return sum;
    }

    // override Geometry
    public getType(): EN_GEO_TYPE.POLYGON {
        return EN_GEO_TYPE.POLYGON;
    }

    public translate(offset: types.IXY): this {
        this.loops.forEach(l => l.translate(offset));
        return this;
    }

    public rotate(angle: number, pivot: types.IXY): this {
        this.loops.forEach(l => l.rotate(angle, pivot));
        return this;
    }

    /**
     *  缩放
     * @param factor 放大因子
     * @param center 缩放中心
     */
    public scale(factor: number, center: types.IXY = Vec2.O()): this {
        this.loops.forEach(loop => loop.scale(factor, center));
        return this;
    }

    public transform(m: types.IMatrix3 | types.numberArrs3X3): this {
        this.loops.forEach(loop => loop.transform(m));
        return this;
    }

    /**
     * 反向，得到一个新的对象
     */
    public reversed(): Polygon {
        return this.clone().reverse();
    }

    /**
     * 矩阵变换，得到变换后的对象
     * @param m
     */
    public transformed(m: types.IMatrix3 | types.numberArrs3X3): Polygon {
        return this.clone().transform(m);
    }

    public getBBox(): Box2 {
        const box = new Box2();
        for (const loop of this.loops) {
            const b = loop.getBBox();
            box.union(b);
        }
        return box;
    }

    /**
     * 提取角点
     */
    public toPaths(): Vec2[][] {
        return this.getLoops().map(l => {
            return l.toPath();
        });
    }

    public dump(): types.IDBPolygon {
        return {
            type: this.getType(),
            data: this.loops.map(loop => loop.dump()),
        };
    }

    public load({ data: dbLoops }: types.IDBPolygon): this {
        const loops = dbLoops.map(db => new Loop().load(db));
        loops.forEach(l => this.addLoop(l, false));
        return this;
    }

    public clone(): Polygon {
        const obj = super.clone() as Polygon;
        obj.loops.forEach((cv, i) => cv.userData = this.loops[i].userData);
        return obj;
    }

    /**
     * 计算形心坐标
     */
    public getCentroidPoint(): Vec2 {
        const allcurves = this.getAllCurves();
        return LoopCentroid.centroidOfLoop(allcurves);
    }

    private _sortLoopByArea(loops: Loop[]) {
        const areaPriorityQueue = loops
            .map(l => {
                return { area: l.calcArea(), loop: l };
            })
            .sort((a, b) => {
                return b.area - a.area;
            });
        for (let i = 0; i < areaPriorityQueue.length; i++) {
            loops[i] = areaPriorityQueue[i].loop;
        }
    }
}

export { Polygon };