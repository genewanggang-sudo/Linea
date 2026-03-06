import { IElement } from '../element/i_element'
import { EN_ModelViewChanged } from '../types/type_define'
/**
 * 缓存视图层发生的变化
 */
export class ModelChangedCache {
    public container = new Map<EN_ModelViewChanged, Set<number>>()

    constructor() {
        const arr = [
            EN_ModelViewChanged.ELEMENT_CREATE,
            EN_ModelViewChanged.ELEMENT_DELETE,
            EN_ModelViewChanged.ELEMENT_UPDATE]
        arr.forEach(i => this.container.set(i, new Set()))
    }

    /**
     * 是否发生改变
     */
    public isChange() {
        for (const set of this.container.values()) {
            if (set.size) return true
        }
        // TODO 暂不考虑selection
        return false;
    }

    /**
     * 缓存变化的Element
     * 先删+更新/创建 = 更新
     * 更新/创建+删除 = 删除
     */
    public cacheElementChanged(type: EN_ModelViewChanged, elements: IElement[]) {
        const fElements = elements.filter(_ => !_.dontShowView());
        const modifiedContainer = this.container.get(EN_ModelViewChanged.ELEMENT_UPDATE);
        const deleteContainer = this.container.get(EN_ModelViewChanged.ELEMENT_DELETE);
        if (EN_ModelViewChanged.ELEMENT_CREATE === type || EN_ModelViewChanged.ELEMENT_UPDATE === type) {
            fElements.forEach(e => {
                if (deleteContainer?.has(e.id.asInt())) {
                    deleteContainer.delete(e.id.asInt());
                }
                modifiedContainer?.add(e.id.asInt());
            });
        } else if (EN_ModelViewChanged.ELEMENT_DELETE === type) {
            fElements.forEach(e => {
                if (modifiedContainer?.has(e.id.asInt())) {
                    modifiedContainer.delete(e.id.asInt());
                }
                deleteContainer?.add(e.id.asInt());
            });
        }
    }

    /**
     * 清空缓存
     */
    public clear() {
        for (const set of this.container.values()) {
            set.clear();
        }
        // TODO selection
    }
}
