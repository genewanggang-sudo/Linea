import { PtLoopPJ } from '../pj/pt_loop_pj';
import { PtLoopPJType } from '../pj/pj_type';
import { Loop } from '../../topology/loop';
import { Vec2 } from '../../base/vec2';
import { MathAssert } from '../../util/assert';
import { SmoothPoly2 } from '../..';



interface INestedLoop {
    loop: ILoop; // 当前环
    nesting: INestedLoop[]; // 被当前环所包含的所有子环.
    level: number; // 环的嵌套层级. 最外面是0，往里面依次递增
    isCCW: boolean; // 逆时针标记
}

interface ILoop {
    reverse(): any;
}

/**
 * Polygon变成PolygonEx
 */
export class ILoopsToPolygonExes {
    /**
     * 根据Polygon内部环的嵌套包含关系，将Polygon拆分成polygonEx
     * 条件：Polygon环之间不相交
     * @param polygon
     * @param keepPositive 是否保持结果都是正向的（外环逆时针，内环顺时针）
     * @param considerLoopDir 是否考虑环之间的相对方向(如果不考虑，则会将所有的直接子环作为内环，如果考虑，则只会将方向相反的直接子环作为内环)
     * @param convertToLoop 转换成Loop的方法
     */
    public static execute<T>(
        polygon: ILoop[],
        keepPositive: boolean,
        considerLoopDir: boolean = false,
        convertToLoop = (iLoop: T) => {
            MathAssert.assert(iLoop instanceof Loop, '请添加该参数');
            return iLoop as any as Loop;
        },
    ): T[][] {
        if (!polygon.length) {
            return [];
        }

        const newFaces: INestedLoop[][] = [];
        const nestedLoops = this.getNestedLoops(polygon, convertToLoop as any);
        const usedLoopMap = new Map<ILoop, boolean>();
        polygon.forEach(loop => usedLoopMap.set(loop, false));
        for (const nestedLoop of nestedLoops) {
            if (nestedLoop.level === 0) {
                this.createFaces(nestedLoop, considerLoopDir, usedLoopMap, newFaces);
            }
        }

        return newFaces.map(loops =>
            loops.map((nl, idx) => {
                if (keepPositive) {
                    if (nl.isCCW) {
                        if (idx !== 0) {
                            nl.loop.reverse();
                        }
                    } else if (idx === 0) {
                        nl.loop.reverse();
                    }
                }
                return nl.loop as any as T;
            }),
        );
    }

    public static getNestedLoops(loops: ILoop[], convertToLoop: (iLoop: ILoop) => Loop): INestedLoop[] {
        // 将iloop转成真正的loop
        const iLoopToLoopMap: Map<ILoop, Loop> = new Map();
        loops.forEach(l => iLoopToLoopMap.set(l, convertToLoop(l)));

        const nestLoops: INestedLoop[] = loops.map(loop => {
            return {
                loop,
                nesting: [],
                level: 0,
                isCCW: iLoopToLoopMap.get(loop)!.isAnticlockwise(),
            } as INestedLoop;
        });
        for (let i = 0; i < nestLoops.length; ++i) {
            const theNestLoop = nestLoops[i];
            for (let j = 0; j < nestLoops.length; ++j) {
                if (i === j) {
                    continue;
                }
                const otherNestLoop = nestLoops[j];
                if (
                    this._loopContainsLoop(
                        iLoopToLoopMap.get(theNestLoop.loop)!,
                        iLoopToLoopMap.get(otherNestLoop.loop)!,
                    )
                ) {
                    theNestLoop.nesting.push(otherNestLoop);
                    otherNestLoop.level++;
                }
            }
        }

        for (const nestloop of nestLoops) {
            nestloop.nesting.sort(
                (nestLoop1: INestedLoop, nestLoop2: INestedLoop) => nestLoop1.level - nestLoop2.level,
            );
        }

        return nestLoops.filter(l => l.level === 0);
    }

    public static createFaces(
        nestedLoop: INestedLoop,
        considerLoopDir: boolean,
        usedLoopMap: Map<ILoop, boolean>,
        newFaces: INestedLoop[][],
    ): void {
        const loop = nestedLoop.loop;
        const newFace = [nestedLoop];
        newFaces.push(newFace);

        usedLoopMap.set(loop, true);
        let preLevel = -1;
        let relativeLevel = 0;

        for (const child of nestedLoop.nesting) {
            if (child.level > preLevel) {
                preLevel = child.level;
                relativeLevel++;
            }
            if (usedLoopMap.get(child.loop)) {
                continue;
            }
            if (relativeLevel === 2) {
                this.createFaces(child, considerLoopDir, usedLoopMap, newFaces);
            } else if (relativeLevel === 1) {
                if (considerLoopDir) {
                    if (child.isCCW !== nestedLoop.isCCW) {
                        newFace.push(child);
                        usedLoopMap.set(child.loop, true);
                    } else {
                        this.createFaces(child, considerLoopDir, usedLoopMap, newFaces);
                    }
                } else {
                    newFace.push(child);
                    usedLoopMap.set(child.loop, true);
                }
            }
        }
    }

    // 简易版的环包含关系判断，适用于环不相交的情况
    private static _loopContainsLoop(loop: Loop, other: Loop) {
        // 随机获取三个采样点
        let polygonPts: Vec2[] = other.getAllCurves().map(_ => _.getMidPt());
        polygonPts.sort(() => 0.5 - Math.random());
        polygonPts = polygonPts.slice(0, Math.min(3, polygonPts.length));

        // 支持smoothpoly2d
        let newLoop = loop;
        if (loop.getAllCurves().some(c => c instanceof SmoothPoly2)) {
            const curves = loop
                .getAllCurves()
                .map(c => {
                    if (c instanceof SmoothPoly2) {
                        return c.getSegments();
                    }
                    return [c];
                })
                .flat();
            newLoop = new Loop(curves);
        }

        // 检测是否包含该采样点
        for (const point of polygonPts) {
            const pos = PtLoopPJ.execute(point, newLoop);
            if (pos.type !== PtLoopPJType.IN) {
                return false;
            }
        }
        return true;
    }
}