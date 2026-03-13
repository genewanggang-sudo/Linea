/* eslint-disable @typescript-eslint/prefer-for-of */
import {
    Ln3,
    Coord3,
    Polygon,
    Vec3,
    Matrix4,
    Plane,
    Arc3,
    Curve3,
    alg,
    Circle3d,
    Surface,
    Util,
    Cylinder,
    Loop,
    CONST,
    Curve2,
    Tol,
    Ln2,
    MathAssert,
} from '../../..';



import { Coedge3d } from '../../brep/coedge3d';
import { Face } from '../../brep/face';
import { Wire } from '../../brep/wire';
import { BrepBody } from '../../brep/brep_body';
import { SmoothUtil } from '../shell_edit/smooth/smooth_util';
import { Vertex } from '../../brep/vertex';
import { Edge } from '../../brep/edge';

/**
 *
 *  扫掠体
 * 路径支持Line3d, Arc3
 * 轮廓支持Line2d，Polygon包含一个外环，多个内环
 */
export class SweepBody {
    // path是否是封闭的
    private _pathClosed: boolean = true;

    private _profile2ds: Curve2[][] = [];

    private _profileReverse = false;

    constructor(
        // 扫描轮廓所在的局部坐标系
        public coordinate: Coord3,
        // 扫描轮廓
        public polygon2d: Polygon,
        // 扫描路径
        public path3d: Curve3[],
        // 自动调整扫描轮廓，垂直于路径
        public adjustProfile: boolean = true,
        // 自动调整扫描路径，寻找起始路径（距离近，且角度大）
        public adjustPath: boolean = false,
        // 拓扑追踪
        public topoTrack?: Map<Curve2 | 0 | 1, Face[]>,
    ) {
        //
    }

    public execute(): BrepBody {
        const body = new BrepBody();

        this._init();

        let trimedCurves: Curve3[][][];
        try {
            // 1.计算轮廓上每个点，沿着每段路径所生成的曲线
            const sweepCurves = this._calcSweepCurves();

            // 2.将相邻的路径上的曲线，求交裁剪
            trimedCurves = this._trimSweepCurves(sweepCurves);
        } catch (error) {
            return body;
        }

        // 3.构造brep
        this._buildSweepBody(trimedCurves, body);
        return body;
    }

    // 初始化轮廓和路径
    private _init() {
        if (!this.polygon2d.getLoops().length || !this.path3d.length) {
            return;
        }

        // 分解smooth poly
        this._decomposeSmoothPoly();
        this._pathClosed = true;
        if (!this.path3d[this.path3d.length - 1].getEndPt().equals(this.path3d[0].getStartPt(), Tol.LENGTH)) {
            this._pathClosed = false;
        }

        MathAssert.assert(() => this._pathIsValid(), `构造扫略体：输入路径中曲线类型不支持\n\n${this.path3d}`);
        MathAssert.assert(() => this._profileIsValid(), `构造扫略体：输入轮廓中曲线类型不支持\n\n${this.polygon2d}`);

        // 自动调整路径和轮廓
        this._adjustPath();
        this._adjustProfile();
    }

    private _decomposeSmoothPoly() {
        // 将smooth poly 分成简单的直线段，并记录smooth信息
        this.path3d = SmoothUtil.decomposeSmoothPoly(this.path3d) as Curve3[];

        this.polygon2d.getLoops().forEach(l => {
            const newCurves = SmoothUtil.decomposeSmoothPoly(l.getAllCurves()) as Curve2[];
            this._profile2ds.push(newCurves);
        });
    }

    private _pathIsValid(): boolean {
        return this.path3d.every(path => path.isArc3d() || path.isLine3d());
    }

    private _profileIsValid(): boolean {
        for (const p of this._profile2ds) {
            for (const curve of p) {
                if (!curve.isLine2d()) {
                    return false;
                }
            }
        }
        return true;
    }

