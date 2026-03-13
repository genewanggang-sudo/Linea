import { MathAssert } from '../../util/assert';
import { Loop } from '../../topology/loop';
import { Polygon } from '../../topology/polygon';



/**
 * 根据包含关系创建的loop树节点
 */
class LoopTreeNode {
    public children: LoopTreeNode[] = [];

    public data?: Loop;

    public addToChild(node: LoopTreeNode) {
        if (!this.children) {
            this.children = [];
        }

        this.children.push(node);
    }

    public isPolygonValid() {
        // 根节点的子节点都是逆时针
        let antiClock = false;
        if (this.data) {
            antiClock = this.data.isAnticlockwise();
        }
        if (!this.children || this.children.length < 1) {
            return true;
        }
        for (const child of this.children) {
            if (!child.data || antiClock === child.data.isAnticlockwise()) {
                return false;
            }
            if (!child.isPolygonValid()) {
                return false;
            }
        }

        return true;
    }

    /**
     * 转成一个合法的polygon
     */
    public makeValid(isAntiClock: boolean) {
        if (this.data) {
            if (!isAntiClock) {
                this._makeAnticlockwise();
            } else {
                this._makeClockwise();
            }
        }
        if (this.children && this.children.length) {
            this.children.forEach(node => {
                node.makeValid(!isAntiClock);
            });
        }
    }

    /**
     * 搜集所有的loop
     */
    public collectLoops(loops: Loop[]) {
        if (this.data) {
            loops.push(this.data);
        }
        if (this.children && this.children.length) {
            this.children.forEach(node => {
                node.collectLoops(loops);
            });
        }
    }

    /**
     * 搜集所有的loop
     */
    public collectHoles(polygons: Polygon[]) {
        if (this.data) {
            if (!this.data.isAnticlockwise()) {
                const polygon = new Polygon(this.data);
                if (this.children && this.children.length) {
                    this.children.forEach(node => {
                        if (node.data) {
                            MathAssert.assert(node.data.isAnticlockwise());
                            polygon.addLoop(node.data);
                        }
                    });
                }
                polygons.push(polygon);
            }
        }
        if (this.children && this.children.length) {
            this.children.forEach(node => {
                node.collectHoles(polygons);
            });
        }
    }

    /**
     * 搜集所有的PolygonExes
     */
    public collectNewPolygonExes(polygons: Polygon[]) {
        if (this.data) {
            if (this.data.isAnticlockwise()) {
                const polygon = new Polygon(this.data);
                if (this.children && this.children.length) {
                    this.children.forEach(node => {
                        if (node.data) {
                            MathAssert.assert(!node.data.isAnticlockwise());
                            polygon.addLoop(node.data.clone());
                        }
                    });
                }
                polygons.push(polygon);
            }
        }
        if (this.children && this.children.length) {
            this.children.forEach(node => {
                node.collectNewPolygonExes(polygons);
            });
        }
    }

    // 使该环成为顺时针
    private _makeClockwise() {
        if (this.data) {
            if (this.data.isAnticlockwise()) {
                this.data.reverse();
            }
        } else if (this.children && this.children.length) {
            this.children.forEach(node => {
                if (node.data) {
                    if (node.data.isAnticlockwise()) {
                        node.data.reverse();
                    }
                }
            });
        }
    }

    // 使该环成为逆时针
    private _makeAnticlockwise() {
        if (this.data) {
            if (!this.data.isAnticlockwise()) {
                this.data.reverse();
            }
        } else if (this.children && this.children.length) {
            this.children.forEach(node => {
                if (node.data) {
                    if (!node.data.isAnticlockwise()) {
                        node.data.reverse();
                    }
                }
            });
        }
    }
}

export { LoopTreeNode };