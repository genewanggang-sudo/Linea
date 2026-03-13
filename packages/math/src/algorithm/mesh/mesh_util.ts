import { Box2 } from '../../base/box2';
import { Box3 } from '../../base/box3';
import { Coord3 } from '../../base/coord3';
import { Tol } from '../../base/tol';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { Ln3 } from '../../geometry/ln3';
import { Plane } from '../../geometry/plane';
import { Surface } from '../../geometry/surface';
import { types } from '../../type_define/i_types';
import { MathError } from '../../util/math_error';
import { Util } from '../../util/util';
import { D } from '../calc_d';
import { IMesh2d } from '../discrete/discrete_refiner';
import { DiscreteUtil } from '../discrete/discrete_util';
import { MeshAssist } from './mesh_assist';
import { MeshContour } from './mesh_contour';
import { Matrix4 } from '../../base/matrix4';
import { BrepBody, Shell } from '../../brep-src';
import { DiscreteParam } from '../..';
import { Curve3, Polygon, brep } from '../..';



enum PositionType {
    Above = 2,
    On = 1,
    Below = 0,
}

interface IMeshAttribute {
    name: string;
    stride: number;
}

export class MeshUtil {
    /**
     *
     * @param box
     * @param mesh 被切割mesh
     * @param fillClip 是否对切割mesh补面
     */
    public static boxClip(box: types.IFlatMesh, mesh: types.IFlatMesh, fillClip: boolean = true) {
        const vertics: Vec3[] = [];
        for (let i = 0; i < box.vertices.length; i += 3) {
            vertics.push(new Vec3([box.vertices[i], box.vertices[i + 1], box.vertices[i + 2]]));
        }
        const planes: Plane[] = [];
        for (let i = 0; i < box.faces.length; i += 3) {
            const plane = Plane.makeBy3Pts(
                vertics[box.faces[i]],
                vertics[box.faces[i + 1]],
                vertics[box.faces[i + 2]],
            );
            if (!plane) {
                continue;
            }
            for (let j = (i + 3) % box.faces.length; j < box.faces.length + 3; j += 3) {
                const dis1 = D.ptToSurfSigned(vertics[box.faces[j % box.faces.length]], plane);
                const dis2 = D.ptToSurfSigned(
                    vertics[box.faces[(j + 1) % box.faces.length]],
                    plane,
                );
                const dis3 = D.ptToSurfSigned(
                    vertics[box.faces[(j + 2) % box.faces.length]],
                    plane,
                );
                if (Util.isNearly0(dis1) && Util.isNearly0(dis2) && Util.isNearly0(dis3)) {
                    i += 3;
                    continue;
                }

                if (Util.isNearlyBigger(dis1, 0) || Util.isNearlyBigger(dis2, 0) || Util.isNearlyBigger(dis3, 0)) {
                    planes.push(plane);
                    break;
                }

                plane.reverse();
                planes.push(plane);
                break;
            }
        }
        // const boxPlanes: Plane[] = [];
        // for (const p of planes) {
        //     let coplan = false;
        //     for (const bp of boxPlanes) {
        //         if (bp.isCoplanar(p)) {
        //             coplan = true;
        //             break;
        //         }
        //     }
        //     if (!coplan) {
        //         boxPlanes.push(p);
        //     }
        // }

        MathError.assert(planes.length === 6, '切割box暂时只支持矩形');

        let ret = mesh;
        for (const p of planes) {
            ret = this.clip(ret, p.getCoord(), fillClip);
        }

        return ret;
    }

    public static createFlatMeshByMesh2d(
        mesh2d: IMesh2d,
        surface: Surface = new Plane(Coord3.XOY()),
    ): types.IFlatMesh {
        const faces = mesh2d.faces.slice();
        const vertices: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];

        for (const uv of mesh2d.vertices) {
            uvs.push(uv.x, uv.y);
            vertices.push(...surface.getPtAt(uv).data);
            normals.push(...surface.getNormAt(uv).data);
        }