    // 调整路径的顺序，使得第一段路径，和profile之间的距离最近，且角度接近垂直
    private _adjustPath() {
        if (!this.adjustPath) {
            return;
        }

        const p = this.coordinate.getWorldPtAt(this.polygon2d.getCentroidPoint());
        const distances = this.path3d.map((l, i) => {
            const d = alg.D.ptToCurve3d(p, l);
            return { d, i };
        });

        distances.sort((a, b) => a.d - b.d);

        const firsts = [distances.shift()!];
        let second: { d: number; i: number } | undefined;
        while (true) {
            const first = distances.shift();
            if (!first) {
                break;
            }
            if (
                this.path3d[firsts[firsts.length - 1].i]
                    .getStartTangent()
                    .isParallel(this.path3d[first.i].getStartTangent())
            ) {
                firsts.push(first);
                continue;
            }
            second = first;
            break;
        }

        if (!second) {
            return;
        }

        // 按距离找前2段
        const a = firsts[0];
        const b = second;

        // 从前2段按角度排
        const theta0 = this.path3d[a.i].getStartTangent().cross(this.coordinate.getDz()).getLength();
        const theta1 = this.path3d[b.i].getStartTangent().cross(this.coordinate.getDz()).getLength();
        let idx = theta0 < theta1 ? a.i : b.i;

        if (this._pathClosed) {
            while (idx) {
                this.path3d.push(this.path3d.shift()!);
                idx--;
            }
        } else {
            this.coordinate.translate(new Vec3(this.path3d[idx].getStartPt(), this.path3d[0].getStartPt()));

            const v1 = this.path3d[idx].getStartTangent();
            const v2 = this.path3d[0].getStartTangent();
            if (v1.isSameDirection(v2)) {
                return;
            }

            let norm: Vec3;
            if (v1.isParallel(v2)) {
                const v3 = new Vec3(this.path3d[idx].getStartPt(), this.path3d[0].getStartPt()).normalize();
                norm = v1.cross(v3);
            } else {
                norm = v1.cross(v2);
            }

            const rotation = Matrix4.makeRotate(this.path3d[0].getStartPt(), norm, v1.angleTo(v2, norm));

            this.coordinate.transform(rotation);
        }
    }

    // 检测第一段路径是否垂直于轮廓平面，修正轮廓的顺逆时针
    private _adjustProfile() {
        const firstPath = this.path3d[0];
        const closestPt = firstPath.getProjectedPtBy(this.coordinate.getOrigin());
        const pathTangVec = firstPath.getTangentAt(firstPath.getParamAt(closestPt));
        const sameDir = pathTangVec.dot(this.coordinate.getDz()) >= 0;
        if (!pathTangVec.isParallel(this.coordinate.getDz())) {
            if (!this.adjustProfile) {
                throw new Error('扫略：轮廓曲线不合法');
            }

            // 自动调整坐标系，让轮廓平面垂直于第一段路径
            // 计算投影面
            const perpendPlane = Plane.makeByPtNormal(closestPt, pathTangVec);
            const newOrigin = perpendPlane.getProjectedPtBy(this.coordinate.getOrigin());
            const newDeltaDx = perpendPlane.getProjectedPtBy(this.coordinate.getOrigin().add(this.coordinate.getDx()));
            const newDx = newDeltaDx.subtracted(newOrigin).normalize();
            // 新的坐标系
            const newCoordinate = new Coord3(newOrigin, newDx, pathTangVec.cross(newDx));

            // 新的投影轮廓
            const projectPlane = new Plane(newCoordinate);
            for (const profile of this._profile2ds) {
                const projectCurves = profile.map(c => {
                    const line2d = c as Ln2;
                    const newStart = projectPlane.getUVAt(this.coordinate.getWorldPtAt(line2d.getStartPt()));
                    const newEnd = projectPlane.getUVAt(this.coordinate.getWorldPtAt(line2d.getEndPt()));
                    const newLine2d = new Ln2(newStart, newEnd);
                    SmoothUtil.copySmoothInfo(line2d, newLine2d);
                    return newLine2d;
                });
                profile.splice(0, profile.length);
                profile.push(...projectCurves);
            }
            this.coordinate = newCoordinate;
        }

        // 检测轮廓线的顺逆时针，将外环校正成逆时针的，内环是顺时针的
        if (alg.LoopArea.areaOfLoop(this._profile2ds[0]) >= 0 !== sameDir) {
            this._profileReverse = true;
            this._profile2ds = this._profile2ds.map(profile => {
                profile.forEach(c => c.reverse());
                return profile.reverse();
            });
        }
    }

