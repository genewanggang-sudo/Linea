
import { BrepUtil } from '../util/util';
import type { Face } from './face';
import { Coedge3d } from './coedge3d';
import { TopoObject } from './topo_object';
import { IDBWire, IDBTopoObject } from '../type_define/i_types';
import { Box3 } from '../../base/box3';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';
import { Loader } from '../../loader/loader';
import { registerGeo } from '../../loader/register_geo';
import { Loop } from '../../topology/loop';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { MathAssert } from '../../util/assert';
import { SurfaceUtil } from '../../util/surface_util';



/**
 * 三维线框
 * wire 中的方向与 surface 保持一致
 */
@registerGeo
class Wire extends TopoObject {
    private _coedge3dList: Coedge3d[] = [];

    constructor(coedge3dList?: Coedge3d[]) {
        super();

        if (coedge3dList) {
            coedge3dList.forEach(ce => this.addCoedge3d(ce));
        }
    }

    public getFace(): Face | undefined {
        return this.getParent() as Face;
    }

    public deleteCoedge3dAt(index: number, count: number = 1) {
        const n = Math.min(this._coedge3dList.length - index, count);
        if (n < 0) return;
        for (let i = index; i < index + n; i++) {
            this._coedge3dList[i].setParent(undefined);
        }
        this._coedge3dList.splice(index, n);
    }

    public deleteCoedge3d(coedge3d: Coedge3d) {
        const idx = this._coedge3dList.findIndex(ce => ce === coedge3d);
        if (idx > -1) {
            this._coedge3dList[idx].setParent(undefined);
            this._coedge3dList.splice(idx, 1);
        }
    }

    public deleteCoedge3dByTag(tag: string) {
        const idx = this._coedge3dList.findIndex(ce => ce.tag === tag);
        if (idx > -1) {
            this._coedge3dList[idx].setParent(undefined);
            this._coedge3dList.splice(idx, 1);
        }
    }

    /**
     *  向wire中添加Coedge3d，若Coedge3d没有合法的索引，则会分配一个
     * @param coedge
     */
    public addCoedge3d(coedge3d: Coedge3d) {
        if (!coedge3d.tag) {
            coedge3d.tag = BrepUtil.generateShortUUID();
        }

        const origWire = coedge3d.getWire();
        if (origWire) {
            origWire.deleteCoedge3d(coedge3d);
        }
        coedge3d.setParent(this);
        this._coedge3dList.push(coedge3d);
    }

    /**
     *  在wire的指定位置添加Coedge3d，若Coedge3d没有合法的索引，则会分配一个
     * @param coedge
     */
    public insertCoedge3d(index: number, ...coedge3ds: Coedge3d[]) {
        coedge3ds.forEach(coedge3d => {
            if (!coedge3d.tag) {
                coedge3d.tag = BrepUtil.generateShortUUID();
            }

            const origWire = coedge3d.getWire();
            if (origWire) {
                origWire.deleteCoedge3d(coedge3d);
            }
            coedge3d.setParent(this);
        });

        this._coedge3dList.splice(index, 0, ...coedge3ds);
    }

    /**
     * 在wire指定位置，替换Coedge3d. 使用多个替换一个
     * @param index
     * @param coedge3ds
     */
    public replaceCoedge3d(index: number, coedge3ds: Coedge3d[]): void {
        if (index < 0 || index >= this._coedge3dList.length) {
            return;
        }
        this._coedge3dList[index].setParent(undefined);

        for (const coedge of coedge3ds) {
            if (!coedge.tag) {
                coedge.tag = BrepUtil.generateShortUUID();
            }
            coedge.setParent(this);
        }
        this._coedge3dList.splice(index, 1, ...coedge3ds);
    }

    public getCoedge3ds(): ReadonlyArray<Coedge3d> {
        return this._coedge3dList;
    }

    /**
     * 根据tag获取Coedge3d
     * @param tag
     */
    public getCoedge3dByTag(tag: string): Coedge3d | undefined {
        if (!this.getCoedge3ds()) {
            return undefined;
        }
        const index = this.getCoedge3ds().findIndex(co3d => {
            return co3d.tag === tag;
        });

        if (index > -1) {
            return this.getCoedge3ds()[index];
        }
        return undefined;
    }

    /**
     * 根据Index获取Coedge3d
     * @param tag
     */
    public getCoedge3dByIndex(index: number): Coedge3d | undefined {
        if (index < 0 || index > this.getCoedge3ds().length - 1) {
            MathAssert.assert(false, 'Wire getCoedge3dByIndex(): Out of Range!');
            return undefined;
        }

        return this.getCoedge3ds()[index];
    }

