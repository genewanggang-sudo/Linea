// 使用clipper2计算
import {
    Coord2,
    Curve2,
    Loop,
} from '../..';
import { applyMatrixToPt, getParamAtUV, getUVMinMax } from './math';

import { types } from '../../type_define/i_types';
import { IPoint, Paths } from './pave';
import { Pattern } from './pattern';
import { clipBlocks2Geometry, fullBlocks2Geometry } from './blocks2Geometry';

// // 输出: 相同材质(materialid相同)合并。
export class RegionMesh {
    buffer = new Object() as types.IFlatMesh;
    material!: number; // 材质id
}
// 描述整个铺贴参数 = 铺贴模版 + 铺贴参数
export class IPavePattern {
    gap!: {
        // 砖缝信息
        unit: number; // 砖缝宽度（单元间的缝隙，不是单元内砖块间的缝隙，砖块间的缝隙要事先算好）
        material: number; // 上层维护的材质id
    };
    units!: {
        // 铺贴单元
        outer: Curve2[]; // 外轮廓，逆时针
        holes: Curve2[][]; // 内轮廓，顺时针
        materials: number[]; // 上层维护的可能铺在该砖上的材质id数组
        seed: number; // 材质随机种子, -1 不随机  >0 则材质在materials内随机,种子数字[0,1]
        coord: Coord2; // uvtransform所需要的偏移和旋转
    }[];
    udir!: types.IXY; //沿着U方向重复铺砖时，不考虑砖缝间隔多少铺一块砖正好对齐
    vdir!: types.IXY; //沿着V方向重复铺砖时，不考虑砖缝间隔多少铺一块砖正好对齐
    coord!: Coord2; //使用坐标来描述偏移+旋转两个铺贴参数
}
// 描述铺贴区域
export class IPolygon {
    outer!: Curve2[]; // 逆时针曲线数组描述外边框
    holes!: Curve2[][]; // 顺时针的曲线数组描述洞
}

export class PatternUtil {
    /**
     * 铺贴
     * @param pattern 铺贴模板
     * @param background 铺贴区域
     * @param enableGap 是否生成砖缝
     * @returns
     */
    public static getRegionMesh(
        pavePattern: IPavePattern,
        background: IPolygon,
        enableGap: boolean = true,
    ): RegionMesh[] {
        const { clipBlocks, fullBlocks, unit } = this.executeClip(
            pavePattern,
            background,
            enableGap,
        );
        const fullGeometries = fullBlocks2Geometry(fullBlocks, unit);
        const clipGeometries = clipBlocks2Geometry(clipBlocks, unit);

        const buffers = new Array(pavePattern.units.length + 1);

        for (let i = 0; i < pavePattern.units.length + 1; i++) {
            buffers[i] = [];
        }
        fullGeometries.blocks.forEach((block, i) => {
            buffers[i].push(block);
        });
        clipGeometries.blocks.forEach(block => {
            buffers[block.unitIndex].push(block);
        });
        buffers[pavePattern.units.length].push(fullGeometries.joints, clipGeometries.joints);

        const result = buffers.map((buffer, index) => this.geos2IMesh(buffer, index === buffers.length - 1 ? pavePattern.gap.material : pavePattern.units[index].materials[0]));
        return result;
    }