    // 分段扫略，计算出每个轮廓点所生成的曲线
    private _calcSweepCurves(): Curve3[][][] {
        const result: Curve3[][][] = [];
        let coord = this.coordinate.clone();
        for (let i = 0; i < this.path3d.length; i++) {
            const profilePlane = new Plane(coord);
            const profile3ds = this._profile2ds.map(loop => loop.map(c => profilePlane.getCurve3d(c)));

            const pathCurve = this.path3d[i];
            const pathIntersectPt = pathCurve.getProjectedPtBy(profilePlane.getOrigin());
            const arcPlane =
                pathCurve instanceof Arc3 ? new Plane(pathCurve.getCenter(), pathCurve.getNormal()) : undefined;

            const offsetPaths: Curve3[][] = [];
            // 三维轮廓曲线，带洞
            for (let j = 0; j < profile3ds.length; j++) {
                const profileCurves = profile3ds[j];
                const offsetPath: Curve3[] = [];
                for (let k = 0; k < profileCurves.length; k++) {
                    const profileCurveStartPt = profileCurves[k].getStartPt();
                    if (pathCurve instanceof Arc3) {
                        // 路径曲线为圆弧，重新构造
                        const projectPt = arcPlane!.getProjectedPtBy(profileCurveStartPt);
                        if (
                            Util.isNearlySmallerOrEqual(
                                projectPt
                                    .subtracted(pathCurve.getCenter())
                                    .dot(pathCurve.getStartPt().subtract(pathCurve.getCenter())),
                                0,
                            )
                        ) {
                            // 圆弧消失
                            throw new Error('扫略：轮廓曲线计算失败');
                        }
                        const newRadius = projectPt.distanceTo(pathCurve.getCenter());
                        const newEndPt = pathCurve
                            .getCenter()
                            .add(pathCurve.getEndPt().subtract(pathCurve.getCenter()).normalize().multiply(newRadius));
                        const newArc = Arc3.makeArcByStartEndPoints(
                            pathCurve.getCenter(),
                            newRadius,
                            pathCurve.getNormal(),
                            projectPt,
                            newEndPt,
                            true,
                        );
                        newArc.translate(profileCurveStartPt.subtracted(projectPt));
                        offsetPath.push(newArc);
                    } else {
                        // 直接将该段路径曲线平移过去
                        const translateVec = profileCurveStartPt.subtracted(pathIntersectPt);
                        offsetPath.push(pathCurve.clone().translate(translateVec));
                    }
                }
                offsetPaths.push(offsetPath);
            }
            result.push(offsetPaths);

            // 计算下一段的坐标系
            if (i < this.path3d.length - 1) {
                const nxtPathCurve = this.path3d[i + 1];
                // 将坐标系变换到当前曲线的终点所在平面
                let matrix = new Matrix4();
                if (pathCurve instanceof Arc3) {
                    matrix = Matrix4.makeRotate(
                        pathCurve.getCenter(),
                        pathCurve.getNormal(),
                        (pathCurve.getRange().max - pathCurve.getParamAt(pathIntersectPt)) / pathCurve.getRadius(),
                    );
                } else {
                    // 平移到终点
                    matrix = Matrix4.makeTranslate(pathCurve.getEndPt().subtracted(pathIntersectPt));
                }
                coord = coord.transform(matrix);

                // 将坐标系变换到下一段曲线的起点所在平面
                const curEndTangentVec = pathCurve.getTangentAt(pathCurve.getRange().max);
                const nxtStartTangentVec = nxtPathCurve.getTangentAt(nxtPathCurve.getRange().min);
                const refVec = curEndTangentVec.cross(nxtStartTangentVec);
                if (!refVec.isZero()) {
                    refVec.normalize();
                    const angle = curEndTangentVec.angleTo(nxtStartTangentVec, refVec);
                    matrix = Matrix4.makeRotate(nxtPathCurve.getStartPt(), refVec, angle);
                    coord = coord.transform(matrix);
                }
            }
        }
        return result;
    }

