/* eslint-disable no-console */
// eslint-disable-next-line spaced-comment
/// <reference path='./libtess.js.d.ts' />
// const libtess = require('libtess');
import libtess from 'libtess';


// 开始离散的回调函数
function begincallback(type: number): void {
    if (type !== libtess.primitiveType.GL_TRIANGLES) {
        console.log(`expected TRIANGLES but got type: ${type}`);
    }
}

// 离散时出现错误的回调函数
function errorcallback(error: string): void {
    console.error('error callback');
    console.error(`error number: ${error}`);
}

// 初始化
function initTesselator(): any {
    // function called for each vertex of tesselator output
    function vertexCallback(data: any, polyVertArray: any[]): void {
        polyVertArray.push(data);
    }
    // callback for when segments intersect and must be split
    function combinecallback(coords: any[], data: any, weight: any): any[] {
        // console.log('combine callback');
        return [coords[0], coords[1], coords[2]];
    }
    function edgeCallback(flag: any): void {
        // don't really care about the flag, but need no-strip/no-fan behavior
        // console.log('edge flag: ' + flag);
    }

    const tessy = new libtess.GluTesselator();
    // tessy.gluTessProperty(libtess.gluEnum.GLU_TESS_WINDING_RULE, libtess.windingRule.GLU_TESS_WINDING_POSITIVE);
    tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_VERTEX_DATA, vertexCallback);
    tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_BEGIN, begincallback);
    tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_ERROR, errorcallback);
    tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_COMBINE, combinecallback);
    tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_EDGE_FLAG, edgeCallback);

    return tessy;
}

export function tessTriangulate(contours: number[][][], normal: number[]): number[][] {
    const tessy = initTesselator();
    // libtess will take 3d verts and flatten to a plane for tesselation
    // since only doing 2d tesselation here, provide z=1 normal to skip
    // iterating over verts only to get the same answer.
    // comment out to test normal-generation code
    // tessy.gluTessNormal(0, 0, 1);
    tessy.gluTessNormal(normal[0], normal[1], normal[2]);

    const triangleVerts: any[] = [];
    tessy.gluTessBeginPolygon(triangleVerts);

    for (const contour of contours) {
        tessy.gluTessBeginContour();
        for (const coords of contour) {
            tessy.gluTessVertex(coords, coords);
        }
        tessy.gluTessEndContour();
    }

    // finish polygon (and time triangulation process)
    tessy.gluTessEndPolygon();
    return triangleVerts;
}

/**
 * Represent a vertex with index, internally used to improve performance.
 */
export class LibtessVertex extends Array<number> {
    public index: number;

    constructor(v: { x: number; y: number; z?: number }, idx: number) {
        super();
        this.push(v.x);
        this.push(v.y);
        this.push(v.z ? v.z : 0);
        this.index = idx;
    }
}