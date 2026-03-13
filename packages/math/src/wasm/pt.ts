export interface TPt {
    tag: number;
    x: number;
    y: number;
}



export interface IP2D {
    x: number;
    y: number;
}

export class P2D {
    x: number;
    y: number;

    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }
    clone(): P2D {
        return new P2D(this.x, this.y);
    }

    dot(input: IP2D | undefined = undefined): number {
        if (input) {
            return this.x * input.x + this.y * input.y;
        }
        return this.x * this.x + this.y * this.y;
    }

    length() {
        return Math.sqrt(this.dot());
    }

    normalize(): P2D {
        let len = this.length();
        this.x /= len;
        this.y /= len;
        return this;
    }

    normal(): P2D {
        let c = -this.y;
        this.y = this.x;
        this.x = c;
        return this;
    }
}