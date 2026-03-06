import { ElementId } from '../element/element_id';

// TODO 补充完整
export class GRep {

    /**
     * 为减少对象的构造，可直接引用GRep.empty,来构造空的grep
     */
    public static get empty() {
        return new GRep();
    }

    /**
     * 关联的element的iD
     */
    private _refElementId = ElementId.INVALID;

    public get elementId() {
        return this._refElementId
    }

    public set elementId(eId: ElementId) {
        this._refElementId = eId
    }

    public isEmpty() {
        return true
    }
}
