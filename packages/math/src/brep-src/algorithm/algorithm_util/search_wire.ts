import { Surface, Tol } from '../../..';
import { Coedge3d } from '../../brep/coedge3d';
import { Wire } from '../../brep/wire';



export function searchCoedge(surf: Surface, prevCoedge: Coedge3d, allCoedges: Coedge3d[]): Coedge3d | undefined {
    const prevEndVt = prevCoedge.getEndVertex();
    const vtCoedges = allCoedges.filter(_ce => _ce.getStartVertex() === prevEndVt);
    if (vtCoedges.length === 0) {
        return undefined;
    }
    if (vtCoedges.length === 1) {
        return vtCoedges[0];
    }

    // 因为0长的coedge计算角度会出各种问题，所以尽量避免0长coedge走下面的根据角度搜coedge
    const vtDegenerateCoedges = vtCoedges.filter(_ce => _ce.getEdge()?.isDegenerate());
    if (vtDegenerateCoedges.length > 1) {
        const pCurve1 = vtDegenerateCoedges[0].getPCurve();
        const pCurve2 = vtDegenerateCoedges[1].getPCurve();
        if (pCurve1 && pCurve2) {
            if (pCurve1.getEndPt().equals(pCurve2.getStartPt())) {
                return vtDegenerateCoedges[0];
            }
            if (pCurve2.getEndPt().equals(pCurve1.getStartPt())) {
                return vtDegenerateCoedges[1];
            }
            throw new Error('Boolean3d: searchWires: pCurve is wrong');
        }
    } else if (vtDegenerateCoedges.length === 1 && prevCoedge.getEdge()?.isDegenerate()) {
        return vtDegenerateCoedges[0];
    }

    const surfNorm = surf.getNormAtPoint(prevEndVt.getPoint());
    const prevEndTangent = prevCoedge.getEndTangent().reversed();
    let maxAngleCoedge = vtCoedges[0];
    const maxStTangent = maxAngleCoedge.getStartTangent();
    let maxAngle = prevEndTangent.angleTo(maxStTangent, surfNorm);
    for (let i = 1; i < vtCoedges.length; i++) {
        const tmpTangent = vtCoedges[i].getStartTangent();
        const tmpAngle = prevEndTangent.angleTo(tmpTangent, surfNorm);
        if (Math.abs(tmpAngle - maxAngle) < Tol.ANGLE) {
            // 两条coedge方向相同，相切的两条coedge
            const maxCurve = maxAngleCoedge.getCurve();
            const maxCvDvs = maxCurve.getDerivatives(maxCurve.getStartParam(), 2);
            const tmpCurve = vtCoedges[i].getCurve();
            const tmpCvDvs = tmpCurve.getDerivatives(tmpCurve.getStartParam(), 2);
            const cross = surfNorm.cross(prevEndTangent);

            // 比较弯曲的方向，如果弯曲不同向
            const maxCurture = maxCvDvs[2].multiplied(1 / maxCvDvs[1].dot(maxCvDvs[1]));
            const tmpCurture = tmpCvDvs[2].multiplied(1 / tmpCvDvs[1].dot(tmpCvDvs[1]));
            const maxDot = maxCurture.dot(cross);
            const tmpDot = tmpCurture.dot(cross);
            if (Math.abs(maxDot - tmpDot) < Tol.NUMBER) {
                // 小步长取点测试
                // const refPt = prevEndVt.getPoint().added(prevEndTangent.multiplied(1e-3));
                // const maxRefParam = maxCurve.getParamAt(refPt);
                // const
            }
            if (maxDot < tmpDot) {
                maxAngle = tmpAngle;
                maxAngleCoedge = vtCoedges[i];
            }
        } else if (tmpAngle > maxAngle + Tol.ANGLE) {
            maxAngle = tmpAngle;
            maxAngleCoedge = vtCoedges[i];
        }
    }

    return maxAngleCoedge;
}

export function isWireDegenerated(coedges: Coedge3d[] | readonly Coedge3d[]): boolean {
    if (coedges.length === 2 && coedges[0].getEdge() === coedges[1].getEdge()) {
        return true;
    }

    return false;
}

