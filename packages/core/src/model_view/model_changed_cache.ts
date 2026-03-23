import { IElement } from '../element/i_element'
import { IHighLight } from '../types/i_high_light'
import { ISelection } from '../types/i_selection'
import { EN_ModelViewChanged } from '../types/type_define'
/**
 * 缓存视图层发生的变化
 */
export class ModelChangedCache {
    public container = new Map<EN_ModelViewChanged, Set<number>>()

    public highLight?: IHighLight

    public selection?: ISelection

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

        return this.selection || this.highLight
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
     * 缓存高亮
     */
    public cacheHighLight(highLight: IHighLight) {
        this.highLight = highLight
    }

    /**
     * 缓存选择集
     */
    public cacheSelection(selection: ISelection) {
        this.selection = selection
    }

    /**
     * 清空缓存
     */
    public clear() {
        for (const set of this.container.values()) {
            set.clear();
        }
        delete this.highLight
        delete this.selection
    }
}
