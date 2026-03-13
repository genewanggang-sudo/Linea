import { Util, Tol, Vec3 } from '../../../..';



class OctreeNode<T> {
    public origin: Vec3;

    public halfL: number;

    public depth: number;

    public children: OctreeNode<T>[];

    public objects: T[];

    private _boundCache: Vec3[][];

    private _lengthEps: number;

    constructor(origin: Vec3, halfLength: number, depth: number = 1, lengthEps: number = Tol.LENGTH) {
        this.origin = origin;
        this.halfL = halfLength;
        this.depth = depth;
        this.objects = [];
        this.children = [];
        this._boundCache = [];
        this._lengthEps = lengthEps;
    }

    public getOverlaps(objBound: Vec3[], res: T[]) {
        if (!this._intersect(objBound)) {
            return;
        }
        res.push(...this.objects);
        this.children.forEach(child => child.getOverlaps(objBound, res));
    }

    public getObjects() {
        return this.objects;
    }

    public getObjectsRecursive() {
        const res = this.objects.slice();
        this.children.forEach(child => child.getObjectsRecursive().forEach(it => res.push(it)));
        return res;
    }

    public add(obj: T, objBound: Vec3[], maxDepth: number, indexMap: Map<T, number[]>): number[] {
        if (this.depth >= maxDepth) {
            this._add(obj);
            return [-1];
        }

        if (this.children.length === 0) {
            // 默认空间内对象数小于20个，暂时不细分
            if (this.objects.length < 20) {
                this._add(obj);
                this._boundCache.push(objBound);
                return [-1];
            }

            // 拆分空间，并重新分配
            const tmpObjects = this.objects.slice();
            const tmpBoundsCache = this._boundCache.slice();
            this._subdivide();
            if (tmpObjects.length) {
                this.objects = [];
                this._boundCache = [];
                tmpObjects.forEach((o, index) => {
                    const oldIds = indexMap.get(o)!;
                    oldIds.pop();
                    indexMap.delete(o);
                    const ids = this.add(o, tmpBoundsCache[index], maxDepth, indexMap);
                    indexMap.set(o, [...oldIds, ...ids]);
                });
            }
            return this.add(obj, objBound, maxDepth, indexMap);
        }

        // 放入八个子空间中
        let childId: number | undefined;
        const childIds = objBound.map(pt => this._getQuadrant(pt));
        if (childIds.length && childIds.every(it => it === childIds[0])) {
            childId = childIds[0];
        }
        if (childId !== undefined) {
            const ids = this.children[childId].add(obj, objBound, maxDepth, indexMap);
            return [childId, ...ids];
        }
        this._add(obj);
        return [-1];
    }

    public remove(obj: T, objBound: Vec3[]) {
        if (!this._intersect(objBound)) {
            return;
        }
        const index = this.objects.findIndex(it => it === obj);
        if (index > -1) {
            this.objects.splice(index, 1);
        } else {
            this.children.forEach(child => child.remove(obj, objBound));
        }
    }

    private _add(obj: T) {
        this.objects.push(obj);
    }

    private _getQuadrant(pt: Vec3) {
        const x = Util.isNearlySmallerOrEqual(pt.x - this.origin.x, 0, this._lengthEps) ? 0 : 1;
        const y = Util.isNearlySmallerOrEqual(pt.y - this.origin.y, 0, this._lengthEps) ? 0 : 1;
        const z = Util.isNearlySmallerOrEqual(pt.z - this.origin.z, 0, this._lengthEps) ? 0 : 1;
        return z * 4 + y * 2 + x;
    }

    private _containPoint(pt: Vec3) {
        const diffX = pt.x - this.origin.x;
        const diffY = pt.y - this.origin.y;
        const diffZ = pt.z - this.origin.z;
        return (
            Util.isNearlySmallerOrEqual(Math.abs(diffX), this.halfL, this._lengthEps) &&
            Util.isNearlySmallerOrEqual(Math.abs(diffY), this.halfL, this._lengthEps) &&
            Util.isNearlySmallerOrEqual(Math.abs(diffZ), this.halfL, this._lengthEps)
        );
    }

    private _intersect(objBound: Vec3[]): boolean {
        if (!objBound.length) {
            return false;
        }
        if (objBound.length === 1) {
            return this._containPoint(objBound[0]);
        }
        const max = this.origin.added(new Vec3(this.halfL, this.halfL, this.halfL));
        const min = this.origin.added(new Vec3(-this.halfL, -this.halfL, -this.halfL));
        for (let i = 0; i < objBound[0].data.length; i++) {
            if (
                Util.isNearlySmaller(max.data[i], objBound[0].data[i], this._lengthEps) ||
                Util.isNearlyBigger(min.data[i], objBound[objBound.length - 1].data[i], this._lengthEps)
            ) {
                return false;
            }
        }

        return true;
    }

    private _subdivide() {
        const halfL = this.halfL * 0.5;
        const depth = this.depth + 1;
        for (let index = 0; index < 8; index++) {
            const xFlag = index & 0b001 ? 1 : -1;
            const yFlag = index & 0b010 ? 1 : -1;
            const zFlag = index & 0b100 ? 1 : -1;
            const childOrigin = this.origin.added(new Vec3(xFlag * halfL, yFlag * halfL, zFlag * halfL));
            this.children.push(new OctreeNode(childOrigin, halfL, depth));
        }
    }
}

export class Octree<T> {
    private _root: OctreeNode<T>;

    private _getBound: (t: T) => Vec3[];

    private _maxDepth: number;

    private _objectIndexMap: Map<T, number[]>;

    constructor(
        objs: T[],
        getBound: (t: T) => Vec3[],
        origin: Vec3 = Vec3.O(),
        halfLength: number = 0.5e6,
        maxDepth = 10,
    ) {
        this._root = new OctreeNode(origin, halfLength);
        this._getBound = getBound;
        this._maxDepth = maxDepth;
        this._objectIndexMap = new Map();
        objs.forEach(obj => {
            const index = this._root.add(obj, this._getBound(obj), this._maxDepth, this._objectIndexMap);
            this._objectIndexMap.set(obj, index);
        });
    }

    public getCandidateOverlaps(obj: T, objBound?: Vec3[]): T[] {
        const ids = this._objectIndexMap.get(obj);
        if (ids) {
            // 如果该对象已经在树中，直接从index获取
            const res: T[] = [];
            let node = this._root;
            for (const id of ids) {
                if (id > -1) {
                    node.getObjects().forEach(it => res.push(it));
                    node = node.children[id];
                } else {
                    node.getObjectsRecursive().forEach(it => res.push(it));
                    break;
                }
            }
            return res;
        }
        // 通过空间位置关系获取
        const bound = objBound || this._getBound(obj);
        const overlaps: T[] = [];
        this._root.getOverlaps(bound, overlaps);
        return overlaps;
    }

    public remove(objs: T[]) {
        objs.forEach(it => this._root.remove(it, this._getBound(it)));
    }

    public add(obj: T, objBound?: Vec3[]) {
        const bound = objBound || this._getBound(obj);
        const index = this._root.add(obj, bound, this._maxDepth, this._objectIndexMap);
        this._objectIndexMap.set(obj, index);
    }
}