import { Interval } from '../../src/curves/interval'
import { PeriodInterval } from '../../src/curves/period_interval'

/**
 * 采样参数域：
 * - 覆盖端点
 * - 覆盖端点附近
 * - 覆盖均匀内点
 * - 周期区间额外覆盖拼接点附近
 */
export function sampleParams(range: Interval, count = 8, eps = 1e-9) {
    const s = range.start
    const e = range.end
    const ret = new Set<number>([s, e])

    if (e - s > eps) {
        ret.add(s + eps)
        ret.add(e - eps)
    }

    for (let i = 1; i < count; i++) {
        ret.add(s + ((e - s) * i) / count)
    }

    if (range instanceof PeriodInterval && Math.abs(range.length() - range.period) <= eps) {
        ret.add(range.normalizeInPeriod(s - eps, s))
        ret.add(range.normalizeInPeriod(e + eps, s))
    }

    return [...ret].sort((a, b) => a - b)
}