    private _trimSweepCurves(sweepCurves: Curve3[][][]): Curve3[][][] {
        // 1.将扫略曲线延长
        const trimCurveInfos = sweepCurves.map((segment, index) =>
            segment.map(curves =>
                curves.map(c => {
                    return {
                        path: this.path3d[index],
                        originCurve: c,
                        extendCurve: this._extendCurve(c),
                    } as IOriginCurve;
                }),
            ),
        );

        // 2.分段计算裁剪点
        for (let i = 1; i < trimCurveInfos.length; i++) {
            for (let j = 0; j < trimCurveInfos[i].length; j++) {
                for (let k = 0; k < trimCurveInfos[i][j].length; k++) {
                    const preInfo = trimCurveInfos[i - 1][j][k];
                    const curInfo = trimCurveInfos[i][j][k];
                    this._calculateTrimedPoint(preInfo, curInfo);
                }
            }
        }

        if (this._pathClosed && this.path3d.length > 1) {
            // 首尾计算裁剪点
            for (let j = 0; j < trimCurveInfos[0].length; j++) {
                for (let k = 0; k < trimCurveInfos[0][j].length; k++) {
                    const preInfo = trimCurveInfos[trimCurveInfos.length - 1][j][k];
                    const curInfo = trimCurveInfos[0][j][k];
                    this._calculateTrimedPoint(preInfo, curInfo);
                }
            }
        } else {
            // 使用原始的起始点，终止点，作为裁剪点
            for (let j = 0; j < trimCurveInfos[0].length; j++) {
                for (let k = 0; k < trimCurveInfos[0][j].length; k++) {
                    const preInfo = trimCurveInfos[trimCurveInfos.length - 1][j][k];
                    const curInfo = trimCurveInfos[0][j][k];
                    preInfo.trimedEPt = preInfo.originCurve.getEndPt();
                    curInfo.trimedSPt = curInfo.originCurve.getStartPt();
                }
            }
        }

        // 3.分段裁剪，得到有效的裁剪曲线
        for (let i = 0; i < trimCurveInfos.length; i++) {
            for (let j = 0; j < trimCurveInfos[i].length; j++) {
                for (let k = 0; k < trimCurveInfos[i][j].length; k++) {
                    this._calculateTrimedCurve(trimCurveInfos[i][j][k]);
                }
            }
        }

        return trimCurveInfos.map(segment => segment.map(curveInfos => curveInfos.map(info => info.trimedCurve!)));
    }

