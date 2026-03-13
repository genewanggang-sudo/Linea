import { Ln3 } from '../../geometry/ln3';
import { Box3 } from '../../base/box3';
import { Interval } from '../../base/interval';
import { Vec3 } from '../../base/vec3';
import { Coord3 } from '../../base/coord3';
import { TrimmedSurface } from '../../topology/trimmed_surface';
import { Plane } from '../../geometry/plane';
import { Tol } from '../../base/tol';
import { TiltBox3 } from '../../base/tilt_box';



export function boxToTrimmedSurfaces(box3d: Box3): TrimmedSurface[] {
    const halfX = (box3d.max.x - box3d.min.x) / 2;
    const halfY = (box3d.max.y - box3d.min.y) / 2;
    const halfZ = (box3d.max.z - box3d.min.z) / 2;
    const boxCenter = box3d.getCenter();
    const pos1 = boxCenter.translated(Vec3.Z().multiplied(halfZ));
    const coord1 = new Coord3(pos1, Vec3.X(), Vec3.Y());
    const trimSurf1 = TrimmedSurface.createPlane(coord1, halfX, halfY);

    const pos2 = boxCenter.translated(Vec3.Z().multiplied(-halfZ));
    const coord2 = new Coord3(pos2, Vec3.X(), Vec3.Y().reversed());
    const trimSurf2 = TrimmedSurface.createPlane(coord2, halfX, halfY);

    const pos3 = boxCenter.translated(Vec3.X().multiplied(halfX));
    const coord3 = new Coord3(pos3, Vec3.Y(), Vec3.Z());
    const trimSurf3 = TrimmedSurface.createPlane(coord3, halfY, halfZ);

    const pos4 = boxCenter.translated(Vec3.X().multiplied(-halfX));
    const coord4 = new Coord3(pos4, Vec3.Y().reversed(), Vec3.Z());
    const trimSurf4 = TrimmedSurface.createPlane(coord4, halfY, halfZ);

    const pos5 = boxCenter.translated(Vec3.Y().multiplied(halfY));
    const coord5 = new Coord3(pos5, Vec3.X().reversed(), Vec3.Z());
    const trimSurf5 = TrimmedSurface.createPlane(coord5, halfX, halfZ);

    const pos6 = boxCenter.translated(Vec3.Y().multiplied(-halfY));
    const coord6 = new Coord3(pos6, Vec3.X(), Vec3.Z());
    const trimSurf6 = TrimmedSurface.createPlane(coord6, halfX, halfZ);

    const trimedSurfs = [trimSurf1, trimSurf2, trimSurf3, trimSurf4, trimSurf5, trimSurf6];
    if (box3d instanceof TiltBox3) {
        const mat = box3d.getCoord().getLocalToWorldMatrix();
        for (const tf of trimedSurfs) {
            tf.transform(mat);
        }
    }
    return trimedSurfs;
}

export function boxCutLine(line: Ln3, box3d: Box3): Interval | undefined {
    const lineClone = line.clone();
    lineClone.setRange(-1e7, 1e7); // 因为extend surface的box可能到了比1e6更远的地方，所以要设更大
    if (box3d instanceof TiltBox3) {
        const coordMat = box3d.getCoord().getWorldToLocalMatrix();
        lineClone.transform(coordMat);
    }

    const lineDir = lineClone.getDirection();
    const lineXTrimedSurf = (trimedSurf: TrimmedSurface) => {
        const plane = trimedSurf.getSurface() as Plane;
        const polyCv2ds = trimedSurf.getUVPolygon().getLoops()[0].getAllCurves();
        const rangeU = new Interval(polyCv2ds[0].getStartPt().x, polyCv2ds[0].getEndPt().x);
        const rangeV = new Interval(polyCv2ds[1].getStartPt().y, polyCv2ds[1].getEndPt().y);
        const OP = new Vec3(lineClone.getOrigin(), plane.getOrigin());

        // 直线和平面平行
        if (Math.abs(lineDir.dot(plane.getNorm())) < Tol.ANGLE) {
            return undefined; // box的其他面和直线有交点，此面交点不算
        }

        const t = OP.dot(plane.getNorm()) / lineDir.dot(plane.getNorm());
        const pt = lineClone.getPtAt(t);
        const surfaceUV = plane.getUVAt(pt);
        if (
            rangeU.containsPt(surfaceUV.x, Tol.NUMBER) &&
            rangeV.containsPt(surfaceUV.y, Tol.NUMBER)
        ) {
            return t;
        }
        return undefined;
    };

    const xParams: number[] = [];
    const localBox = new Box3([box3d.min, box3d.max]);
    const trimmedSurfs = boxToTrimmedSurfaces(localBox);
    for (const tf of trimmedSurfs) {
        const xParam = lineXTrimedSurf(tf);
        if (xParam !== undefined) {
            xParams.push(xParam);
        }
    }

    if (xParams.length === 0) {
        return undefined;
    }

    let newRange: Interval;
    if (xParams.length === 1) {
        newRange = new Interval(xParams[0] - Tol.LENGTH, xParams[0] + Tol.LENGTH);
    } else {
        newRange = new Interval(xParams[0], xParams[1], true);
    }

    const xRanges = line.getRange().intersected(newRange);
    if (xRanges.length === 0) {
        return undefined;
    }
    return xRanges[0];
}