export function searchWire(surf: Surface, stCoedge: Coedge3d, allCoedges: Coedge3d[]): Wire | undefined {
    let tmpCoedge: Coedge3d = stCoedge;
    const wireCoedges: Coedge3d[] = [];
    wireCoedges.push(tmpCoedge);
    allCoedges.splice(0, 1);

    const stVt = tmpCoedge.getStartVertex();
    let lastClosedCeIndex = -1;
    while (wireCoedges.length < 1e4) {
        const nextCoedge = searchCoedge(surf, tmpCoedge, allCoedges);
        if (nextCoedge === undefined) {
            break;
        }

        const index = allCoedges.findIndex(_ce => _ce === nextCoedge);
        if (index > -1) {
            allCoedges.splice(index, 1);
        }
        wireCoedges.push(nextCoedge);
        tmpCoedge = nextCoedge;

        if (nextCoedge.getEndVertex() === stVt) {
            lastClosedCeIndex = wireCoedges.length - 1;
        }
    }

    // 如果搜索的结果是没有搜到封闭环
    if (wireCoedges[wireCoedges.length - 1].getEndVertex() !== stVt) {
        if (lastClosedCeIndex >= 0) {
            wireCoedges.splice(lastClosedCeIndex + 1, wireCoedges.length - lastClosedCeIndex - 1); // 回溯到已有的闭环
        } else {
            wireCoedges.splice(0, wireCoedges.length); // 如果没搜到环，清空wire里面的coedge
        }
    }

    if (wireCoedges.length > 0) {
        const newWire = new Wire(wireCoedges);
        return newWire;
    }

    return undefined;
}

// 以新coedges为先，搜环；如果新coedges用完了，还继续搜环不？？？目前不继续搜
export function searchWires(surf: Surface, newCoedges: Coedge3d[], oldCoedges: Coedge3d[], simpleLoop = false): Wire[] {
    const newWires: Wire[] = [];

    // 去掉退化的coedge，不参与搜索
    for (let i = 0; i < oldCoedges.length; i++) {
        if (
            oldCoedges[i].getStartVertex() === oldCoedges[i].getEndVertex() &&
            oldCoedges[i].getEdge()!.getCurve().getRange().getLength() < Tol.LENGTH &&
            !oldCoedges[i].getEdge()!.isDegenerate()
        ) {
            oldCoedges.splice(i, 1);
            i--;
        }
    }
    // 生成的时候就阻止生成
    for (let i = 0; i < newCoedges.length; i++) {
        if (
            newCoedges[i].getStartVertex() === newCoedges[i].getEndVertex() &&
            newCoedges[i].getEdge()!.getCurve().getRange().getLength() < Tol.LENGTH
        ) {
            newCoedges.splice(i, 1);
            i--;
        }
    }

    // 搜环的时候，尽量不要从往返的coedge开始搜，所以把存在往返的放在最后
    const twinCoedges: Coedge3d[] = [];
    for (let i = 0; i < newCoedges.length; i++) {
        const ce = newCoedges[i];

        let twinInSet = false;
        const twins = ce.getTwins();
        for (const twin of twins) {
            const index = newCoedges.findIndex(_ => _ === twin);
            if (index > -1) {
                newCoedges.splice(index, 1);
                twinCoedges.push(twin);
                twinInSet = true;
            }
        }
        if (twinInSet) {
            newCoedges.splice(i, 1);
            twinCoedges.push(ce);
            i--;
        }
    }
    newCoedges.push(...twinCoedges);

    let searchIndex: number = 0;
    while (newCoedges.length > 0) {
        if (searchIndex > newCoedges.length - 1) {
            break; // 搜不到环了
        }

        let tmpCoedge: Coedge3d = newCoedges[searchIndex];
        const wireCoedges: Coedge3d[] = [];
        wireCoedges.push(tmpCoedge);

        const stVt = tmpCoedge.getStartVertex();
        let lastClosedCeIndex = -1;
        const toSearchCoedges = [...oldCoedges];
        for (const ice of newCoedges) {
            if (ice !== tmpCoedge) toSearchCoedges.push(ice);
        }

        while (wireCoedges.length < 1e4) {
            const nextCoedge = searchCoedge(surf, tmpCoedge, toSearchCoedges);
            if (nextCoedge === undefined) {
                break;
            }

            const index = toSearchCoedges.findIndex(_ce => _ce === nextCoedge);
            if (index > -1) {
                toSearchCoedges.splice(index, 1);
            }
            wireCoedges.push(nextCoedge);
            tmpCoedge = nextCoedge;

            if (nextCoedge.getEndVertex() === stVt) {
                if (simpleLoop) {
                    break;
                }
                lastClosedCeIndex = wireCoedges.length - 1;
            }
        }

        // 如果搜索的结果是没有搜到封闭环
        if (wireCoedges[wireCoedges.length - 1].getEndVertex() !== stVt) {
            if (lastClosedCeIndex >= 0) {
                wireCoedges.splice(lastClosedCeIndex + 1, wireCoedges.length - lastClosedCeIndex - 1); // 回溯到已有的闭环
            } else {
                wireCoedges.splice(0, wireCoedges.length); // 如果没搜到环，清空wire里面的coedge
            }
        }

        // 单向coedge搜环，如果从某条coedge开始，可能搜不到闭环；但是从另一条coedge开始，也许能搜到闭环。所以要每条都试一下
        if (wireCoedges.length === 0) {
            searchIndex++;
            continue;
        } else {
            searchIndex = 0; // 搜成功，index重置为0
        }

        // 如果搜到了环，就将环中使用的coedge删掉
        for (const wireCe of wireCoedges) {
            const index1 = oldCoedges.findIndex(_ce => _ce === wireCe);
            if (index1 > -1) {
                oldCoedges.splice(index1, 1);
            } else {
                const index2 = newCoedges.findIndex(_ce => _ce === wireCe);
                newCoedges.splice(index2, 1);
            }
        }

        if (wireCoedges.length > 0) {
            const newWire = new Wire(wireCoedges);
            newWires.push(newWire);
        }
        // const newWire = new Wire(wireCoedges);
        // newWires.push(newWire);
    }

    return newWires;
}