    public static executeClip(
        patternData: IPavePattern,
        background: IPolygon,
        enableGap: boolean = true,
    ) {
        const clipBlocks: {
            blocks: {
                data: Map<number, Paths[] | boolean>;
                offset: IPoint;
            };
            joints: Paths[];
        }[] = [];

        const fullBlocks: IPoint[] = [];

        const matrix = [
            [...patternData.coord.getDx().data, 0],
            [...patternData.coord.getDy().data, 0],
            [...patternData.coord.getOrigin().data, 1],
        ];

        /** 与起铺点的差 */
        const origin = applyMatrixToPt({ x: 0, y: 0 }, matrix);

        const pattern = new Pattern(patternData, background, enableGap);
        let { udir, vdir } = patternData;

        const transformUDir = applyMatrixToPt(udir, matrix);
        const transformVDir = applyMatrixToPt(vdir, matrix);
        const transformO = applyMatrixToPt({ x: 0, y: 0 }, matrix);

        udir = { x: transformUDir.x - transformO.x, y: transformUDir.y - transformO.y };
        vdir = { x: transformVDir.x - transformO.x, y: transformVDir.y - transformO.y };

        const vLen = Math.sqrt(vdir.x * vdir.x + vdir.y * vdir.y);
        const uLen = Math.sqrt(udir.x * udir.x + udir.y * udir.y);

        const vDirNormal = { x: vdir.x / vLen, y: vdir.y / vLen };
        const uDirNormal = { x: udir.x / uLen, y: udir.y / uLen };

        const bgData: types.IXY[][] = [background.outer, ...background.holes].map(
            (l) => new Loop(l).toPath() as IPoint[],
        );

        const patternUnitsPath = patternData.units.map(unit => {
            return new Loop(unit.outer).toPath() as IPoint[]
        })

        const bgMinMax = getUVMinMax(uDirNormal, vDirNormal, bgData[0], origin);
        const patternMinMax = getUVMinMax(uDirNormal, vDirNormal, patternUnitsPath.flat(), { x: 0, y: 0 });

        const uUnitLen = Math.ceil(patternMinMax.uMax / uLen) - Math.floor(patternMinMax.uMin / uLen);
        const vUnitLen = Math.ceil(patternMinMax.vMax / vLen) - Math.floor(patternMinMax.vMin / vLen);
        const { setFlag, getFlag } = buildFlags([
            Math.floor(bgMinMax.uMin / uLen) - uUnitLen,
            Math.ceil(bgMinMax.uMax / uLen) + uUnitLen,
        ], [
            Math.floor(bgMinMax.vMin / vLen) - vUnitLen,
            Math.ceil(bgMinMax.vMax / vLen) + vUnitLen,
        ]);

        const clipQueue: [number, number, IPoint][] = [];
        const fullQueue: [number, number][] = [];

        function visitClipBlocks(vIndex: number, uIndex: number, offset: IPoint) {
            // 过滤已经遍历过的砖
            if (getFlag(vIndex, uIndex) >= 0) return;

            const ret = pattern.isUnitXBackground(offset);
            if (ret === -1) {
                setFlag(vIndex, uIndex, -1);
                return;
            } else if (ret === 0) {
                setFlag(vIndex, uIndex, 0);
                if (fullQueue.length < 1000)
                    fullQueue.push([vIndex, uIndex]);
                else {
                    fullBlocks.push(offset);
                }

                return;
            }

            setFlag(vIndex, uIndex, 1);

            // 切割砖，注意：如果内部包含洞，则不能使用砖缝洞作为砖处理
            const ret2 = pattern.execute(offset, ret === 1);

            if (ret2) {
                clipBlocks.push(ret2)
            }

            // visit U up
            if (getFlag(vIndex, uIndex - 1) === undefined) {
                const nOffset = { x: offset.x - udir.x, y: offset.y - udir.y };
                clipQueue.push([vIndex, uIndex - 1, nOffset]);
                setFlag(vIndex, uIndex - 1, -2);
            }

            // up-left
            if (getFlag(vIndex - 1, uIndex - 1) === undefined) {
                const nOffset = { x: offset.x - udir.x - vdir.x, y: offset.y - udir.y - vdir.y };
                clipQueue.push([vIndex - 1, uIndex - 1, nOffset]);
                setFlag(vIndex - 1, uIndex - 1, -2);
            }

            // visit v left
            if (getFlag(vIndex - 1, uIndex) === undefined) {
                const nOffset = { x: offset.x - vdir.x, y: offset.y - vdir.y };
                clipQueue.push([vIndex - 1, uIndex, nOffset]);
                setFlag(vIndex - 1, uIndex, -2);
            }

            // left down
            if (getFlag(vIndex - 1, uIndex + 1) === undefined) {
                const nOffset = { x: offset.x + udir.x - vdir.x, y: offset.y + udir.y - vdir.y };
                clipQueue.push([vIndex - 1, uIndex + 1, nOffset]);
                setFlag(vIndex - 1, uIndex + 1, -2);
            }

            // visit U down
            if (getFlag(vIndex, uIndex + 1) === undefined) {
                const nOffset = { x: offset.x + udir.x, y: offset.y + udir.y };
                clipQueue.push([vIndex, uIndex + 1, nOffset]);
                setFlag(vIndex, uIndex + 1, -2);
            }

            // right down
            if (getFlag(vIndex + 1, uIndex + 1) === undefined) {
                const nOffset = { x: offset.x + udir.x + vdir.x, y: offset.y + udir.y + vdir.y };
                clipQueue.push([vIndex + 1, uIndex + 1, nOffset]);
                setFlag(vIndex + 1, uIndex + 1, -2);
            }

            // visit v right
            if (getFlag(vIndex + 1, uIndex) === undefined) {
                const nOffset = { x: offset.x + vdir.x, y: offset.y + vdir.y };
                clipQueue.push([vIndex + 1, uIndex, nOffset]);
                setFlag(vIndex + 1, uIndex, -2);
            }

            // right up
            if (getFlag(vIndex + 1, uIndex - 1) === undefined) {
                const nOffset = { x: offset.x + vdir.x - udir.x, y: offset.y + vdir.y - udir.y };
                clipQueue.push([vIndex + 1, uIndex - 1, nOffset]);
                setFlag(vIndex + 1, uIndex - 1, -2);
            }
        }

        function visitFullBlocks(vIndex: number, uIndex: number) {
            fullBlocks.push({ x: origin.x + vdir.x * vIndex + udir.x * uIndex, y: origin.y + vdir.y * vIndex + udir.y * uIndex });
            // visit U up
            if (getFlag(vIndex, uIndex - 1) === undefined) {
                fullQueue.push([vIndex, uIndex - 1]);
                setFlag(vIndex, uIndex - 1, 0);
            }

            // up-left
            if (getFlag(vIndex - 1, uIndex - 1) === undefined) {
                fullQueue.push([vIndex - 1, uIndex - 1]);
                setFlag(vIndex - 1, uIndex - 1, 0);
            }

            // visit v left
            if (getFlag(vIndex - 1, uIndex) === undefined) {
                fullQueue.push([vIndex - 1, uIndex]);
                setFlag(vIndex - 1, uIndex, -2);
            }

            // left down
            if (getFlag(vIndex - 1, uIndex + 1) === undefined) {
                fullQueue.push([vIndex - 1, uIndex + 1]);
                setFlag(vIndex - 1, uIndex + 1, -2);
            }

            // visit U down
            if (getFlag(vIndex, uIndex + 1) === undefined) {
                fullQueue.push([vIndex, uIndex + 1]);
                setFlag(vIndex, uIndex + 1, -2);
            }

            // right down
            if (getFlag(vIndex + 1, uIndex + 1) === undefined) {
                fullQueue.push([vIndex + 1, uIndex + 1]);
                setFlag(vIndex + 1, uIndex + 1, -2);
            }

            // visit v right
            if (getFlag(vIndex + 1, uIndex) === undefined) {
                fullQueue.push([vIndex + 1, uIndex]);
                setFlag(vIndex + 1, uIndex, -2);
            }

            // right up
            if (getFlag(vIndex + 1, uIndex - 1) === undefined) {
                fullQueue.push([vIndex + 1, uIndex - 1]);
                setFlag(vIndex + 1, uIndex - 1, -2);
            }
        }

        function addStart(vIndex: number, uIndex: number) {
            visitClipBlocks(vIndex, uIndex, { x: origin.x + vdir.x * vIndex + udir.x * uIndex, y: origin.y + vdir.y * vIndex + udir.y * uIndex });
        }

        bgData.forEach((path) => {
            if (!path.length) return;
            const delta = { x: path[0].x - origin.x, y: path[0].y - origin.y };

            const [u, v] = getParamAtUV(uDirNormal, vDirNormal, delta);
            const uIndex = Math.floor(u / uLen);
            const vIndex = Math.floor(v / vLen);

            // 因为uIndex 和vIndex调用的是floor，所以最大值需要增加1
            for (let v = Math.floor(patternMinMax.vMin / vLen); v <= Math.ceil(patternMinMax.vMax / vLen) + 1; v++) {
                for (let u = Math.floor(patternMinMax.uMin / uLen); u <= Math.ceil(patternMinMax.uMax / uLen) + 1; u++) {
                    addStart(vIndex + v, uIndex + u);
                }
            }
        });

        while (clipQueue.length) {
            const len = Math.min(clipQueue.length, 100);
            for (let i = 0; i < len; i++) {
                const item = clipQueue[i];
                visitClipBlocks(item[0], item[1], item[2]);
            }

            clipQueue.splice(0, len);
        }

        while (fullQueue.length) {
            const len = Math.min(fullQueue.length, 100);
            for (let i = 0; i < len; i++) {
                const item = fullQueue[i];
                visitFullBlocks(item[0], item[1]);
            }

            fullQueue.splice(0, len);
        }

        const unit = pattern.getUnit();
        // const fullGeometries = fullBlocks2Geometry(fullBlocks, unit);
        // const clipGeometries = clipBlocks2Geometry(clipBlocks, unit);

        return { clipBlocks, fullBlocks, unit };
    }

