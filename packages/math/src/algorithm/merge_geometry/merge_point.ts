export class Disjoint {
    public set: number[];



    constructor() {
        this.set = [];
    }

    public clear() {
        this.set.length = 0;
    }

    public find(a: number): number {
        while (this.set.length <= a) {
            this.set.push(this.set.length);
        }
        if (a === this.set[a]) {
            return a;
        }
        // eslint-disable-next-line no-return-assign
        return (this.set[a] = this.find(this.set[a])); // ?????
    }

    public merge(a: number, b: number) {
        if (a < 0 || b < 0) return;
        const _a = this.find(a);
        const _b = this.find(b);
        if (_a < _b) {
            this.set[_b] = _a;
        } else {
            this.set[_a] = _b;
        }
    }
}

export class MergePoint {
    private _tmp: number[][];

    private _disjoint: Disjoint;

    constructor() {
        this._tmp = [[], [], []];
        this._disjoint = new Disjoint();
    }

    public clear() {
        this._disjoint.clear();
    }

    public merge(points: ([number, number] | [number, number, number])[], tol: number = 1e-6) {
        if (points.length === 0) return { index: [], points: [] };
        const dim = points[0].length - 1;
        const index: number[] = [];
        for (let i = 0; i < points.length; ++i) index.push(i);
        this.clear();
        index.sort((a: number, b: number): number => {
            return points[a][dim] - points[b][dim];
        });
        this._mergeex(points, index, 0, index.length, dim, tol);
        const result: ([number, number] | [number, number, number])[] = [];
        for (let i = 0; i < points.length; ++i) {
            if (this._disjoint.find(i) !== i) index[i] = index[this._disjoint.find(i)];
            else {
                index[i] = result.length;
                result.push(points[i]);
            }
        }
        return { index, points: result };
    }

    private _mergeex(
        points: ([number, number] | [number, number, number])[],
        index: number[],
        l: number,
        r: number,
        dim: number,
        tol: number,
    ) {
        if (r - l < 2) return;
        if (dim) {
            const mid = (r + l) >> 1;
            const midx = points[index[mid]][dim];
            this._mergeex(points, index, l, mid, dim, tol);
            this._mergeex(points, index, mid, r, dim, tol);
            const nums = this._tmp[dim];
            nums.length = 0;
            for (let i = l; i < r; ++i) {
                if (Math.abs(points[index[i]][dim] - midx) > tol) continue;
                nums.push(index[i]);
            }
            // eslint-disable-next-line camelcase
            const dim_1 = dim - 1;
            nums.sort((a: number, b: number): number => {
                return points[a][dim_1] - points[b][dim_1];
            });
            this._mergeex(points, nums, 0, nums.length, dim_1, tol);
        } else {
            for (let i = 1; i < index.length; ++i) {
                const tmp1 = points[this._disjoint.find(index[i])][0];
                const tmp2 = points[this._disjoint.find(index[i - 1])][0];
                if (Math.abs(tmp1 - tmp2) > tol) {
                    continue;
                }
                this._disjoint.merge(index[i], index[i - 1]);
            }
        }
    }
}