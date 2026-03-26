import { IElement } from '../element/i_element';
import { GNode } from '../grep/gnode';

export interface ISelection {
    getSelectedGNodes(): Array<GNode>
    getSelectedElements(): Array<IElement>
}
