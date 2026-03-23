import { IElement } from '../element/i_element';
import { GNode } from '../grep/gnode';

export interface IHighLight {
    getActiveGNodes(): Array<GNode>
    getActiveElements(): Array<IElement>
}