// 从coedges里面搜一个简单的环
export function searchOneWireInReciprocateCoedges(
    surf: Surface,
    newCoedges: Coedge3d[],
    oldCoedges: Coedge3d[],
): Wire | undefined {
    // 去掉退化的coedge，不参与搜索
    for (let i = 0; i < oldCoedges.length; i++) {
        if (
            oldCoedges[i].getStartVertex() === oldCoedges[i].getEndVertex() &&
            !oldCoedges[i].getEdge()!.getCurve().isPeriodic()
        ) {
            oldCoedges.splice(i, 1);
            i--;
        }
    }
    // 生成的时候就阻止生成
    for (let i = 0; i < newCoedges.length; i++) {
        if (
            newCoedges[i].getStartVertex() === newCoedges[i].getEndVertex() &&
            !newCoedges[i].getEdge()!.getCurve().isPeriodic()
        ) {
            newCoedges.splice(i, 1);
            i--;
        }
    }

    let searchIndex: number = 0;
    while (newCoedges.length > 0) {
        if (searchIndex > newCoedges.length - 1) {
            break; // 搜不到环了
        }

        let tmpCoedge: Coedge3d = newCoedges[searchIndex];
        const wireCoedges: Coedge3d[] = [];
        wireCoedges.push(tmpCoedge);

        const stVt = tmpCoedge.getStartVertex();
        const toSearchCoedges = [...oldCoedges];
        for (const ice of newCoedges) {
            if (ice !== tmpCoedge) toSearchCoedges.push(ice);
        }

        while (wireCoedges.length < 1e4) {
            const nextCoedge = searchCoedge(surf, tmpCoedge, toSearchCoedges);
            if (nextCoedge === undefined) {
                break;
            }

            const index = toSearchCoedges.findIndex(_ce => _ce === nextCoedge);
            if (index > -1) {
                toSearchCoedges.splice(index, 1);
            }
            wireCoedges.push(nextCoedge);
            tmpCoedge = nextCoedge;

            if (nextCoedge.getEndVertex() === stVt) {
                break; // 只要闭合就不再搜环，不会出现一个vertex四条coedge的情况
            }
        }

        // 如果搜索的结果是没有搜到封闭环
        if (wireCoedges[wireCoedges.length - 1].getEndVertex() !== stVt) {
            wireCoedges.splice(0, wireCoedges.length); // 如果没搜到环，清空wire里面的coedge
        }

        // 单向coedge搜环，如果从某条coedge开始，可能搜不到闭环；但是从另一条coedge开始，也许能搜到闭环。所以要每条都试一下
        if (wireCoedges.length === 0) {
            searchIndex++;
            continue;
        } else {
            searchIndex = 0; // 搜成功，index重置为0
        }

        // 如果搜到了环，就将环中使用的coedge删掉
        for (const wireCe of wireCoedges) {
            const index1 = oldCoedges.findIndex(_ce => _ce === wireCe);
            if (index1 > -1) {
                oldCoedges.splice(index1, 1);
            } else {
                const index2 = newCoedges.findIndex(_ce => _ce === wireCe);
                newCoedges.splice(index2, 1);
            }
        }

        if (wireCoedges.length > 0) {
            const newWire = new Wire(wireCoedges);
            return newWire;
        }
        // const newWire = new Wire(wireCoedges);
        // newWires.push(newWire);
    }

    return undefined;
}