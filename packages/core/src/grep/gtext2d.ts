import { Plane, Vec2 } from '@ccpc/math';
import { GNode2d } from './gnode2d'
import { RenderNode, RenderText } from '../render/render_node';
export class GText2d extends GNode2d {
    public position: Vec2 = Vec2.O();

    constructor(
        public text: string,
        plane: Plane,
        pos?: Vec2,
    ) {
        super(plane, Vec2.rO());
        if (pos) {
            this.position = pos;
        }
    }

    protected _toRenderNodeWithoutMatrix(): RenderNode {
        const render = new RenderText();
        render.text = this.text;
        render.position = this.position.toXYZ();
        return render;
    }

    public clone(): GText2d {
        return new GText2d(this.text, this.plane, this.position)._copy(this);
    }

    protected _copy(another: GText2d): this {
        super._copy(another);
        this.position = another.position.clone();
        return this;
    }
}
