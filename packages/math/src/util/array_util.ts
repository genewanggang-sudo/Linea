export class ArrayUtil {
    /**
     * 给定增序数组，进行二分查找，找到最小包含 t 的区间，并返回区间的序号
     * @param ts
     * @param t
     */
    public static binarySearch(ts: number[], t: number): number {
        let st = 0;
        let ed = ts.length - 1;
        while (ed > st + 1) {
            const mid = Math.floor((st + ed) / 2);
            if (ts[mid] > t) {
                ed = mid;
            } else {
                st = mid;
            }
        }
        while (st > 0 && ts[st - 1] === t) st--;
        return st;
    }
}