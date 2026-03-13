export class Plurality {
    public a: number;



    public b: number;

    constructor(a: number, b: number) {
        this.a = a;
        this.b = b;
    }

    public added(another: Plurality) {
        return new Plurality(this.a + another.a, this.b + another.b);
    }

    public subed(another: Plurality) {
        return new Plurality(this.a - another.a, this.b - another.b);
    }

    public scaled(s: number) {
        return new Plurality(this.a * s, this.b * s);
    }

    public multiplied(another: Plurality) {
        const real = this.a * another.a - this.b * another.b;
        const virtual = this.a * another.b + this.b * another.a;
        return new Plurality(real, virtual);
    }
}