import { MainModule, Paths64 } from "clipper2-wasm/dist/clipper2z";
import { IPoint, Path, Paths } from "./pave";
import { Point, applyMatrixToPt, inv, multiplyMatrix } from "./math";
import { getBBox } from "./math";
import { convert2Js } from "./math";
import { toArray } from "./math";
import { addPolyPathToResult } from "./math";
import { IPavePattern, IPolygon } from "./pattern_util";
import { Clipper2Util, Loop, types } from "../..";
import _ from "lodash";



export class Pattern {
    private precise = 1000000000;
    private recOffset = 1000;
    private jointOffset = 10; // 砖缝扩展，保证砖缝外部区域合并轮廓后不分断
    private _clip: Paths64;
    private _clipLines: Paths64;
    private _unitJoints: Paths64;
    private _unitsBlock: Paths64[];
    private _holes: Paths64;

    private _unitRect: {
        right: number;
        left: number;
        bottom: number;
        top: number;
    };
    private _unitsPaths: Path[];
    private _bgRects: {
        top: number;
        left: number;
        right: number;
        bottom: number;
    }[] = [];

    public patternData: IPavePattern;
    private _clipper: MainModule;
    private _enableGap: boolean = true;

    constructor(
        patternData: IPavePattern,
        background: IPolygon,
        enableGap: boolean = true,
    ) {
        this._clipper = Clipper2Util.clipper2Z;

        this.patternData = _.cloneDeep(patternData);
        this.patternData.coord.setOrigin(
            this.patternData.coord.getOrigin().multiply(this.precise)
        );

        this.patternData.udir.x *= this.precise;
        this.patternData.udir.y *= this.precise;
        this.patternData.vdir.x *= this.precise;
        this.patternData.vdir.y *= this.precise;
        this.patternData.gap.unit *= this.precise;
        this._enableGap = enableGap && this.patternData.gap.unit !== 0;

        const rotate = [
            [...patternData.coord.getDx().data, 0],
            [...patternData.coord.getDy().data, 0],
            [0, 0, 1],
        ];
        let patternUnits = patternData.units.map(unit => {
            return {
                outer: new Loop(unit.outer).toPath() as IPoint[],
                holes: [],
            }
        })

        patternUnits.forEach(unit => {
            unit.outer = unit.outer.map(pt => applyMatrixToPt(pt, rotate));
            unit.outer.forEach((pt) => {
                pt.x = Math.round(pt.x * this.precise);
                pt.y = Math.round(pt.y * this.precise);
            });
        });


        let bgData: types.IXY[][] = [background.outer, ...background.holes].map(
            (l) => new Loop(l).toPath() as IPoint[]
        );
        bgData = bgData.map((p) =>
            p.map((pt) => {
                return {
                    x: Math.round(pt.x * this.precise),
                    y: Math.round(pt.y * this.precise),
                };
            })
        );

        if (!this._clipper) return;
        const {
            MakePath64,
            Paths64,
            Path64,
            Point64,
            ReversePath64,
            InflatePaths64,
            JoinType,
            EndType,
            UnionSelf64,
            FillRule,
        } = this._clipper;

        this._clip = new Paths64();
        this._clipLines = new Paths64();
        const holes = (this._holes = new Paths64());
        const rects = this._bgRects;
        bgData.forEach((bgPath, index) => {
            rects.push(getBBox([bgPath]));
            const arr = toArray(bgPath);
            this._clip.push_back(MakePath64(arr));
            if (index !== 0) {
                const p = MakePath64(arr);
                ReversePath64(p);
                holes.push_back(p);
            }

            arr.push(arr[0], arr[1]);
            this._clipLines.push_back(MakePath64(arr));
        });

        this._unitsPaths = patternUnits.map((i) => i.outer);

        const subject = new Paths64();
        const joints = new Paths64();
        this._unitsBlock = this._unitsPaths.map((unit, index) => {
            subject.clear();

            const blockAsHole = new Path64();
            for (let i = unit.length - 1; i > -1; i--) {
                blockAsHole.push_back(
                    new Point64(BigInt(unit[i].x), BigInt(unit[i].y), BigInt(100))
                );
            }

            const block = new Path64();
            for (let i = 0; i < unit.length; i++) {
                block.push_back(
                    new Point64(BigInt(unit[i].x), BigInt(unit[i].y), BigInt(100))
                );
            }

            subject.push_back(block);

            const jointOuter = InflatePaths64(
                subject,
                this.patternData.gap.unit / 2 + this.jointOffset, // 扩大时增加一个offset保证砖缝外轮廓合并后成为一个polygon
                JoinType.Miter, // 斜交
                EndType.Polygon,
                Infinity, // 官方文档解释：斜交限制。我理解应该是交点锐角最大长度，如果偏移超出这个数，则交点不会斜交而变成折线交。实际大于3就都是斜交。
                0 // 官方文档：精确性precision
            );
            const unitC2PathD = new Path64();
            const path = jointOuter.get(0);
            for (let i = 0; i < path.size(); i++) {
                const pt = path.get(i);
                unitC2PathD.push_back(pt);
            }

            joints.push_back(unitC2PathD);
            joints.push_back(blockAsHole);
            const blockPaths = new Paths64();
            blockPaths.push_back(block);
            return blockPaths;
        });
        this._unitJoints = UnionSelf64(joints, FillRule.NonZero);

        this._unitRect = getBBox(this._unitsPaths, this.patternData.gap.unit);
    }