    public dispose() {
        for (const coedge of this._coedge3dList) {
            // maybe coedge is added to another wire
            if (coedge.getWire() === this) {
                coedge.dispose();
            }
        }
        this._coedge3dList = [];
    }

    public isEdgeInfoValid() {
        for (const coedge3d of this._coedge3dList) {
            if (!coedge3d.isEdgeInfoValid()) {
                return false;
            }
        }

        return true;
    }

    // 检查wire是否闭合
    public isValid() {
        for (let i = 0; i < this._coedge3dList.length; i++) {
            const cei = this._coedge3dList[i];
            const cei1 = this._coedge3dList[(i + 1) % this._coedge3dList.length];
            if (cei.getEndVertex() !== cei1.getStartVertex()) {
                return false;
            }
        }

        return true;
    }

    // 将环反向
    public reverse() {
        this._coedge3dList.reverse();
        this._coedge3dList.forEach(co3d => co3d.reverse());
    }

    /**
     * 提取环所对应的有界曲线
     */
    public toPath(): Curve3[] {
        return this.getCoedge3ds().map(ce3d => {
            return ce3d.getCurve();
        });
    }

    public getBBox(): Box3 {
        const resultBox = new Box3();
        this._coedge3dList.forEach(coedge3d => {
            resultBox.union(coedge3d.getBBox());
        });
        return resultBox;
    }

    // 判断是否是face的外环：如果没有face，返回undefined
    public isFaceOutWire(): boolean | undefined {
        if (!this.getParent()) {
            return undefined;
        }

        const face = this.getParent() as Face;
        const outWire = face.getWires()[0];
        if (this !== outWire) {
            return false;
        }

        return true;
    }

    // 计算在参数域上的二维轮廓.因为coedge包含了PCurve，所以不能直接调用wireToUV函数
    // 圆柱面，需要将参数域拓展，以支持跨周期的情况
    public calcLoop() {
        const face = this.getParent() as Face;
        MathAssert.assert(face);
        const surf = face.getSurface();

        const loop2d: Curve2[] = [];
        const cv2dMap: Map<Curve2, Curve2[]> = new Map();
        for (const ce of this.getCoedge3ds()) {
            const pCurve = ce.getPCurve();
            if (pCurve) {
                loop2d.push(pCurve);
                continue;
            }

            const crv2d = surf.getCurve2d(ce.getCurve());
            loop2d.push(crv2d);
        }

        if (cv2dMap.size > 0) {
            for (let i = 0; i < loop2d.length; i++) {
                const prevCurve = loop2d[(i - 1 + loop2d.length) % loop2d.length];
                const prevEndPt = prevCurve.getEndPt();
                if (prevEndPt.equals(loop2d[i].getStartPt())) {
                    continue;
                }

                const cv2ds = cv2dMap.get(loop2d[i]);
                if (cv2ds) {
                    for (const cv of cv2ds) {
                        if (prevEndPt.sqDistanceTo(cv.getStartPt()) < prevEndPt.sqDistanceTo(loop2d[i].getStartPt())) {
                            loop2d.splice(i, 1, cv);
                        }
                    }
                }
            }
        }

        const loop3ds = this.getCoedge3ds().map(ce => ce.getCurve());
        SurfaceUtil.unifyCurve2dUVBetweenCurves(loop3ds, surf, loop2d);
        return new Loop(loop2d);
    }

    public getType(): EN_GEO_TYPE.BREP_WIRE {
        return EN_GEO_TYPE.BREP_WIRE;
    }

    /**
     *  抽取元数据，用于序列化
     * @returns 返回js对象
     */
    public dump(): IDBWire {
        const result = super.dump() as IDBWire;
        result.ces = this._coedge3dList.map(coedge3d => {
            const ceData = coedge3d.dump();
            (ceData as any).type = undefined;
            return ceData;
        });
        (result as any).tag = undefined;
        return result;
    }

    public load({ tag, flag, data, ces, _d }: IDBWire): this {
        super.load({ tag, flag, data, _d } as IDBTopoObject);
        this._coedge3dList = [];
        ces.forEach(json => {
            json.type = EN_GEO_TYPE.BREP_COEDGE;
            this.addCoedge3d(Loader.load(json) as Coedge3d);
        });

        return this;
    }
}

export { Wire };