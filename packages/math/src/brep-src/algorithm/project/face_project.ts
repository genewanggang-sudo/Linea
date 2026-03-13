import {
    Ln2,
    Plane,
    alg,
    Polygon,
    Loop,
    Interval,
    PolyCurve,
    Coord3,
    Vec2,
    Tol,
    DiscreteParam,
    MathAssert,
    Cylinder,
    Curve2,
    Arc2,
    CONST,
    Util,
    Matrix3,
    MatrixUtil,
    types,
} from '../../..';



import { Face } from '../../brep/face';

/**
 * line1向line2投影，返回一个区间，该区间代表投影后的线在line2上的区间
 */
class FaceProject {
    public static execute(face: Face, coordinate: Coord3): PolyCurve[] | Polygon {
        const targetPlane = new Plane(coordinate);

        // 平行，投影为一条线
        const surface = face.getSurface();
        if (
            surface.isPlane() &&
            surface.getNormAt(Vec2.O()).isPerpendicular(coordinate.getDz(), Tol.ANGLE)
        ) {
            const projectedSurface = face.getSurface() as Plane;
            const polygon = face.calcPolygon();
            MathAssert.assert(!polygon.isEmpty(), 'polygon不能为空');
            const paths = polygon.getLoops().map(l => {
                // 取出所有的三维点
                const xys = alg.DiscreteTopology.discretePolyline(l, DiscreteParam.HIGH);
                const v3ds = xys.map(xy => {
                    return projectedSurface.getPtAt(xy);
                });
                // 投影到参数域
                return v3ds.map(v3 => {
                    return targetPlane.getUVAt(v3);
                });
            });

            const polylines = FaceProject.mergeLines(paths);
            return polylines;
        }
        if (surface.isCylinder() && (surface as Cylinder).getCoord().getDz().isParallel(coordinate.getDz())) {
            const crv2d: Curve2[] = [];
            face.getWires().forEach(w => {
                w.getCoedge3ds().forEach(c =>
                    crv2d.push(alg.Project.curveToPlane(c.getCurve(), targetPlane)!),
                );
            });
            return this._makeArc2d(surface as Cylinder, crv2d, targetPlane);
        }

        const polygon = new Polygon();
        let shouldReverse = false;
        face.getWires().forEach((w, idx) => {
            const loop = new Loop();
            const crv2d: Curve2[] = [];
            w.getCoedge3ds().forEach(c =>
                crv2d.push(alg.Project.curveToPlane(c.getCurve(), targetPlane)!),
            );
            crv2d.forEach(_ => {
                if (_ instanceof Curve2) loop.addCurve(_);
            });
            loop.makeStartEndConnected();
            polygon.addLoop(loop, false);
            if (idx === 0) {
                shouldReverse = loop.calcArea() < 0;
            }
        });

        if (shouldReverse) {
            polygon.reverse();
        }

        return polygon;
    }