    getUnit() {
        const c = inv([
            [...this.patternData.coord.getDx().data, 0],
            [...this.patternData.coord.getDy().data, 0],
            [0, 0, 1],
        ]);
        return {
            joint: convert2Js(this._unitJoints, this.precise),
            blocks: this._unitsBlock.map((b) => convert2Js(b, this.precise)),
            coords: this.patternData.units.map(({ coord }) =>
                multiplyMatrix(
                    c,
                    inv([
                        [...coord.getDx().data, 0],
                        [...coord.getDy().data, 0],
                        [...coord.getOrigin().data, 1],
                    ])
                )
            ),
        };
    }

    /**
     * 单元box与边界是否相交
     * @param offset
     * @returns  -1: outer, 0: 不与线相交， 1： 与线相交, 2: box中有洞
     */
    isUnitXBackground(offset: IPoint) {
        if (!this._clipper) return -1;
        const { RectClipLinesPaths64, Rect64, Point64, PointInPolygon64 } =
            this._clipper;
        const bbox = this._unitRect;
        const left = bbox.left + offset.x * this.precise,
            top = bbox.top + offset.y * this.precise,
            right = bbox.right + offset.x * this.precise,
            bottom = bbox.bottom + offset.y * this.precise;

        const bgRect = this._bgRects[0];

        if (
            bgRect.left > right ||
            bgRect.top > bottom ||
            bgRect.right < left ||
            bgRect.bottom < top
        )
            return -1;

        // 增加一个offset，使得边缘重合时算作相交
        const unitRectOffseted = new Rect64(
            BigInt(Math.round(left - this.recOffset)),
            BigInt(Math.round(top - this.recOffset)),
            BigInt(Math.round(right + this.recOffset)),
            BigInt(Math.round(bottom + this.recOffset))
        );
        const result = RectClipLinesPaths64(unitRectOffseted, this._clipLines);

        if (result.size() === 0) {
            const pt = new Point64(
                BigInt(Math.round((left + right) / 2)),
                BigInt(Math.round((top + bottom) / 2)),
                BigInt(0)
            );
            const outer = PointInPolygon64(pt, this._clip.get(0)).value;
            if (outer === 0) {
                return 0;
            } else if (outer === 2) {
                return -1;
            }

            const size = this._holes.size();
            for (let i = 0; i < size; i++) {
                const rect = this._bgRects[i + 1];
                if (
                    rect.left > right ||
                    rect.top > bottom ||
                    rect.right < left ||
                    rect.bottom < top
                )
                    continue;

                if (PointInPolygon64(pt, this._holes.get(i)).value === 1) {
                    return -1;
                }
            }

            pt.delete();

            return 0;
        }

        const size = this._holes.size();
        for (let i = 0; i < size; i++) {
            const rect = this._bgRects[i + 1];
            if (
                rect.left > left ||
                rect.top < top ||
                rect.right < right ||
                rect.bottom > bottom
            )
                return 2;
        }

        unitRectOffseted.delete();
        result.delete();

        return 1;
    }

    /**
     * 计算clip
     * @param offset 偏移
     * @param canUseHole 是否可以使用切砖缝的洞作为砖
     * @returns
     */
    execute(offset: IPoint, canUseHole: boolean = true) {
        if (!this._clipper) return undefined;
        const {
            Intersect64,
            FillRule,
            TranslatePaths64,
            ClipType,
            PolyPath64,
            BooleanOpOut64,
        } = this._clipper;
        const clip = this._clip;
        const bigIntOffset = {
            x: BigInt(Math.round(offset.x * this.precise)),
            y: BigInt(Math.round(offset.y * this.precise)),
        };

        const joints: Paths[] = [];
        const holes: Point<bigint>[][] = [];

        const blockResult = {
            data: new Map<number, Paths[] | boolean>(),
            offset,
        };
        // 如果有砖缝，则先计算砖缝
        if (this._enableGap) {
            const offsetedJointSubject = TranslatePaths64(
                this._unitJoints,
                bigIntOffset.x,
                bigIntOffset.y
            );
            const solution = new PolyPath64();
            BooleanOpOut64(
                ClipType.Intersection,
                FillRule.NonZero,
                offsetedJointSubject,
                clip,
                solution
            );

            offsetedJointSubject.delete();

            if (solution.count() !== 0) {
                addPolyPathToResult(solution, joints, this.precise, holes);
            }

            solution.delete();
        }

        for (let index = 0; index < this._unitsBlock.length; index++) {
            const unit = this._unitsBlock[index];

            if (holes.length && canUseHole) {
                const pt = unit.get(0).get(0);

                if (
                    holes.some((path) =>
                        path.some(
                            (p) =>
                                p.x === pt.x + bigIntOffset.x && p.y === pt.y + bigIntOffset.y
                        )
                    )
                ) {
                    blockResult.data.set(index, true);
                    continue;
                }
            }

            const subject = TranslatePaths64(unit, bigIntOffset.x, bigIntOffset.y);
            const tile = new PolyPath64();

            BooleanOpOut64(
                ClipType.Intersection,
                FillRule.NonZero,
                subject,
                clip,
                tile
            );

            if (tile.count() >= 1) {
                const blockResultPaths: Paths[] = [];
                const holes: Point<bigint>[][] = [];
                addPolyPathToResult(tile, blockResultPaths, this.precise, holes);
                blockResult.data.set(index, blockResultPaths);
            }

            subject.delete();
            tile.delete();
        }

        return { blocks: blockResult, joints };
    }
}