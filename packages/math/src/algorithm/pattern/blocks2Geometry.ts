import earcut from "earcut";
import { applyMatrix, getBBox } from "./math";
import { IPoint, Paths } from "./pave";



export function clipBlocks2Geometry(
    result: {
        blocks: {
            data: Map<number, Paths[] | boolean>;
            offset: IPoint;
        };
        joints: Paths[];
    }[],
    unitDefs: { joint: Paths; blocks: Paths[]; coords: number[][][] }
) {
    const jointUvs: number[] = [];
    const jointIndices: number[] = [];
    const jointVertices: number[] = [];

    const blocksGeometries = unitDefs.blocks.map(() => ({
        indices: [] as number[],
        vertices: [] as number[],
        uvs: [] as number[],
    }));

    const fullBlocksGeometries = unitDefs.blocks.map(() => ({
        indices: [] as number[],
        vertices: [] as number[],
        uvs: [] as number[],
    }));
    const blocksSize = unitDefs.blocks.map((block) => {
        const bbox = getBBox(block);
        const width = bbox.right - bbox.left;
        const height = bbox.bottom - bbox.top;
        return { left: bbox.left, top: bbox.top, width, height };
    });

    const unitsGeometry = unitDefs.blocks.map((block, index) => {
        const buf = triangle(block);

        for (let i = 0; i < buf.uvs.length; i += 2) {
            applyMatrix(buf.uvs, i, unitDefs.coords[index]);
        }
        return buf;
    });

    result.forEach(({ blocks, joints }) => {
        joints.forEach((jointPaths) => {
            const start = jointUvs.length;
            const holes: number[] = [];
            const indiceStart = jointUvs.length / 2;
            let holeIndex = 0;
            jointPaths.forEach((path, index) => {
                if (holeIndex) {
                    holes.push(holeIndex);
                }

                holeIndex += path.length;
                path.forEach((pt) => {
                    jointUvs.push(pt.x, pt.y);
                    jointVertices.push(pt.x, pt.y, 0);
                });
            });

            earcut(jointUvs.slice(start), holes, 2).forEach((i) => {
                jointIndices.push(i + indiceStart);
            });
        });

        const offset = blocks.offset;

        blocks.data.forEach((polyPaths, index) => {
            if (Array.isArray(polyPaths)) {
                const item = blocksGeometries[index];


                polyPaths.forEach((paths) => {
                    const start = item.vertices.length;
                    const holes: number[] = [];
                    let holeIndex = 0;
                    paths.forEach(path => {

                        if (holeIndex) {
                            holes.push(holeIndex);
                        }

                        holeIndex += path.length;

                        path.forEach((pt) => {
                            item.uvs.push(
                                (pt.x - offset.x - blocksSize[index].left) / blocksSize[index].width,
                                (pt.y - offset.y - blocksSize[index].top) / blocksSize[index].height
                            );
                            item.vertices.push(pt.x, pt.y, 0);
                        });
                    })


                    earcut(item.vertices.slice(start), holes, 3).forEach((i) => {
                        item.indices.push(i + start / 3);
                    });
                });

            } else {
                const target = fullBlocksGeometries[index];
                const unitDefBuffer = unitsGeometry[index];

                const uvs = target.uvs;
                const vertices = target.vertices;
                const indices = target.indices;

                const uvIndex = target.uvs.length;
                unitDefBuffer.uvs.forEach((val, i) => {
                    uvs[uvIndex + i] = val;
                });

                const verticesIndex = target.vertices.length;
                for (let i = 0; i < unitDefBuffer.vertices.length; i += 3) {
                    vertices[verticesIndex + i] =
                        unitDefBuffer.vertices[i] + blocks.offset.x;
                    vertices[verticesIndex + i + 1] =
                        unitDefBuffer.vertices[i + 1] + blocks.offset.y;
                    vertices[verticesIndex + i + 2] = 0;
                }

                const indicesIndex = target.indices.length;
                const vertexCount = uvIndex / 2;
                for (let i = 0; i < unitDefBuffer.indices.length; i++) {
                    indices[indicesIndex + i] = unitDefBuffer.indices[i] + vertexCount;
                }
            }
        });
    });

    blocksGeometries.forEach((d, index) => {
        for (let i = 0; i < d.uvs.length; i += 2) {
            applyMatrix(d.uvs, i, unitDefs.coords[index]);
        }
    });

    return {
        joints: { vertices: jointVertices, indices: jointIndices, uvs: jointUvs },
        blocks: blocksGeometries
            .map((i, index) => {
                return {
                    vertices: new Float32Array(i.vertices),
                    uvs: new Float32Array(i.uvs),
                    indices: new Uint32Array(i.indices),
                    unitIndex: index,
                };
            })
            .concat(
                fullBlocksGeometries
                    .filter((i) => i.indices.length > 0)
                    .map((i, index) => {
                        return {
                            vertices: new Float32Array(i.vertices),
                            uvs: new Float32Array(i.uvs),
                            indices: new Uint32Array(i.indices),
                            unitIndex: index,
                        };
                    })
            ),
    };
}