    private _calculateTrimedPoint(preTrimInfo: IOriginCurve, curTrimInfo: IOriginCurve) {
        if (preTrimInfo.originCurve.getEndPt().equals(curTrimInfo.originCurve.getStartPt())) {
            preTrimInfo.trimedEPt = preTrimInfo.originCurve.getEndPt();
            curTrimInfo.trimedSPt = curTrimInfo.originCurve.getStartPt();
            return;
        }

        // 沿着路径方向的，相邻两段曲线求交，计算裁剪点
        const intersectPts = alg.X.curve3ds(preTrimInfo.extendCurve, curTrimInfo.extendCurve);
        if (!intersectPts.length) {
            throw new Error('扫略：裁剪点计算失败');
        }

        if (intersectPts.length === 1) {
            preTrimInfo.trimedEPt = intersectPts[0].point;
            curTrimInfo.trimedSPt = intersectPts[0].point;
        }

        if (intersectPts.length > 1) {
            // 选择一个交点作为裁剪点
            if (
                (preTrimInfo.originCurve.isLine3d() && curTrimInfo.originCurve.isArc3d()) ||
                (preTrimInfo.originCurve.isArc3d() && curTrimInfo.originCurve.isLine3d())
            ) {
                // 选择一个最近的交点作为裁剪点
                const pathPt = preTrimInfo.path.getEndPt();
                intersectPts.sort((p1, p2) => p1.point.distanceTo(pathPt) - p2.point.distanceTo(pathPt));
                const choosenPt = intersectPts[0].point;
                preTrimInfo.trimedEPt = choosenPt;
                curTrimInfo.trimedSPt = choosenPt;
            } else if (preTrimInfo.originCurve.isArc3d() && curTrimInfo.originCurve.isArc3d()) {
                const pathPt = preTrimInfo.path.getEndPt();
                intersectPts.sort((p1, p2) => p1.point.distanceTo(pathPt) - p2.point.distanceTo(pathPt));
                let choosenPt = intersectPts[0].point;
                if (
                    Util.isNearlyEqual(
                        intersectPts[0].point.distanceTo(pathPt),
                        intersectPts[1].point.distanceTo(pathPt),
                    )
                ) {
                    const pathMidPt = preTrimInfo.path.getMidPt();
                    if (intersectPts[0].point.distanceTo(pathMidPt) > intersectPts[1].point.distanceTo(pathMidPt)) {
                        choosenPt = intersectPts[1].point;
                    }
                }
                preTrimInfo.trimedEPt = choosenPt;
                curTrimInfo.trimedSPt = choosenPt;
            } else {
                throw new Error('扫略：选择裁剪点失败');
            }
        }
    }

    private _calculateTrimedCurve(trimCurveInfo: IOriginCurve) {
        // 检测裁剪点，是否有效
        if (
            trimCurveInfo.originCurve.getParamAt(trimCurveInfo.trimedSPt!) >
            trimCurveInfo.originCurve.getParamAt(trimCurveInfo.trimedEPt!)
        ) {
            throw new Error('扫略：裁剪点无效');
        }

        // 计算裁剪曲线
        if (trimCurveInfo.originCurve.isLine3d()) {
            trimCurveInfo.trimedCurve = new Ln3(trimCurveInfo.trimedSPt!, trimCurveInfo.trimedEPt!);
        } else if (trimCurveInfo.originCurve.isArc3d()) {
            const circle = trimCurveInfo.extendCurve as Circle3d;
            const newArc = Arc3.makeArcByCircleAndPts(
                circle,
                trimCurveInfo.trimedSPt!,
                trimCurveInfo.trimedEPt!,
                true,
            );
            trimCurveInfo.trimedCurve = newArc;
        } else {
            throw new Error('不支持的曲线类型');
        }
    }

