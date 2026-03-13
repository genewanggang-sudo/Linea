import { Box3 } from '../../base/box3';
import { GeoElement } from '../../base/geo_element';
import { BrepUtil } from '../util/util';
import { IDBTopoObject, ITopoDebugData } from '../type_define/i_types';



/**
 *  拓扑对象的基类
 */
abstract class TopoObject extends GeoElement {
    protected static _idGenerator: number = 1;

    // topo对象的唯一标识
    public tag: string;

    public readonly refId: number;

    // 标记位
    protected _flags?: number;

    // 几何库内部使用的辅助信息，会存储
    protected _data?: { [key: string]: any };

    /**
     * @property 父对象
     */
    private _parent?: TopoObject;

    constructor() {
        super();
        this.refId = TopoObject._idGenerator++;
        this.tag = BrepUtil.generateShortUUID();
    }

    /**
     * 计算包围盒
     */
    public abstract getBBox(): Box3;

    public setParent(parent: TopoObject | undefined) {
        this._parent = parent;
    }

    public getParent() {
        return this._parent;
    }

    public getFlags(): number | undefined {
        return this._flags;
    }

    public setFlags(flag?: number) {
        this._flags = flag;
    }

    public getData() {
        return this._data;
    }

    public setData(data?: { [key: string]: any }) {
        this._data = data;
    }

    public getDebugTag(): string {
        return (this.userData as ITopoDebugData)?.debugTag || this._simpleUUID();
    }

    public clone(): TopoObject {
        throw new Error('除了shell和body能clone外，其余topoObject均不可clone');
    }

    public dump(): IDBTopoObject {
        return {
            ...super.dump(),
            tag: this.tag,
            flag: this._flags,
            data: BrepUtil.dumpMapObj(this._data),
        };
    }

    public load(json: IDBTopoObject): this {
        const { tag, flag, data, _d } = json;
        this.dUserData = _d;
        this.tag = tag;
        this._flags = flag;
        this._data = BrepUtil.loadMapObj(data);
        return super.load(json);
    }

    // 简化UUID
    protected _simpleUUID(uuid?: string) {
        if (uuid) {
            return uuid.substr(0, 8);
        }
        return `${this.tag}`.substr(0, 8);
    }
}

export { TopoObject };