import { RenderGroup, RenderNode } from './render_node'

export class RenderNodeUtil {
    public static flatLeafRNodes(rNode: RenderNode): RenderNode[] {
        const result: RenderNode[] = []

        if (!rNode.visible) {
            return result
        }

        if (rNode instanceof RenderGroup) {
            rNode.children.forEach(child => {
                result.push(...this.flatLeafRNodes(child))
            })
            return result
        }

        result.push(rNode)
        return result
    }
}