    private _buildSweepBody(trimedCurves: Curve3[][][], body: BrepBody): void {
        const vertexCacheMap = new Map<string, Vertex>();
        const edgeCacheMap = new Map<string, Edge>();

        const pathSmoothV: boolean[] = [];
        for (let i = 0; i < trimedCurves.length; i++) {
            let pathSmooth;
            if (!this._pathClosed && i === 0) {
                pathSmooth = false;
            } else {
                pathSmooth = SmoothUtil.isSameSmoothPoly(
                    this.path3d[i],
                    this.path3d[(i + this.path3d.length - 1) % this.path3d.length],
                );
            }
            pathSmoothV.push(pathSmooth);
        }

        const profileSmoothV: boolean[][] = [];
        for (let j = 0; j < trimedCurves[0].length; j++) {
            const smoothV: boolean[] = [];
            for (let k = 0; k < trimedCurves[0][j].length; k++) {
                const profileSmooth = SmoothUtil.isSameSmoothPoly(
                    this._profile2ds[j][k],
                    this._profile2ds[j][(k + trimedCurves[0][j].length - 1) % trimedCurves[0][j].length],
                );
                smoothV.push(profileSmooth);
            }
            profileSmoothV.push(smoothV);
        }

        // 1.添加Vertex
        for (let i = 0; i < trimedCurves.length; i++) {
            let index = 0;
            for (let j = 0; j < trimedCurves[i].length; j++) {
                for (let k = 0; k < trimedCurves[i][j].length; k++) {
                    const curve = trimedCurves[i][j][k];
                    const vertex = body.createVertex(curve.getStartPt());
                    vertexCacheMap.set(`${i}-${index++}`, vertex);
                    if (pathSmoothV[i] || profileSmoothV[j][k]) {
                        vertex.setSmooth(true);
                    }
                }
            }

            // 不封闭的路径
            if (i === trimedCurves.length - 1 && !this._pathClosed) {
                index = 0;
                for (let j = 0; j < trimedCurves[i].length; j++) {
                    for (let k = 0; k < trimedCurves[i][j].length; k++) {
                        const curve = trimedCurves[i][j][k];
                        const vertex = body.createVertex(curve.getEndPt());
                        vertexCacheMap.set(`${i + 1}-${index++}`, vertex);
                        if (profileSmoothV[j][k]) {
                            vertex.setSmooth(true);
                        }
                    }
                }
            }
        }

        // 2.添加Edge -- 腰线
        for (let i = 0; i < trimedCurves.length; i++) {
            let index = 0;
            for (let j = 0; j < trimedCurves[i].length; j++) {
                const trimCurveLength = trimedCurves[i][j].length;
                for (let k = 0; k < trimCurveLength; k++) {
                    const startTag = `${i}-${k + index}`;
                    const endTag = `${i}-${((k + 1) % trimCurveLength) + index}`;
                    const edge = body.createLineEdge(vertexCacheMap.get(startTag)!, vertexCacheMap.get(endTag)!);
                    edgeCacheMap.set(`${startTag}>${endTag}`, edge);
                    if (pathSmoothV[i]) {
                        edge.setSmooth(true);
                    }
                }
                index += trimCurveLength;
            }

            // 不封闭的路径
            if (i === trimedCurves.length - 1 && !this._pathClosed) {
                index = 0;
                for (let j = 0; j < trimedCurves[i].length; j++) {
                    const trimCurveLength = trimedCurves[i][j].length;
                    for (let k = 0; k < trimCurveLength; k++) {
                        const startTag = `${i + 1}-${k + index}`;
                        const endTag = `${i + 1}-${((k + 1) % trimCurveLength) + index}`;
                        const edge = body.createLineEdge(vertexCacheMap.get(startTag)!, vertexCacheMap.get(endTag)!);
                        edgeCacheMap.set(`${startTag}>${endTag}`, edge);
                    }
                    index += trimCurveLength;
                }
            }
        }

        // 2.添加Edge -- 脊线
        const segNum = this._pathClosed ? this.path3d.length : this.path3d.length + 1;
        for (let i = 0; i < trimedCurves.length; i++) {
            let index = 0;
            for (let j = 0; j < trimedCurves[i].length; j++) {
                for (let k = 0; k < trimedCurves[i][j].length; k++) {
                    const startTag = `${i}-${k + index}`;
                    const endTag = `${(i + 1) % segNum}-${k + index}`;
                    const edge = body.createEdge(
                        trimedCurves[i][j][k],
                        vertexCacheMap.get(startTag)!,
                        vertexCacheMap.get(endTag)!,
                    );
                    edgeCacheMap.set(`${startTag}>${endTag}`, edge);
                    if (profileSmoothV[j][k]) {
                        edge.setSmooth(true);
                    }
                }
                index += trimedCurves[i][j].length;
            }
        }

        // 拓扑追踪
        let facesArr: Face[][] | undefined;
        if (this.topoTrack) {
            facesArr = [];
            for (let i = 0; i < trimedCurves[0][0].length; i++) {
                const faces: Face[] = [];
                facesArr?.push(faces);
            }
        }

        // 3.添加Face -- 侧面
        for (let i = 0; i < trimedCurves.length; i++) {
            const iNextIdx = (i + 1) % segNum;

            let index = 0;
            for (let j = 0; j < trimedCurves[i].length; j++) {
                const trimCurveLength = trimedCurves[i][j].length;
                for (let k = 0; k < trimedCurves[i][j].length; k++) {
                    const kNextIdx = (k + 1) % trimCurveLength;

                    const A = `${i}-${k + index}`;
                    const B = `${i}-${kNextIdx + index}`;
                    const C = `${iNextIdx}-${k + index}`;
                    const D = `${iNextIdx}-${kNextIdx + index}`;

                    const coedge3ds = [
                        new Coedge3d(edgeCacheMap.get(`${A}>${B}`)!, true),
                        new Coedge3d(edgeCacheMap.get(`${B}>${D}`)!, true),
                        new Coedge3d(edgeCacheMap.get(`${C}>${D}`)!, false),
                        new Coedge3d(edgeCacheMap.get(`${A}>${C}`)!, false),
                    ];

                    const trimCurveAC = trimedCurves[i][j][k];
                    const trimCurveBD = trimedCurves[i][j][kNextIdx];

                    let surface: Surface;
                    let sameDir = true;
                    if (this.path3d[i] instanceof Arc3) {
                        const circle1 = trimCurveAC as Arc3;
                        const circle2 = trimCurveBD as Arc3;
                        const centerDiff = circle2.getCenter().subtracted(circle1.getCenter());
                        if (centerDiff.isZero()) {
                            // 共平面
                            const vecAB = trimCurveBD.getStartPt().subtracted(trimCurveAC.getStartPt()).normalize();
                            const norm = vecAB.cross(trimCurveAC.getStartTangent()).normalize();
                            surface = new Plane(trimCurveAC.getStartPt(), norm);
                        } else if (Util.isNearlyEqual(circle1.getRadius(), circle2.getRadius())) {
                            // 圆柱面
                            surface = Cylinder.makeCylinderByArc3d(circle1);
                            if (centerDiff.dot(circle1.getNormal()) > 0) {
                                sameDir = false;
                            }
                        } else {
                            // 圆锥面
                            throw new Error('unexpected case');
                        }
                    } else {
                        // 构造平面
                        const AB = new Vec3(trimCurveAC.getStartPt(), trimCurveBD.getStartPt()).normalize();
                        const BD = (trimCurveBD as Ln3).toVector3().normalized();
                        const norm = AB.cross(BD).normalize();
                        const dy = norm.cross(BD);
                        // surface = new Plane(trimCurveAC.getStartPt(), BD, dy);
                        surface = new Plane(trimCurveBD.getStartPt(), BD, dy);
                    }
                    const wire = new Wire(coedge3ds);
                    if (!sameDir) {
                        wire.reverse();
                    }
                    const face = new Face(surface!, sameDir, [wire]);
                    facesArr?.[k].push(face);
                    body.addFace(face);
                }
                index += trimCurveLength;
            }
        }

        if (this.topoTrack) {
            const curves = this.polygon2d.getAllCurves();
            curves.forEach((cv, idx) => {
                // const i = this._profileReverse ? curves.length - idx : idx;
                const i = this._profileReverse ? curves.length - idx - 1 : idx;
                this.topoTrack?.set(curves[i], facesArr![idx]);
            });
        }

        // 3.添加Face -- 顶面和底面
        if (!this._pathClosed) {
            // 顶面
            {
                const i = 0;
                let index = 0;
                const wires: Wire[] = [];
                for (let j = 0; j < trimedCurves[i].length; j++) {
                    const trimCurveLength = trimedCurves[i][j].length;
                    const coedge3ds: Coedge3d[] = [];
                    for (let k = 0; k < trimCurveLength; k++) {
                        coedge3ds.push(
                            new Coedge3d(
                                edgeCacheMap.get(`${i}-${k + index}>${i}-${((k + 1) % trimCurveLength) + index}`)!,
                                true,
                            ),
                        );
                    }
                    wires.push(new Wire(coedge3ds));
                    index += trimCurveLength;
                }
                const ptOnFace = wires[0].getCoedge3ds()[0].getStartVertex().getPoint();

                const surface = new Plane(ptOnFace, this.coordinate.getDx(), this.coordinate.getDy());
                const face = new Face(surface, false, wires);
                body.addFace(face);
                if (this.topoTrack) {
                    this.topoTrack.set(1, [face]);
                }
            }
            // 底面
            {
                const i = trimedCurves.length;
                let index = 0;
                const wires: Wire[] = [];
                for (let j = 0; j < trimedCurves[i - 1].length; j++) {
                    const trimCurveLength = trimedCurves[i - 1][j].length;
                    const coedge3ds: Coedge3d[] = [];
                    for (let k = 0; k < trimCurveLength; k++) {
                        coedge3ds.push(
                            new Coedge3d(
                                edgeCacheMap.get(`${i}-${k + index}>${i}-${((k + 1) % trimCurveLength) + index}`)!,
                                true,
                            ),
                        );
                    }
                    wires.push(new Wire(coedge3ds));
                    index += trimCurveLength;
                }

                const pts = trimedCurves[trimedCurves.length - 1][0].map(curve => curve.getEndPt());
                const normal = this._getPointsCCWNormal(pts);
                if (!normal) {
                    throw new Error('sweep: get normal failed!');
                }
                const ptOnFace = wires[0].getCoedge3ds()[0].getStartVertex().getPoint();
                const surface = new Plane(ptOnFace, normal);
                const face = new Face(surface, true, wires);
                body.addFace(face);
                if (this.topoTrack) {
                    this.topoTrack.set(0, [face]);
                }
            }
        }
    }

