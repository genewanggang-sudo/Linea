import { alg, DiscreteParam, Plane, Polygon, Vec3 } from '@ccpc/math';
import { GNode2d } from './gnode2d';
import { RenderMesh, RenderNode } from '../render/render_node';
import { DebugUtil } from '../toolkit/debug_util';

export class GPolygon extends GNode2d {
    public declare geo: Polygon;

    constructor(plane: Plane, geo: Polygon) {
        super(plane, geo);
    }

    protected _toRenderNodeWithoutMatrix(discreteParams?: DiscreteParam): RenderNode {
        return this.toRenderNodeForActive(discreteParams);
    }

    public toRenderNodeForActive(discreteParams?: DiscreteParam) {
        const render = new RenderMesh();

        try {
            const mesh2ds = alg.DiscreteTopology.tessPolygon(this.geo, discreteParams);
            const { vertices, faces } = mesh2ds;
            render.setVerts(
                vertices.map(xy => {
                    return this.plane.getPtAt(xy);
                }),
            );
            if (faces) {
                render.setIndices(new Uint32Array(faces));
            }

            const normals: Vec3[] = [];
            for (let i = 0; i < vertices.length; i++) {
                normals.push(this.plane.getNorm());
            }
            render.setNormals(normals);

            // TODO 暂时不考虑UV
        } catch (e) {
            console.error(e);
            DebugUtil.warn(false, 'invalid gface', 'wg', '2026-03-13');
        }
        return render;
    }

    public clone(): GPolygon {
        const cloned = new GPolygon(this.plane.clone(), this.geo.clone());
        cloned._copy(this);
        return cloned;
    }
}
