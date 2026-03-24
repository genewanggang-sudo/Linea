import { Plane, Vec2 } from '@ccpc/math';
import { GNode2d } from './gnode2d'
import { RenderNode, RenderText } from '../render/render_node';
import { GNODE_TYPE } from './gnode_type';
import { IStyle } from './i_style';
import { StyleUtils } from './style_utils';
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

    public setStyle(style: IStyle) {
        super.setStyle(style)
        if (this._renderNode) {
            this._renderNode.style = StyleUtils.getTextStyle(this.getStyle())
        }
        return this
    }

    public override getType(): GNODE_TYPE {
        return GNODE_TYPE.GText2d
    }

    protected _toRenderNodeWithoutMatrix(): RenderNode {
        const render = new RenderText();
        render.text = this.text;
        render.position = this.position.toXYZ();
        render.style = StyleUtils.getTextStyle(this.getStyle())
        return render;
    }

    public clone(): GText2d {
        const gText = new GText2d(this.text, this.plane.clone(), this.position)
        gText._copyFrom(this)
        return gText
    }
}