        return { faces, vertices, uvs, normals };
    }

    public static createFlatMesh(): types.IFlatMesh {
        return {
            faces: [],
            vertices: [],
            normals: [],
            uvs: [],
        };
    }

    public static createFlatMeshByBox2(box: Box2, z = 0): types.IFlatMesh {
        const { x: x1, y: y1 } = box.min;
        const { x: x2, y: y2 } = box.max;
        return {
            faces: [0, 1, 2, 2, 3, 0],
            vertices: [x1, y1, z, x2, y1, z, x2, y2, z, x1, y2, z],
            normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
            uvs: [x1, y1, x2, y1, x2, y2, x1, y2],
        };
    }

    public static createFlatMeshByBox3(box: Box3): types.IFlatMesh {
        const pts = [
            { x: box.min.x, y: box.min.y },
            { x: box.max.x, y: box.min.y },
            { x: box.max.x, y: box.max.y },
            { x: box.min.x, y: box.max.y },
        ];
        const crd = Coord3.XOY().translate({ x: 0, y: 0, z: box.min.z });
        const vec = { x: 0, y: 0, z: box.max.z - box.min.z };
        return MeshUtil.extrude([pts], crd, vec);
    }

    public static toFlatMesh(mesh: types.IMesh): types.IFlatMesh {
        return {
            vertices: mesh.vertices.flat(),
            faces: mesh.faces.flat(),
            normals: mesh.normals.flat(),
            uvs: mesh.uvs.flat(),
        };
    }

    public static toMesh(mesh: types.IFlatMesh): types.IMesh {
        const ret: types.IMesh = {
            vertices: [],
            faces: [],
            normals: [],
            uvs: [],
        };
        for (let i = 0; i < mesh.vertices.length; i += 3) {
            ret.vertices.push(mesh.vertices.slice(i, i + 3) as types.numberArr3);
        }
        for (let i = 0; i < mesh.faces.length; i += 3) {
            ret.faces.push(mesh.faces.slice(i, i + 3) as types.numberArr3);
        }
        for (let i = 0; i < mesh.normals.length; i += 3) {
            ret.normals.push(mesh.normals.slice(i, i + 3) as types.numberArr3);
        }
        for (let i = 0; i < mesh.uvs.length; i += 2) {
            ret.uvs.push(mesh.uvs.slice(i, i + 2) as types.numberArr2);
        }
        return ret;
    }

    public static clone<MeshType extends types.IFlatMesh>(mesh: MeshType): MeshType {
        const ret = {} as MeshType;
        for (const key of Object.keys(mesh)) {
            (ret as any)[key] = mesh[key].slice();
        }
        return ret;
    }

    public static merge(...meshes: types.IFlatMesh[]): types.IFlatMesh {
        const ret = MeshUtil.createFlatMesh();
        for (const mesh of meshes) {
            const f0 = ret.vertices.length / 3;
            for (const fi of mesh.faces) {
                ret.faces.push(fi + f0);
            }
            ret.vertices.push(...mesh.vertices);
            ret.normals.push(...mesh.normals);
            ret.uvs.push(...mesh.uvs);
        }
        return ret;
    }

    /**
     * 将 mesh 投影到 xy 平面，并返回其轮廓线
     * @param mesh
     * @returns 返回的轮廓线按含内环多边形列表进行组织
     */
    public static getContour(mesh: types.IFlatMesh): types.IXY[][][] {
        return MeshContour.execute(mesh);
    }

    /**
     * 计算 mesh 与 line 的交点
     * @param mesh
     * @param line
     * @returns 返回交点在 line 上的参数，并按从小到大排序
     */
    public static intersectLine(mesh: types.IFlatMesh, line: Ln3): number[] {
        const crd = new Coord3(line.getOrigin(), line.getDirection());
        const vertices = new Array<number>(mesh.vertices.length);
        for (let v0 = 0; v0 < mesh.vertices.length; v0 += 3) {
            const pt = crd.getLocalPtAt({ x: mesh.vertices[v0], y: mesh.vertices[v0 + 1], z: mesh.vertices[v0 + 2] });
            vertices[v0] = pt.x;
            vertices[v0 + 1] = pt.y;
            vertices[v0 + 2] = pt.z;
        }
        const newMesh: types.IFlatMesh = { vertices, uvs: mesh.uvs, faces: mesh.faces, normals: mesh.normals };
        const hs = MeshContour.getHeightAtProjectPoint(newMesh, { x: 0, y: 0 });
        const lineRange = line.getRange();
        return hs.filter(_ => lineRange.containsPt(_)).sort((a, b) => a - b);
    }

    /**
     * 裁切 mesh，仅保留 plane 上方的三角面片。方法支持多组 uv,支持多组mesh,输出为裁切后的mesh以及对应的之前的mesh,补面生成的mesh对应为undefined
     * @example 若有 a、b 两组 uv，则 uv 的表达为： [a0.x, a0.y, a1.x, a1.y ... aN.x, aN.y, b0.x, b0.y, b1.x, b1.y ... bN.x, bN.y]
     * @param mesh 待裁切网格，支持多组 uv 数据
     * @param coord 切平面所在坐标系
     * @param fillClip 是否要对裁切面进行补面
     * @param xRange 当指定 xRange 参数时，仅对 xRange 范围内部分进行裁切
     * @param interpolateFunction 额外插值函数。clip 函数会默认对顶点坐标、法向、uv进行插值，可通过该插值函数进行额外插值。例如，对于含有骨骼的模型，可传入 MeshUtil.clipBoneInterpolation
     */
    public static clipSeperate<MeshType extends types.IFlatMesh>(
        meshes: MeshType[],
        coord: Coord3,
        fillClip = false,
        xRange?: types.IInterval[],
        interpolateFunction?: (
            oldMesh: MeshType,
            newMesh: MeshType,
            vertexIndex1: number,
            vertexIndex2: number,
            weight1: number,
        ) => void,
    ): Map<MeshType, MeshType | undefined> {
        const newMeshes: MeshType[] = [];
        const attres = [];
        const newUvsListes = [];
        const nextMapes = [];
        const resMap: Map<MeshType, MeshType> = new Map();
        for (let i = 0; i < meshes.length; ++i) {
            const mesh = meshes[i];
            const range = xRange ? xRange[i] : undefined;
            const { newMesh, newUvsList, nextMap, attrs } = this._clip(
                mesh,
                coord,
                fillClip,
                range,
                interpolateFunction,
            );

            resMap.set(newMesh, meshes[i]);
            newMeshes.push(newMesh);
            attres.push(attrs);
            newUvsListes.push(newUvsList);
            nextMapes.push(nextMap);
        }

        const resultMap: Map<MeshType, MeshType | undefined> = new Map();
        if (fillClip) {
            const fillClipMesh = {
                faces: [] as number[],
                normals: [] as number[],
                uvs: [] as number[],
                vertices: [] as number[],
            } as MeshType;
            for (const attr of attres[0]) {
                (fillClipMesh as any)[attr.name] = [];
            }
            const nextMap = new Map<number, number[]>();
            let idx = 0;
            for (let i = 0; i < newMeshes.length; ++i) {
                // eslint-disable-next-line no-loop-func
                newMeshes[i].faces.forEach(f => fillClipMesh.faces.push(f + idx));
                for (const attr of attres[i]) {
                    newMeshes[i][attr.name].forEach(a => fillClipMesh[attr.name].push(a));
                }
                for (const next of nextMapes[i]) {
                    // eslint-disable-next-line no-loop-func
                    const newArr = next[1].map(num => num + idx);
                    nextMap.set(next[0] + idx, newArr);
                }
                idx += newMeshes[i].vertices.length / 3;
            }
            const flatMesh = MeshUtil._fillClipSeperate(fillClipMesh, nextMap, coord);
            const uvs = [...flatMesh.uvs];
            for (let k = 1; k < newUvsListes[0].length; ++k) {
                flatMesh.uvs.push(...uvs);
            }
            resultMap.set(flatMesh, undefined);
        }

        // 去除多余点
        for (let i = 0; i < newMeshes.length; ++i) {
            const newMesh = newMeshes[i];
            const attrs = attres[i];
            const newUvsList = newUvsListes[i];
            const fullVn = newMesh.vertices.length / 3;
            const indexMap = new Array<number>(fullVn).fill(-1);
            for (const idx of newMesh.faces) {
                indexMap[idx] = 0;
            }

            const ret = {} as MeshType;

            for (const attr of attrs) {
                (ret as any)[attr.name] = [];
            }

            const uvsList: number[][] = newUvsList.map(_ => []);

            let curIdx = 0;
            for (let idx = 0; idx < fullVn; idx++) {
                if (indexMap[idx] === 0) {
                    indexMap[idx] = curIdx++;
                    for (const attr of attrs) {
                        const name = attr.name;
                        const i0 = idx * attr.stride;

                        for (let k = 0; k < attr.stride; k++) {
                            ret[name].push(newMesh[name][i0 + k]);
                        }
                    }

                    const i2 = idx * 2;
                    for (let uvi = 0; uvi < uvsList.length; uvi++) {
                        const uvs = newUvsList[uvi];
                        uvsList[uvi].push(uvs[i2], uvs[i2 + 1]);
                    }
                }
            }

            // ret.uvs = uvsList.flat();
            ret.uvs = [];
            uvsList.forEach(_ => ret.uvs.push(..._));
            ret.faces = newMesh.faces.map(idx => indexMap[idx]);
            if (ret.faces.length > 0) {
                const oldMesh = resMap.get(newMesh);
                resultMap.set(ret, oldMesh!);
            }
        }

        return resultMap;
    }

    /**
     * 裁切 mesh，仅保留 plane 上方的三角面片。方法支持多组 uv。
     * @example 若有 a、b 两组 uv，则 uv 的表达为： [a0.x, a0.y, a1.x, a1.y ... aN.x, aN.y, b0.x, b0.y, b1.x, b1.y ... bN.x, bN.y]
     * @param mesh 待裁切网格，支持多组 uv 数据
     * @param coord 切平面所在坐标系
     * @param fillClip 是否要对裁切面进行补面
     * @param xRange 当指定 xRange 参数时，仅对 xRange 范围内部分进行裁切
     * @param interpolateFunction 额外插值函数。clip 函数会默认对顶点坐标、法向、uv进行插值，可通过该插值函数进行额外插值。例如，对于含有骨骼的模型，可传入 MeshUtil.clipBoneInterpolation
     */
    public static clip<MeshType extends types.IFlatMeshPlus>(
        mesh: MeshType,
        coord: Coord3,
        fillClip = false,
        xRange?: types.IInterval,
        interpolateFunction?: (
            oldMesh: MeshType,
            newMesh: MeshType,
            vertexIndex1: number,
            vertexIndex2: number,
            weight1: number,
        ) => void,
    ): MeshType {
        const { newMesh, newUvsList, newUvs1List, nextMap, attrs, uvTransform, uvTransform1 } = this._clip(
            mesh,
            coord,
            fillClip,
            xRange,
            interpolateFunction,
        );

        // 补面
        if (fillClip) {
            MeshUtil._fillClip(newMesh, newUvsList, nextMap, coord, uvTransform, newUvs1List, uvTransform1);
        }

        // 去除多余点
        const fullVn = newMesh.vertices.length / 3;
        const indexMap = new Array<number>(fullVn).fill(-1);
        for (const idx of newMesh.faces) {
            indexMap[idx] = 0;
        }

        const ret = {} as MeshType;

        for (const attr of attrs) {
            (ret as any)[attr.name] = [];
        }

        const uvsList: number[][] = newUvsList.map(_ => []);
        const uvs1List: number[][] = newUvs1List.map(_ => []);

        let curIdx = 0;
        for (let idx = 0; idx < fullVn; idx++) {
            if (indexMap[idx] === 0) {
                indexMap[idx] = curIdx++;
                for (const attr of attrs) {
                    const name = attr.name;
                    const i0 = idx * attr.stride;

                    for (let i = 0; i < attr.stride; i++) {
                        ret[name].push(newMesh[name][i0 + i]);
                    }
                }

                const i2 = idx * 2;
                for (let uvi = 0; uvi < uvsList.length; uvi++) {
                    const uvs = newUvsList[uvi];
                    uvsList[uvi].push(uvs[i2], uvs[i2 + 1]);
                }
                for (let uvi = 0; uvi < uvs1List.length; uvi++) {
                    const uvs = newUvs1List[uvi];
                    uvs1List[uvi].push(uvs[i2], uvs[i2 + 1]);
                }
            }
        }

        ret.uvs = [];
        uvsList.forEach(_ => {
            ret.uvs = ret.uvs.concat(_);
        });
        if (uvs1List.length) {
            ret.uvs1 = [];
            uvs1List.forEach(_ => {
                ret.uvs1 = ret.uvs1?.concat(_);
            });
        }
        // ret.uvs = uvsList.flat();
        ret.faces = newMesh.faces.map(idx => indexMap[idx]);
        return ret;
    }

    /**
     * clip 函数可选用的插值函数
     * @param oldMesh
     * @param newMesh
     * @param vertexIndex1
     * @param vertexIndex2
     * @param weight1
     */
    public static clipBoneInterpolation(
        oldMesh: types.IBoneFlatMesh,
        newMesh: types.IBoneFlatMesh,
        vertexIndex1: number,
        vertexIndex2: number,
        weight1: number,
    ) {
        const bones: [number, number][] = []; // idx, weights

        // bone1
        for (let i = 0; i < 4; i++) {
            const bi = vertexIndex1 * 4 + i;
            const w = oldMesh.boneWeights[bi] * weight1;

            if (w > 0) {
                bones.push([oldMesh.boneIndices[bi], w]);
            }
        }

        // bone2
        for (let i = 0; i < 4; i++) {
            const bi = vertexIndex2 * 4 + i;
            const w = oldMesh.boneWeights[bi] * (1 - weight1);

            if (w > 0) {
                const idx = oldMesh.boneIndices[bi];
                const bone = bones.find(_ => _[0] === idx);

                if (bone) {
                    bone[1] += w;
                } else {
                    bones.push([idx, w]);
                }
            }
        }

        // unify
        bones.sort((a, b) => (a[1] === b[1] ? a[0] - b[0] : b[1] - a[1]));

        if (bones.length > 4) {
            bones.length = 4;
            let wSum = 0;

            for (const bone of bones) {
                wSum += bone[1];
            }
            for (const bone of bones) {
                bone[1] /= wSum;
            }
        }

        // output
        for (const bone of bones) {
            newMesh.boneIndices.push(bone[0]);
            newMesh.boneWeights.push(bone[1]);
        }
        for (let i = bones.length; i < 4; i++) {
            newMesh.boneIndices.push(0);
            newMesh.boneWeights.push(0);
        }
    }

    /**
     * brep转mesh
     * @param brep BrepBody
     * @param discreteParams 离散参数
     * @returns types.IFlatMesh
     */
    public static brepToMesh(brep: BrepBody | Shell, discreteParams?: DiscreteParam): types.IFlatMesh {
        const meshes = brep.getFaces().map(f => MeshUtil.toFlatMesh(f.tessellate(discreteParams).mesh!));
        return MeshUtil.merge(...meshes);
    }

    /**
     * 扫掠算法
     * @param coordinate 扫描轮廓所在的局部坐标系
     * @param polygon2d 扫描轮廓
     * @param path3d 扫描路径
     * @param discreteParams 离散参数
     * @param adjustProfile 自动调整扫描轮廓，垂直于路径
     * @param adjustPath 自动调整扫描路径，寻找起始路径（距离近，且角度大）
     * @returns types.IFlatMesh
     */
    public static sweep(
        // 扫描轮廓所在的局部坐标系
        coordinate: Coord3,
        // 扫描轮廓
        polygon2d: Polygon,
        // 扫描路径
        path3d: Curve3[],
        // 离散参数
        discreteParams?: DiscreteParam,
        // 自动调整扫描轮廓，垂直于路径
        adjustProfile: boolean = true,
        // 自动调整扫描路径，寻找起始路径（距离近，且角度大）
        adjustPath: boolean = false,): types.IFlatMesh {
        const sweep = brep.alg.BodyBuilder.sweep(coordinate, polygon2d, path3d, adjustProfile, adjustPath);
        return MeshUtil.brepToMesh(sweep, discreteParams);
    }

    /**
     * 拉伸算法
     * @param loop2ds 二维点集合
     * @param coord 二维平面在三维空间中的坐标系
     * @param offset 世界坐标系下的挤出方向
     * @param isSmooth 法向量是否为均匀过渡，默认法向为非光滑，若指定该参数，需与loop2ds维度一致
     */
    public static extrude(
        loop2ds: types.IXY[][],
        coord: Coord3,
        offset: types.IXYZ,
        isSmooth?: boolean[][],
    ): types.IFlatMesh {
        const meshes = this.extrudeSeperateFaces(loop2ds, coord, offset, isSmooth);
        return MeshUtil.merge(meshes.top, meshes.bottom, ...meshes.sides.flat());
    }

    /**
     * 拉伸算法
     * @param loop2ds 二维点集合
     * @param coord 二维平面在三维空间中的坐标系
     * @param offset 世界坐标系下的挤出方向
     * @param isSmooth 法向量是否为均匀过渡，默认法向为非光滑，若指定该参数，需与loop2ds维度一致
     */
    public static extrudeSeperateFaces(
        loop2ds: types.IXY[][],
        coord: Coord3,
        offset: types.IXYZ,
        isSmooth?: boolean[][],
    ): { top: types.IFlatMesh; bottom: types.IFlatMesh; sides: types.IFlatMesh[][] } {
        // top & bottom
        const mesh2d = DiscreteUtil.tessVector2(loop2ds);
        const topNormArr = coord.getDz().data;
        const bottomNormArr = [-topNormArr[0], -topNormArr[1], -topNormArr[2]];
        const topCoord = coord.translated(offset);

        // top
        const top = MeshUtil.createFlatMesh();
        for (const v of mesh2d.vertices) {
            top.vertices.push(...topCoord.getWorldPtAt(v).data);
            top.normals.push(...topNormArr);
            top.uvs.push(v.x, v.y);
        }
        top.faces = mesh2d.faces.slice();

        // bottom
        const bottom = MeshUtil.createFlatMesh();
        for (const v of mesh2d.vertices) {
            bottom.vertices.push(...coord.getWorldPtAt(v).data);
            bottom.normals.push(...bottomNormArr);
            bottom.uvs.push(v.x, v.y);
        }
        for (let i = 0; i < mesh2d.faces.length; i += 3) {
            bottom.faces.push(mesh2d.faces[i], mesh2d.faces[i + 2], mesh2d.faces[i + 1]);
        }

        // sides
        const allSides: types.IFlatMesh[][] = [];
        const topV = coord.getDz().dot(offset);

        for (let li = 0; li < loop2ds.length; li++) {
            const sides: types.IFlatMesh[] = [MeshUtil.createFlatMesh()];

            const loop = loop2ds[li];
            const smooths = isSmooth?.[li];

            let u = 0;
            let lastNorm: Vec3;
            {
                const lastDir = new Vec2(loop[loop.length - 1], loop[0]).normalize();
                lastNorm = coord.getWorldVectorAt({ x: lastDir.y, y: -lastDir.x });
            }
            for (let pi = 0; pi < loop.length; pi++) {
                const pt = loop[pi];
                const bottomPt = coord.getWorldPtAt(pt);
                const topPt = bottomPt.added(offset);
                const dir = new Vec2(loop[(pi + 1) % loop.length]).subtract(pt);
                const deltaU = dir.getLength();
                dir.multiply(1 / deltaU);
                const curNorm = coord.getWorldVectorAt({ x: dir.y, y: -dir.x });

                const mesh = sides[sides.length - 1];
                const v0 = mesh.vertices.length / 3;
                mesh.faces.push(v0 - 2, v0, v0 - 1);
                mesh.faces.push(v0 - 1, v0, v0 + 1);

                const pushVtx = (_mesh: types.IFlatMesh, _u: number, _norm: Vec3) => {
                    _mesh.vertices.push(...bottomPt.data, ...topPt.data);
                    _mesh.uvs.push(_u, 0, _u, topV);
                    _mesh.normals.push(..._norm.data, ..._norm.data);
                };

                if (smooths && smooths[pi]) {
                    const midNorm = lastNorm.midTo(curNorm).normalize();
                    pushVtx(mesh, u, midNorm);
                    if (pi === 0) {
                        pushVtx(mesh, u, midNorm);
                    }
                } else {
                    pushVtx(mesh, u, lastNorm);
                    const newMesh = MeshUtil.createFlatMesh();
                    pushVtx(newMesh, u, curNorm);
                    sides.push(newMesh);
                }

                u += deltaU;
                lastNorm = curNorm;
            }
            sides[0].uvs[0] = u;
            sides[0].uvs[2] = u;

            // merge
            if (sides.length === 1) {
                const mesh = sides[0];
                const vn = mesh.vertices.length / 3;
                mesh.faces[0] = vn - 2;
                mesh.faces[2] = vn - 1;
                mesh.faces[3] = vn - 1;
            } else {
                const last = sides.pop()!;
                const mesh = MeshUtil.merge(last, sides[0]);
                sides[0] = mesh;
            }

            allSides.push(sides);
        }

        return { top, bottom, sides: allSides };
    }

    /**
     * 平面切割mesh，同时计算平面切割时部分，补面的uvTransform
     */
    private static _clip<MeshType extends types.IFlatMeshPlus>(
        mesh: MeshType,
        coord: Coord3,
        fillClip = false,
        xRange?: types.IInterval,
        interpolateFunction?: (
            oldMesh: MeshType,
            newMesh: MeshType,
            vertexIndex1: number,
            vertexIndex2: number,
            weight1: number,
        ) => void,
    ) {
        // init keys
        const vn = mesh.vertices.length / 3;
        const attrs: IMeshAttribute[] = [];
        for (const name of Object.keys(mesh)) {
            if (name !== 'faces' && name !== 'uvs' && name !== 'uvs1') {
                attrs.push({ name, stride: mesh[name].length / vn });
            }
        }

        const planeOrigin = coord.getOrigin();
        const planeNormal = coord.getDz();
        const nextMap = new Map<number, number[]>();
        const addNext = (v0: number, v1: number, v0ToV1: boolean) => {
            const [va, vb] = v0ToV1 ? [v0, v1] : [v1, v0];
            const nbrs1 = nextMap.get(va);

            if (nbrs1) {
                nbrs1.push(vb);
            } else {
                nextMap.set(va, [vb]);
            }
        };

        // 分类点
        const vtxPoss = new Array<PositionType>(vn);
        for (let vi = 0; vi < vn; vi++) {
            const d = MeshUtil._distanceToPlane(mesh.vertices, vi, planeOrigin, planeNormal);
            if (d > Tol.LENGTH) {
                vtxPoss[vi] = PositionType.Above;
            } else if (d < -Tol.LENGTH) {
                vtxPoss[vi] = PositionType.Below;
            } else {
                vtxPoss[vi] = PositionType.On;
            }
        }

        const newMesh = { faces: [] as number[] } as MeshType;
        for (const attr of attrs) {
            (newMesh as any)[attr.name] = mesh[attr.name].slice();
        }
        const newUvsList: number[][] = [];
        const uvSetCount = mesh.uvs.length / 2 / vn;

        for (let i = 0; i < uvSetCount; i++) {
            newUvsList.push(mesh.uvs.slice(i * vn * 2, (i + 1) * vn * 2));
        }

        let newUvs1List: number[][] = [], uv1SetCount = 0;
        if (mesh.uvs1) {
            newUvs1List = [];
            uv1SetCount = mesh.uvs1.length / 2 / vn;

            for (let i = 0; i < uv1SetCount; i++) {
                newUvs1List.push(mesh.uvs1.slice(i * vn * 2, (i + 1) * vn * 2));
            }
        }

        const newVtxMap = new Map<number, number>();
        const seedF0s: number[] = [];
        const stopVertices = new Set<number>();

        // return index of the new vertex
        const genIntersect = (idx1: number, idx2: number): number => {
            const key = idx1 < idx2 ? idx1 * vn + idx2 : idx2 * vn + idx1;
            const value = newVtxMap.get(key);
            if (value !== undefined) return value;

            const d1 = Math.abs(MeshUtil._distanceToPlane(mesh.vertices, idx1, planeOrigin, planeNormal));
            const d2 = Math.abs(MeshUtil._distanceToPlane(mesh.vertices, idx2, planeOrigin, planeNormal));
            const a1 = d2 / (d1 + d2);
            const a2 = 1 - a1;

            if (xRange) {
                const newVtx = {
                    x: mesh.vertices[idx1 * 3] * a1 + mesh.vertices[idx2 * 3] * a2,
                    y: mesh.vertices[idx1 * 3 + 1] * a1 + mesh.vertices[idx2 * 3 + 1] * a2,
                    z: mesh.vertices[idx1 * 3 + 2] * a1 + mesh.vertices[idx2 * 3 + 2] * a2,
                };

                const lpx = coord.getLocalPtAt(newVtx).x;
                if (lpx < xRange[0] || lpx > xRange[1]) return -1;
            }

            const isNormalUsed = mesh.normals.length > 0;

            for (let i = 0; i < 3; i++) {
                if (isNormalUsed)
                    newMesh.normals.push(mesh.normals[idx1 * 3 + i] * a1 + mesh.normals[idx2 * 3 + i] * a2);
                newMesh.vertices.push(mesh.vertices[idx1 * 3 + i] * a1 + mesh.vertices[idx2 * 3 + i] * a2);
            }
            for (let uvi = 0; uvi < uvSetCount; uvi++) {
                const uvs = newUvsList[uvi];
                const ofs = uvi * vn * 2;
                for (let i = 0; i < 2; i++) {
                    uvs.push(mesh.uvs[idx1 * 2 + i + ofs] * a1 + mesh.uvs[idx2 * 2 + i + ofs] * a2);
                }
            }
            if (mesh.uvs1) {
                for (let uvi = 0; uvi < uv1SetCount; uvi++) {
                    const uvs = newUvs1List[uvi];
                    const ofs = uvi * vn * 2;
                    for (let i = 0; i < 2; i++) {
                        uvs.push(mesh.uvs1[idx1 * 2 + i + ofs] * a1 + mesh.uvs1[idx2 * 2 + i + ofs] * a2);
                    }
                }
            }

            if (interpolateFunction) {
                interpolateFunction(mesh, newMesh, idx1, idx2, a1);
            }
            const idx = newMesh.vertices.length / 3 - 1;
            newVtxMap.set(key, idx);

            return idx;
        };

        const addFace = (idx0: number, idx1: number, idx2: number, isAntiClockwise: boolean) => {
            if (isAntiClockwise) {
                newMesh.faces.push(idx0, idx1, idx2);
            } else {
                newMesh.faces.push(idx0, idx2, idx1);
            }
        };

        // 筛选面
        for (let fi0 = 0; fi0 < mesh.faces.length; fi0 += 3) {
            const iPoses: number[][] = [[], [], []];
            const [iBelows, iOns, iAboves] = iPoses;

            for (let fi = fi0; fi < fi0 + 3; fi++) {
                const pos = vtxPoss[mesh.faces[fi]];
                iPoses[pos].push(fi);
            }

            if (iOns.length === 3) continue;

            // 全上 or 全下
            if (iBelows.length === 0) {
                newMesh.faces.push(mesh.faces[fi0], mesh.faces[fi0 + 1], mesh.faces[fi0 + 2]);
                seedF0s.push(fi0);

                if (iOns.length === 2 && fillClip) {
                    const v0ToV1 = !MeshUtil._isNext(iOns[0], iOns[1]);
                    addNext(mesh.faces[iOns[0]], mesh.faces[iOns[1]], v0ToV1);
                }
                continue;
            } else if (iAboves.length === 0) {
                if (xRange) {
                    const fiInXRange = iOns.findIndex(fi => {
                        const vi = mesh.faces[fi];
                        const pt = {
                            x: mesh.vertices[vi * 3],
                            y: mesh.vertices[vi * 3 + 1],
                            z: mesh.vertices[vi * 3 + 2],
                        };
                        const lpx = coord.getLocalPtAt(pt).x;
                        return xRange[0] < lpx && lpx < xRange[1];
                    });
                    if (fiInXRange >= 0) {
                        for (const fi of iBelows) {
                            stopVertices.add(mesh.faces[fi]);
                        }
                    }
                }
                continue;
            }

            const iBelow = iBelows[0];
            const iAbove = iAboves[0];

            // prettier-ignore
            const iThat =
                // eslint-disable-next-line no-nested-ternary
                iAboves.length === 2 ? iAboves[1] :
                    iBelows.length === 2 ? iBelows[1] : iOns[0];

            const vBelow = mesh.faces[iBelow];
            const vAbove = mesh.faces[iAbove];
            const vThat = mesh.faces[iThat];

            const isAntiClockwise = MeshUtil._isNext(iBelow, iAbove);
            const newIdx1 = genIntersect(vBelow, vAbove);
            if (newIdx1 < 0) continue;

            // 根据另一个点的位置生成面
            if (vtxPoss[vThat] === PositionType.Below) {
                const newIdx2 = genIntersect(vThat, vAbove);
                if (newIdx2 < 0) continue;

                addFace(newIdx1, vAbove, newIdx2, isAntiClockwise);
                if (fillClip) addNext(newIdx1, newIdx2, isAntiClockwise);
            } else if (vtxPoss[vThat] === PositionType.On) {
                addFace(newIdx1, vAbove, vThat, isAntiClockwise);
                if (fillClip) addNext(newIdx1, vThat, isAntiClockwise);
            } else {
                const newIdx2 = genIntersect(vThat, vBelow);
                if (newIdx2 < 0) continue;

                addFace(newIdx1, vAbove, vThat, isAntiClockwise);
                addFace(newIdx1, vThat, newIdx2, isAntiClockwise);
                if (fillClip) addNext(newIdx1, newIdx2, isAntiClockwise);
            }

            seedF0s.push(fi0);
            for (const fi of iBelows) {
                stopVertices.add(mesh.faces[fi]);
            }
        } // for mesh.faces

        if (xRange) {
            const isFj0Valid = (fj0: number) => [0, 1, 2].findIndex(j => stopVertices.has(mesh.faces[fj0 + j])) < 0;
            MeshAssist.pickNeighbourFaces(mesh.faces, newMesh.faces, seedF0s, isFj0Valid);
        }

        // 如果有切割，则计算一个uvTransform
        let uvTransform = coord.getWorldToLocalMatrix();
        let uvTransform1;
        if (newVtxMap.size > 0) {
            const intersectVTS = Array.from(newVtxMap.values()).map(
                i => new Vec3(newMesh.vertices[3 * i], newMesh.vertices[3 * i + 1], newMesh.vertices[3 * i + 2]),
            );
            const pts = intersectVTS.map(_ => _.transformed(uvTransform));
            const box = new Box2(pts);
            const translate = Matrix4.makeTranslate({ x: -box.min.x, y: -box.min.y, z: 0 });
            // const scale = Matrix4.makeScale(
            //     { x: 0, y: 0, z: 0 },
            //     { x: 1 / box.getSize().x, y: 1 / box.getSize().y, z: 1 },
            // );
            uvTransform1 = uvTransform = uvTransform.preMultiplied(translate);//.preMultiplied(scale);
            // 额外计算一个尺寸比例，保证uvTransform计算出来的区域比例相同
            if (mesh.faces.length > 3) {
                const id1 = mesh.faces[0];
                const id2 = mesh.faces[1];
                const vt1 = new Vec3({ x: mesh.vertices[id1 * 3], y: mesh.vertices[id1 * 3 + 1], z: mesh.vertices[id1 * 3 + 2] });
                const vt2 = new Vec3({ x: mesh.vertices[id2 * 3], y: mesh.vertices[id2 * 3 + 1], z: mesh.vertices[id2 * 3 + 2] });
                const uv1 = new Vec2({ x: mesh.uvs[id1 * 2], y: mesh.uvs[id1 * 2 + 1] });
                const uv2 = new Vec2({ x: mesh.uvs[id2 * 2], y: mesh.uvs[id2 * 2 + 1] });
                const uvScale = uv1.distanceTo(uv2) / vt1.distanceTo(vt2);
                uvTransform = uvTransform.preMultiplied(Matrix4.makeScale({ x: 0, y: 0, z: 9 }, uvScale));
                if (mesh.uvs1) {
                    const uv11 = new Vec2({ x: mesh.uvs1[id1 * 2], y: mesh.uvs1[id1 * 2 + 1] });
                    const uv12 = new Vec2({ x: mesh.uvs1[id2 * 2], y: mesh.uvs1[id2 * 2 + 1] });
                    const uv1Scale = uv11.distanceTo(uv12) / vt1.distanceTo(vt2);
                    uvTransform1 = uvTransform1.preMultiplied(Matrix4.makeScale({ x: 0, y: 0, z: 9 }, uv1Scale));
                }
            }
        }
        return { newMesh, newUvsList, newUvs1List, nextMap, attrs, uvTransform, uvTransform1 };
    }

    private static _fillClip<MeshType extends types.IFlatMesh>(
        mesh: MeshType,
        newUvsList: number[][],
        nextMap: Map<number, number[]>,
        coord: Coord3,
        uvTransform: Matrix4,
        newUvs1List: number[][] = [],
        uv1Transform?: Matrix4,
    ) {
        const polygons = MeshAssist.getLoop2ds(mesh, nextMap, coord);
        const normal = coord.getDz();

        const vn = mesh.vertices.length / 3;
        const attrs: IMeshAttribute[] = Object.keys(mesh)
            .filter(_ => !['faces', 'uvs', 'uvs1', 'normals', 'vertices'].includes(_))
            .map(_ => ({ name: _, stride: mesh[_].length / vn }));

        const vertexIndexMap = new Map<string, number>(); // 通过位置索引顶点编号

        const keyN = -Math.log10(Tol.LENGTH);
        const vertexKey = (vi: number): string => {
            const i = vi * 3;
            // eslint-disable-next-line
            return `${mesh.vertices[i].toFixed(keyN)}_${mesh.vertices[i + 1].toFixed(keyN)}_${mesh.vertices[
                i + 2
            ].toFixed(keyN)}`;
        };

        if (attrs.length > 0) {
            for (let i = 0; i < vn; i++) {
                vertexIndexMap.set(vertexKey(i), i);
            }
        }

        // make facelet
        const faceNorm = [-normal.x, -normal.y, -normal.z];
        for (const polygon of polygons) {
            const mesh2d = DiscreteUtil.tessVector2(polygon);
            const v0 = mesh.vertices.length / 3;

            for (let i = 0; i < mesh2d.faces.length; i += 3) {
                mesh.faces.push(mesh2d.faces[i] + v0, mesh2d.faces[i + 2] + v0, mesh2d.faces[i + 1] + v0);
            }

            for (const v2 of mesh2d.vertices) {
                const v3 = coord.getWorldPtAt(v2);
                mesh.vertices.push(...v3.data);
                mesh.normals.push(...faceNorm);
                const uv = v3.transformed(uvTransform);
                newUvsList.forEach(list => list.push(uv.x, uv.y));
                if (uv1Transform) {
                    const uv1 = v3.transformed(uv1Transform);
                    newUvs1List.forEach(list => list.push(uv1.x, uv1.y));
                }

                if (attrs.length > 0) {
                    const key = vertexKey(mesh.vertices.length / 3 - 1);
                    const oldIdx = vertexIndexMap.get(key) || 0;
                    for (const attr of attrs) {
                        const i0 = oldIdx * attr.stride;
                        const vs = mesh[attr.name];

                        for (let i = 0; i < attr.stride; i++) {
                            vs.push(vs[i0 + i]);
                        }
                    }
                }
            }
        }
    }

    private static _fillClipSeperate<MeshType extends types.IFlatMesh>(
        mesh: MeshType,
        nextMap: Map<number, number[]>,
        coord: Coord3,
    ): MeshType {
        const polygons = MeshAssist.getLoop2ds(mesh, nextMap, coord);
        const normal = coord.getDz();

        const vn = mesh.vertices.length / 3;
        const attrs: IMeshAttribute[] = Object.keys(mesh)
            .filter(_ => !['faces', 'uvs', 'normals', 'vertices'].includes(_))
            .map(_ => ({ name: _, stride: mesh[_].length / vn }));

        const vertexIndexMap = new Map<string, number>(); // 通过位置索引顶点编号

        const keyN = -Math.log10(Tol.LENGTH);
        const vertexKey = (vi: number): string => {
            const i = vi * 3;
            // eslint-disable-next-line
            return `${mesh.vertices[i].toFixed(keyN)}_${mesh.vertices[i + 1].toFixed(keyN)}_${mesh.vertices[
                i + 2
            ].toFixed(keyN)}`;
        };

        if (attrs.length > 0) {
            for (let i = 0; i < vn; i++) {
                vertexIndexMap.set(vertexKey(i), i);
            }
        }

        // make facelet
        const resMesh = {
            faces: [] as number[],
            normals: [] as number[],
            uvs: [] as number[],
            vertices: [] as number[],
        } as MeshType;
        for (const attr of attrs) {
            (resMesh as any)[attr.name] = [];
        }
        const faceNorm = [-normal.x, -normal.y, -normal.z];
        for (const polygon of polygons) {
            const mesh2d = DiscreteUtil.tessVector2(polygon);
            const v0 = resMesh.vertices.length / 3;

            for (let i = 0; i < mesh2d.faces.length; i += 3) {
                resMesh.faces.push(mesh2d.faces[i] + v0, mesh2d.faces[i + 2] + v0, mesh2d.faces[i + 1] + v0);
            }

            for (const v2 of mesh2d.vertices) {
                const v3 = coord.getWorldPtAt(v2);
                resMesh.vertices.push(...v3.data);
                resMesh.normals.push(...faceNorm);
                resMesh.uvs.push(v2.x, v2.y);

                if (attrs.length > 0) {
                    const key = vertexKey(mesh.vertices.length / 3 - 1);
                    const oldIdx = vertexIndexMap.get(key) || 0;
                    for (const attr of attrs) {
                        const i0 = oldIdx * attr.stride;
                        const vs = resMesh[attr.name];
                        const t = mesh[attr.name];

                        for (let i = 0; i < attr.stride; i++) {
                            vs.push(t[i0 + i]);
                        }
                    }
                }
            }
        }
        return resMesh;
    }

    private static _distanceToPlane(vertices: number[], vi: number, origin: Vec3, normal: Vec3): number {
        const vst = vi * 3;
        const pos = { x: vertices[vst], y: vertices[vst + 1], z: vertices[vst + 2] };
        return -origin.subtracted(pos).dot(normal);
    }

    private static _isNext(i1: number, i2: number): boolean {
        return (i2 - i1 + 3) % 3 === 1;
    }
}