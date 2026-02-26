/**
 * 固定种子的轻量伪随机数生成器（LCG）。
 * 用于性质测试，保证可复现。
 */
export class SeededRng {
    private state: number

    constructor(seed: number) {
        this.state = seed >>> 0
    }

    /** [0, 1) */
    public next() {
        this.state = (1664525 * this.state + 1013904223) >>> 0
        return this.state / 0x100000000
    }

    /** [min, max) */
    public nextRange(min: number, max: number) {
        return min + (max - min) * this.next()
    }
}
