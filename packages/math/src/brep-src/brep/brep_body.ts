

import { registerGeo } from '../../loader/register_geo';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { Shell } from './shell';

/**
 * brep体, 包含一个或多个的shell
 */
@registerGeo
class BrepBody extends Shell {
    /**
     * 拓扑是否合法，一个edge关联2个coedge
     */
    public isTopoValid() {
        // 遍历topo关系
        for (const f of this.getFaces()) {
            if (f.getWires().length === 0) {
                return false;
            }
            for (const w of f.getWires()) {
                if (w.getCoedge3ds().length === 0) {
                    return false;
                }
                for (const ce3d of w.getCoedge3ds()) {
                    if (ce3d.getShell() !== this) {
                        return false;
                    }
                    if (ce3d.getWire() !== w) {
                        return false;
                    }
                    if (ce3d.getFace() !== f) {
                        return false;
                    }
                    if (!ce3d.getEdge()) {
                        return false;
                    }
                    if (ce3d.getTwins().length < 1) {
                        return false;
                    }

                    for (const twin of ce3d.getTwins()) {
                        if (twin.getTwins().findIndex(_ => _.tag === ce3d.tag) === -1) {
                            return false;
                        }
                    }
                }
            }
        }

        for (const e of this.getEdges()) {
            if (e.getParent() !== this) {
                return false;
            }
            if (e.getCoedge3ds().length < 2) {
                return false;
            }
            for (const ce of e.getCoedge3ds()) {
                if (ce.getShell() !== this) {
                    return false;
                }
            }
            if (!e.getStartVertex()) {
                return false;
            }
            if (!e.getEndVertex()) {
                return false;
            }
        }

        for (const v of this.getVertexs()) {
            if (v.getParent() !== this) {
                return false;
            }
            if (v.getEdges().length < 2 && !v.getEdges()[0].getCurve().isPeriodic()) {
                return false;
            }
        }
        return true;
    }

    public clone(): BrepBody {
        return super.clone() as BrepBody;
    }

    public getType(): EN_GEO_TYPE.BREP_BODY {
        return EN_GEO_TYPE.BREP_BODY;
    }

    // // 计算brepbody的体积
    // public calcVolume(): number {
    // }

    /**
     * 分离出lump，Array<Shell>的第一个shell是外壳（面的方向朝外），其余的是空腔（面的方向朝内）
     * @returns
     */
    public toLump(): Shell[][] {
        return [[this]];
    }
}

export { BrepBody };