import { MainModule, PathsD } from "clipper2-wasm/dist/clipper2z";



export interface IPoint {
    x: number;
    y: number;
}

export type Path = IPoint[];
export type Paths = Path[];

const unitData = { "coord": { "_origin": { "_data": [0, 47.52356526273529] }, "_xDir": { "_data": [1, 0] }, "_yDir": { "_data": [0, 1] } }, "udir": { "x": 0.20400000000000001, "y": -0.20400000000000001 }, "vdir": { "x": -0.802, "y": -0.802 }, "gap": { "unit": 0.002, "material": 1 }, "units": [{ "coord": { "_origin": { "_data": [0.001, -0.001] }, "_xDir": { "_data": [1, 0] }, "_yDir": { "_data": [0, 1] } }, "holes": [], "outer": [{ "x": 0, "y": -1.1102230246251565e-16 }, { "x": 0, "y": -0.802 }, { "x": 0.10200000000000001, "y": -0.8019999999999999 }, { "x": 0.10200000000000001, "y": 0 }] }, { "coord": { "_origin": { "_data": [0.10299999999999998, -0.001] }, "_xDir": { "_data": [1, 0] }, "_yDir": { "_data": [0, 1] } }, "holes": [], "outer": [{ "x": 0.10200000000000001, "y": 0 }, { "x": 0.10200000000000009, "y": -0.10200000000000001 }, { "x": 0.904, "y": -0.10200000000000001 }, { "x": 0.9039999999999999, "y": 0 }] }, { "coord": { "_origin": { "_data": [0.10300000000000001, -0.10299999999999998] }, "_xDir": { "_data": [1, 0] }, "_yDir": { "_data": [0, 1] } }, "holes": [], "outer": [{ "x": 0.10200000000000001, "y": -0.10200000000000009 }, { "x": 0.10200000000000001, "y": -0.904 }, { "x": 0.20400000000000001, "y": -0.9039999999999999 }, { "x": 0.20400000000000001, "y": -0.10200000000000001 }] }, { "coord": { "_origin": { "_data": [0.20500000000000002, -0.10300000000000001] }, "_xDir": { "_data": [1, 0] }, "_yDir": { "_data": [0, 1] } }, "holes": [], "outer": [{ "x": 0.20400000000000001, "y": -0.10200000000000001 }, { "x": 0.20400000000000007, "y": -0.20400000000000001 }, { "x": 1.006, "y": -0.20400000000000001 }, { "x": 1.006, "y": -0.10200000000000001 }] }] };

export const allUnits = unitData.units.map(i => i.outer.map(p => ({ x: p.x * 100 + 100, y: p.y * 100 + 100 })));

export const unit = [{ x: 0, y: 0 }, { x: 5, y: 30 }, { x: 65, y: 30 }, { x: 60, y: 0 }];
export const unitBlock = [{ x: 2, y: 2 }, { x: 7, y: 28 }, { x: 63, y: 28 }, { x: 58, y: 2 }];

export function toArray(path: Path, reversed = false) {
    return reversed ? path.reduceRight((ret, pt: IPoint) => {
        ret.push(pt.x, pt.y);
        return ret;
    }, [] as number[]) : path.reduce((ret, pt: IPoint) => {
        ret.push(pt.x, pt.y);
        return ret;
    }, [] as number[]);
}

export function clipBlock(unit: Path, block: Path, bg: Paths, clipperLib: MainModule) {
    const { MakePathD, PathsD, FillRule, IntersectD } = clipperLib;

    const clip = new PathsD();
    bg.forEach(bgPath => {
        clip.push_back(MakePathD(toArray(bgPath)));
    })

    const polyLines = bg.map(bgPath => {
        const polyLine = toArray(bgPath);
        polyLine.push(polyLine[0], polyLine[1]);
        return polyLine;
    })

    const clipLines = new PathsD();
    polyLines.forEach(pl => {
        clipLines.push_back(MakePathD(pl));
    })

    const subject = new PathsD();

    const unitOffseted: number[] = new Array(unit.length * 2);
    const blockHoleOffseted: number[] = new Array(block.length * 2);

    const blockOffseted: number[] = new Array(block.length * 2);

    const bbox = getBBox(unit);

    return (offset: IPoint, onlyEdgeX = true) => {
        for (let i = 0; i < unit.length; i++) {
            unitOffseted[i + i] = unit[i].x + offset.x;
            unitOffseted[i + i + 1] = unit[i].y + offset.y;
        }

        const len = block.length

        for (let i = 0; i < block.length; i++) {
            blockOffseted[i + i] = block[i].x + offset.x;
            blockOffseted[i + i + 1] = block[i].y + offset.y;

            blockHoleOffseted[(len - 1 - i) * 2] = block[i].x + offset.x;
            blockHoleOffseted[(len - 1 - i) * 2 + 1] = block[i].y + offset.y;
        }

        subject.clear();
        subject.push_back(MakePathD(unitOffseted));
        subject.push_back(MakePathD(blockHoleOffseted));
        let isX = false;

        if (onlyEdgeX) {
            const rect = new clipperLib.RectD(bbox.minX + offset.x, bbox.minY + offset.y, bbox.maxX + offset.x, bbox.maxY + offset.y);

            const result = clipperLib.RectClipLinesPathsD(rect, clipLines, 0.001);

            if (result.size() === 0) {
                return undefined;
            }
            rect.delete();
            result.delete();

            isX = true;
        }

        const solution = IntersectD(subject, clip, FillRule.NonZero, 0.001);

        if (solution.size() === 0) {
            return undefined;
        }

        subject.clear();
        subject.push_back(MakePathD(blockOffseted));
        const tile = IntersectD(subject, clip, FillRule.NonZero, 0.001);

        function isFull() {
            if (tile.size() !== 1 || tile.get(0).size() !== block.length) {
                return false;
            }

            if (solution.size() !== 2 || solution.get(0).size() !== unit.length || solution.get(1).size() !== block.length) {
                return false;
            }

            return true;
        }

        const full = isFull();

        return {
            joint: convert(solution, clipperLib),
            tile: convert(tile, clipperLib), isX, isFull: full,
            offset
        }
    }
}


function convert(solution: PathsD, clipper: MainModule) {
    const pathsSize = solution.size();

    // if (pathsSize > 1)
    //     console.log('clockWise:', clipper.IsPositiveD(solution.get(0)), clipper.IsPositiveD(solution.get(1)))

    const ret: Paths = [];
    for (let i = 0; i < pathsSize; i++) {
        const path = solution.get(i);
        const pathSize = path.size();
        const newPath: Path = [];
        for (let j = 0; j < pathSize; j++) {
            newPath.push({ x: path.get(j).x, y: path.get(j).y })
        }

        ret.push(newPath);
    }

    return ret;
}


export function getBBox(bg: IPoint[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    bg.forEach(pt => {
        minX = Math.min(pt.x, minX);
        minY = Math.min(pt.y, minY);
        maxX = Math.max(pt.x, maxX);
        maxY = Math.max(pt.y, maxY);
    });
    return { maxX, minX, maxY, minY };
}