    private static geos2IMesh(buffers: {
        uvs: Float32Array,
        vertices: Float32Array,
        indices: Uint32Array
    }[], material: number): RegionMesh {
        // 合并buffer
        const length = { uvL: 0, verticesL: 0, indicesL: 0 }

        buffers.forEach(buffer => {
            length.uvL += buffer.uvs.length;
            length.verticesL += buffer.vertices.length;
            length.indicesL += buffer.indices.length;
        })
        const resultBuffer = {
            vertices: new Float32Array(length.verticesL),
            faces: new Uint32Array(length.indicesL),
            uvs: new Float32Array(length.uvL),
            normals: new Float32Array(length.verticesL),
        };

        let vertexCount = 0;
        let uvIndex = 0, verticesIndex = 0, indicesIndex = 0;

        for (let index = 0; index < buffers.length; index++) {
            const item = buffers[index];

            resultBuffer.uvs.set(item.uvs, uvIndex);

            for (let i = 0; i < item.vertices.length; i++) {
                resultBuffer.vertices[verticesIndex + i] = item.vertices[i];
                resultBuffer.normals[verticesIndex + i] = (i % 3) === 2 ? 1 : 0;
            }

            for (let i = 0; i < item.indices.length; i++) {
                resultBuffer.faces[indicesIndex + i] = item.indices[i] + vertexCount;
            }

            vertexCount = vertexCount + item.vertices.length / 3;
            uvIndex += item.uvs.length;
            verticesIndex += item.vertices.length;
            indicesIndex += item.indices.length;
        }
        const mesh = new RegionMesh();
        mesh.buffer = resultBuffer as unknown as types.IFlatMesh;
        mesh.material = material;

        return mesh;
    }

}

function buildFlags(uRange: number[], vRange: number[]) {
    // 增加一个offset防止溢出
    const uLength = uRange[1] - uRange[0] + 2;
    const vLength = vRange[1] - vRange[0] + 2;

    const uBase = 0 - uRange[0] + 1;
    const vBase = 0 - vRange[0] + 1;

    const flags: number[][] = []; // [v][u]
    for (let i = 0; i < vLength; i++) {
        flags[i] = new Array(uLength); // new Int8Array(uLength)
    }

    function getFlag(vIndex: number, uIndex: number) {
        if (vIndex + vBase >= flags.length ||
            vIndex + vBase < 0 ||
            uIndex + uBase >= flags[vIndex + vBase].length ||
            uIndex + uBase < 0) {
            return -1;
        }
        const flag = flags[vIndex + vBase][uIndex + uBase];
        return flag; //visitedFlags.get(vIndex)?.get(uIndex);
    }

    function setFlag(vIndex: number, uIndex: number, val: number) {
        if (vIndex + vBase >= flags.length || vIndex + vBase < 0) {
            return;
        }
        flags[vIndex + vBase][uIndex + uBase] = val;
    }

    return {
        setFlag,
        getFlag,
    }
}
