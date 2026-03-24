import { alg, DiscreteParam, Plane, Polygon, Vec3 } from '@ccpc/math';
import { GNode2d } from './gnode2d';
import { RenderMesh, RenderNode } from '../render/render_node';
import { DebugUtil } from '../toolkit/debug_util';
import { GNODE_TYPE } from './gnode_type';
import { IStyle } from './i_style';
import { StyleUtils } from './style_utils';

export class GPolygon extends GNode2d {
    public declare geo: Polygon;

    constructor(plane: Plane, geo: Polygon) {
        super(plane, geo);
    }

    public setStyle(style: IStyle) {
        super.setStyle(style)
        if (this._renderNode) {
            this._renderNode.style = StyleUtils.getFaceStyle(this.getStyle())
        }
        return this
    }

    public override getType(): GNODE_TYPE {
        return GNODE_TYPE.GPolygon
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
        render.style = StyleUtils.getFaceStyle(this.getStyle())
        return render;
    }

    public clone(cloneGeo?: boolean): GPolygon {
        const gPolygon = new GPolygon(this.plane.clone(), cloneGeo ? this.geo.clone() : this.geo)
        return gPolygon._copyFrom(this)
    }
}
