import type { IDBEleId } from '../types/dump_type'

class ElementId {
    public static get INVALID() {
        return new ElementId(-1);
    }

    protected _id: number = -1;

    constructor(id: number) {
        this._id = id;
    }

    public asInt() {
        return this._id;
    }

    public equals(id: ElementId) {
        return this._id === id.asInt();
    }

    public isValid() {
        return this._id && this._id > -1;
    }

    public toString() {
        return '' + this._id;
    }

    public dump(): IDBEleId {
        return {
            id: this._id,
        };
    }

    public load(json: IDBEleId) {
        this._id = json.id;
    }
}

export { ElementId };