    // 将曲线延长
    private _extendCurve(curve: Curve3): Curve3 {
        if (curve instanceof Ln3) {
            return new Ln3(curve.getOrigin(), curve.getDirection(), [
                -CONST.MODEL_MAX_LENGTH,
                CONST.MODEL_MAX_LENGTH,
            ]);
        }
        if (curve instanceof Arc3) {
            return curve.getCircle();
        }
        throw new Error('不支持的曲线类型');
    }

    // 从共面的点中计算逆时针法向
    private _getPointsCCWNormal(pts: Vec3[]): Vec3 | undefined {
        const normal = this._getNormalOfPtSequence(pts);
        if (!normal) {
            return undefined;
        }
        const plane: Plane = new Plane(pts[0], normal);
        const pt2ds = pts.map(pt3d => plane.getUVAt(pt3d));
        const loop = new Loop(pt2ds);
        if (!loop.isAnticlockwise()) {
            return normal.reverse();
        }
        return normal;
    }

    private _getNormalOfPtSequence(pts: Vec3[]): Vec3 | undefined {
        let normal: Vec3 | undefined;
        for (let i = 0, len = pts.length; i < len; i++) {
            const pt1 = pts[i];
            for (let j = i + 1; j < len + i; j++) {
                const pt2 = pts[j % len];
                for (let k = j + 1; k < len + i; k++) {
                    const pt3 = pts[k % len];
                    normal = this._getNormalOfThreePoints(pt1, pt2, pt3);
                    if (normal) {
                        break;
                    }
                }

                if (normal) {
                    break;
                }
            }

            if (normal) {
                break;
            }
        }
        return normal;
    }

    private _getNormalOfThreePoints(pt1: Vec3, pt2: Vec3, pt3: Vec3): Vec3 | undefined {
        const v1 = pt2.subtracted(pt1);
        const v2 = pt3.subtracted(pt1);
        const v3 = pt3.subtracted(pt2);
        if (
            Util.isNearly0(v1.getLength()) ||
            Util.isNearly0(v2.getLength()) ||
            Util.isNearly0(v3.getLength())
        ) {
            return undefined;
        }

        const n = v1.cross(v2);
        if (n.isZero()) {
            return undefined;
        }
        return n.normalize();
    }
}

interface IOriginCurve {
    // 原始路径
    path: Curve3;
    // 扫略曲线
    originCurve: Curve3;
    // 延长后的扫略曲线
    extendCurve: Curve3;
    // 裁剪起点
    trimedSPt?: Vec3;
    // 裁剪终点
    trimedEPt?: Vec3;
    // 裁剪后的扫略曲线
    trimedCurve?: Curve3;
}