export function fullBlocks2Geometry(
    fullBlocks: IPoint[],
    unitDef: {
        joint: Paths;
        blocks: Paths[];
        coords: number[][][];
    }
) {
    const jointUnit = triangle(unitDef.joint);
    const { uvs, vertices, indices } = jointUnit;

    const jointBuffer = {
        vertices: new Float32Array(vertices.length * fullBlocks.length),
        indices: new Uint32Array(indices.length * fullBlocks.length),
        uvs: new Float32Array(uvs.length * fullBlocks.length),
    };

    const unitsBuffer = unitDef.blocks.map((block, index) => {
        const unitBuffer = triangle(block);

        for (let i = 0; i < unitBuffer.uvs.length; i += 2) {
            applyMatrix(unitBuffer.uvs, i, unitDef.coords[index]);
        }
        return unitBuffer;
    });

    const resultsBuffer = unitsBuffer.map((item) => {
        return {
            uvs: new Float32Array(item.uvs.length * fullBlocks.length),
            vertices: new Float32Array(item.vertices.length * fullBlocks.length),
            indices: new Uint32Array(item.indices.length * fullBlocks.length),
        };
    });

    unitsBuffer.push(jointUnit);
    resultsBuffer.push(jointBuffer);

    unitsBuffer.forEach((unit, unitIndex) => {
        const { uvs, vertices, indices } = resultsBuffer[unitIndex];

        let vertexCount = 0;
        let uvIndex = 0,
            verticesIndex = 0,
            indicesIndex = 0;

        for (let index = 0; index < fullBlocks.length; index++) {
            const item = fullBlocks[index];

            uvs.set(unit.uvs, uvIndex);

            for (let i = 0; i < unit.vertices.length; i += 3) {
                vertices[verticesIndex + i] = unit.vertices[i] + item.x;
                vertices[verticesIndex + i + 1] = unit.vertices[i + 1] + item.y;
            }

            for (let i = 0; i < unit.indices.length; i++) {
                indices[indicesIndex + i] = unit.indices[i] + vertexCount;
            }

            vertexCount = vertexCount + unit.uvs.length / 2;
            uvIndex += unit.uvs.length;
            verticesIndex += unit.vertices.length;
            indicesIndex += unit.indices.length;
        }
    });

    return {
        blocks: resultsBuffer.slice(0, resultsBuffer.length - 1),
        joints: jointBuffer,
    };
}

/**
 * 三角化
 * @param paths
 * @returns
 */

export function triangle(paths: Paths) {
    const uvs: number[] = [];
    const vertices: number[] = [];
    const holes: number[] = [];
    let holeIndex = 0;
    const bbox = getBBox(paths);
    const width = bbox.right - bbox.left;
    const height = bbox.bottom - bbox.top;
    paths.forEach((p) => {
        if (holeIndex) holes.push(holeIndex);
        holeIndex += p.length;
        p.forEach((pt) => {
            uvs.push((pt.x - bbox.left) / width, (pt.y - bbox.top) / height);
            vertices.push(pt.x, pt.y, 0);
        });
    });

    const indices = earcut(vertices, holes, 3);

    return { uvs, indices, vertices };
}