    public static toDiscretePolygons(face: Face, coordinate: Coord3): Polygon[] {
        const targetPlane = new Plane(coordinate);

        // 平行，投影为一条线
        const surface = face.getSurface();
        if (surface.isPlane()) {
            const prjPolyPt2ds: Vec2[][] = [];
            for (const w of face.getWires()) {
                const loopPt2ds: Vec2[] = [];
                for (const ce of w.getCoedge3ds()) {
                    const curveDiscretePt3ds = ce.getEdge()!.getCurve().discrete();
                    const cvPt2ds = curveDiscretePt3ds.map(v3 => {
                        return targetPlane.getUVAt(v3);
                    });
                    if (!ce.getSameDirWithEdge()) {
                        cvPt2ds.reverse();
                    }
                    loopPt2ds.push(...cvPt2ds);
                }
                prjPolyPt2ds.push(loopPt2ds);
            }

            if (surface.getNormAt(Vec2.O()).isPerpendicular(coordinate.getDz(), Tol.ANGLE)) {
                // const polylines = FaceProject.mergeLines(prjPolyPt2ds);
                // return polylines;
                return []; // 后续想办法处理？
            }

            const loops = prjPolyPt2ds.map(_l => new Loop(_l));
            const shouldReverse = loops[0].calcArea() < -Tol.LENGTH;
            if (shouldReverse) {
                loops.map(_l => _l.reverse());
            }
            const polygon = new Polygon(loops);
            return [polygon];
        }

        if (surface.isCylinder() && (surface as Cylinder).getCoord().getDz().isParallel(coordinate.getDz())) {
            // const crv2d: Curve2[] = [];
            // face.getWires().forEach(w => {
            //     w.getCoedge3ds().forEach(c =>
            //         crv2d.push(alg.Project.curveToPlane(c.getCurve(), targetPlane)!),
            //     );
            // });
            // return this._makeArc2d(surface as Cylinder, crv2d, targetPlane);
            return [];
        }

        // 曲面face的投影
        const flatMesh: types.IFlatMesh = {
            vertices: [],
            faces: [],
            normals: [],
            uvs: [],
        };
        // 使用低精度进行面的离散
        const renderNode = face.tessellate(DiscreteParam.LOW);
        const mesh = renderNode.mesh;
        if (!mesh) {
            return [];
        }
        mesh.vertices.forEach(_v => {
            flatMesh.vertices.push(_v[0]);
            flatMesh.vertices.push(_v[1]);
            flatMesh.vertices.push(_v[2]);
        });
        mesh.faces.forEach(_f => {
            flatMesh.faces.push(_f[0]);
            flatMesh.faces.push(_f[1]);
            flatMesh.faces.push(_f[2]);
        });
        mesh.normals.forEach(_n => {
            flatMesh.normals.push(_n[0]);
            flatMesh.normals.push(_n[1]);
            flatMesh.normals.push(_n[2]);
        });
        mesh.uvs.forEach(_uv => {
            flatMesh.uvs.push(_uv[0]);
            flatMesh.uvs.push(_uv[1]);
        });
        const contours = alg.MeshUtil.getContour(flatMesh);
        let matrix3: Matrix3 | undefined = new Matrix3(
            MatrixUtil.convertToMatrix3(targetPlane.getCoord().getWorldToLocalMatrix()),
        );
        if (matrix3.isIdentity()) {
            matrix3 = undefined;
        }

        const polygons: Polygon[] = [];
        contours.forEach(c => {
            const ptss = matrix3 ? c.map(pts => pts.map(it => new Vec2(it).transform(matrix3!))) : c;
            polygons.push(new Polygon(ptss));
        });

        return polygons;
    }

    public static mergeLines(paths: Vec2[][]): PolyCurve[] {
        // 合并直线
        let line0: Ln2 | undefined;
        const ranges = [];
        for (const path of paths) {
            for (let i = 0; i < path.length; i++) {
                if (path[i].equals(path[i === path.length - 1 ? 0 : i + 1])) {
                    continue;
                }

                const line = new Ln2(path[i], path[i === path.length - 1 ? 0 : i + 1]);
                if (!line0) {
                    line0 = line;
                    ranges.push(line0.getRange());
                    continue;
                }
                const range = alg.Project.line1ToLine2(line, line0);
                ranges.push(range);
            }
        }

        if (!line0) {
            return [];
        }
        MathAssert.assert(line0, 'line0?');
        // 合并
        const resultRanges = Interval.merge(ranges);

        return resultRanges.map(r => {
            const l = (line0 as Ln2).clone().setRange(r);
            const polyline = new PolyCurve();
            polyline.addCurve(l);
            return polyline;
        });
    }

    /**
     * 针对垂直平面的柱面，投影一定是二维圆弧，整体逻辑为：
     * 构造圆弧，针对每条投影曲线设置正确的参数域
     * @param cylinder
     * @param curve2d
     * @param projPlace
     * @returns
     */
    private static _makeArc2d(cylinder: Cylinder, curve2d: Curve2[], projPlace: Plane) {
        const polycurve: PolyCurve[] = [];
        const origin = projPlace.getCoord().getLocalPtAt(cylinder.getCoord().getOrigin());
        const A = projPlace.getCoord().getLocalPtAt(cylinder.getPtAt(new Vec2(0, 0)));
        const B = projPlace.getCoord().getLocalPtAt(cylinder.getPtAt(new Vec2(Math.PI * 0.5, 0)));
        const arc2d = Arc2.makeEllipseByFivePoints(origin, A, B, A, A);
        if (arc2d === undefined) return polycurve;
        let min = CONST.MAX_INTEGER;
        let max = -CONST.MAX_INTEGER;
        curve2d.forEach(crv => {
            if (crv !== undefined) {
                let st = arc2d.getParamAt(crv.getStartPt());
                let end = arc2d.getParamAt(crv.getEndPt());
                if (st > end) [st, end] = [end, st];
                const mid = arc2d.getParamAt(crv.getMidPt());
                if (!(mid > st && mid < end)) {
                    [st, end] = [end - Math.PI * 2, st];
                }
                if (min > st) min = st;
                if (max < end) max = end;
            }
        });
        if (Util.isNearlySmaller(max - min, Math.PI * 2)) {
            arc2d.setRange(min, max);
        }
        polycurve.push(new PolyCurve([arc2d!]));
        return polycurve;
    }
}

export { FaceProject };