import { Vec } from './vec';
import { Util } from '../util/util';
import { Tol } from './tol';
import { types } from '../type_define/i_types';
import { MathAssert } from '../util/assert';



/**
 *  AABB包围盒
 */
export abstract class Box<PointType extends Vec> {
    // 右上角的点
    public max: PointType;

    // 左下角的点
    public min: PointType;

    constructor() {
        this.makeEmpty();
    }

    public abstract clone(): Box<PointType>;

    /**
     * 包围盒置空，改变自己
     */
    public abstract makeEmpty(): this;

    /**
     * 包围盒扩展，改变自己
     * @param point
     */
    public abstract expandByPoint(...point: types.IXY[] | PointType[]): this;

    /**
     * 是否包含点
     * @param point
     * @param tolerance
     */
    public abstract containsPt(point: types.IXY | PointType, tolerance: number): boolean;

    /**
     * 计算到点或包围盒的平方距离
     * @param that
     */
    public abstract getSquareDistanceTo(that: types.IXY | PointType | Box<PointType>): number;

    /**
     * 根据传入的中心点和包围盒尺寸重置包围盒，改变自己
     * @param center
     * @param size
     */
    public abstract setFromCenterAndSize(center: types.IXY | PointType, size: types.IXY | PointType): this;

    /**
     * 获取包围盒的角点
     */
    public abstract getCornerPts(): PointType[];

    /**
     * 包围盒扩展，改变自己
     * @param point
     */
    public expandByScalar(scale: number): this {
        this.min.multiply(scale);
        this.max.multiply(scale);
        return this;
    }

    /**
     * 根据传入的点重置包围盒，改变自己
     * @param points
     */
    public setFromPoints(points?: types.IXY[] | PointType[]): this {
        this.makeEmpty();
        if (points) {
            for (const point of points) {
                this.expandByPoint(point);
            }
        }
        return this;
    }

    /**
     * 获取中点
     */
    public getCenter(): PointType {
        if (!this.isValid()) {
            MathAssert.warn(false, 'box is not valid, get centerPt failure');
            return this.min.clone() as PointType;
        }
        return this.min.clone().add(this.max).multiply(0.5) as PointType;
    }

    /**
     * 获取包围盒大小，最大点减去最小点
     */
    public getSize(): PointType {
        return this.max.clone().subtract(this.min) as PointType;
    }

    /**
     * 是否包含包围盒
     * @param box
     * @param eps
     */
    public containsBox(box: Box<PointType>, eps: number = Tol.LENGTH): boolean {
        return this.containsPt(box.min, eps) && this.containsPt(box.max, eps);
    }

    /**
     * 是否和另一个包围盒有交
     * @param box
     * @param tolerance
     */
    public intersectsBox(box: Box<PointType>, tolerance: number = Tol.LENGTH): boolean {
        if (!this.isValid() || !box.isValid()) {
            return false;
        }

        for (let i = 0; i < box.min.data.length; i++) {
            if (
                Util.isNearlySmaller(this.max.data[i], box.min.data[i], tolerance) ||
                Util.isNearlyBigger(this.min.data[i], box.max.data[i], tolerance)
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * 包围盒的合并，改变自己
     * @param box
     */
    public union(box: Box<PointType>): this {
        if (!box.isValid()) {
            return this;
        }

        this.expandByPoint(box.min);
        this.expandByPoint(box.max);
        return this;
    }

    /**
     * 包围盒是否退化，即在x、或y、或z方向长度为0
     */
    public isZeroSizeBox() {
        for (let i = 0; i < this.max.data.length; i++) {
            if (Math.abs(this.max.data[i] - this.min.data[i]) < Tol.NUMBER) {
                return true;
            }
        }
        return true;
    }

    /**
     * 包围盒是否合法，max >= min
     */
    public isValid() {
        for (let i = 0; i < this.max.data.length; i++) {
            if (
                !Number.isFinite(this.min.data[i]) ||
                !Number.isFinite(this.max.data[i]) ||
                Number.isNaN(this.min.data[i]) ||
                Number.isNaN(this.max.data[i])
            ) {
                return false;
            }
            if (Math.abs(this.min.data[i] - this.max.data[i]) < Tol.NUMBER) {
                continue;
            }
            if (this.min.data[i] > this.max.data[i]) {
                return false;
            }
        }
        return true;
    }

    /**
     * 包围盒是否相等
     * @param other
     * @param tol
     */
    public equals(other: Box<PointType>, tol: number = Tol.LENGTH): boolean {
        return this.min.equals(other.min, tol) && this.max.equals(other.max, tol);
    }

    /**
     * 包围盒的平移，改变自己
     * @param offset
     */
    public translate(offset: types.IXY | PointType): this {
        this.min.add(offset);
        this.max.add(offset);
        return this;
    }

    /**
     * 复制，使得自己和另一个包围盒一样大小，改变自己
     * @param another
     */
    public copy(another: Box<PointType>): this {
        this.min.copy(another.min);
        this.max.copy(another.max);
        return this;
    }
}