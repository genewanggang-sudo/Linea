import { GRep, RenderEdge, RenderGroup, RenderNode, RenderPoint } from '@ccpc/core'
import { Vec3 } from '@ccpc/math'
import { BufferGeometry, Float32BufferAttribute, Group, Object3D, Points, PointsMaterial } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

/**
 * 渲染数据转换、缓存、管理
 */
export class RenderHub {
    private _eIdToGroup: Map<number, Group> = new Map()

    public addGrep(grep: GRep) {
        const rNode = grep.toRenderNode()
        const allNodes = this._flatLeafRNodes(rNode)

        const group = new Group()
        for (const node of allNodes) {
            const obj = this._buildLeafObject3d(node)
            if (obj) {
                group.add(obj)
            }
        }

        this._eIdToGroup.set(grep.elementId.asInt(), group)
        return group
    }

    public removeGRep(eId: number) {
        this._eIdToGroup.delete(eId)
    }

    public getObj3D(eId: number) {
        return this._eIdToGroup.get(eId)
    }

    /**
     * 叶子节点拍平
     */
    private _flatLeafRNodes(rNode: RenderNode) {
        const result: Array<RenderNode> = []
        if (rNode instanceof RenderGroup) {
            rNode.children.forEach(child => {
                result.push(...this._flatLeafRNodes(child))
            })
            return result
        }

        result.push(rNode)
        return result
    }

    /**
     * 根据叶子 RenderNode 构建对应的 three Object3D
     */
    private _buildLeafObject3d(rNode: RenderNode): Object3D | null {
        if (rNode instanceof RenderPoint) {
            const point = new Vec3(rNode.point)
            if (rNode.globalMatrix) {
                point.applyMat4(rNode.globalMatrix)
            }

            const geo = new BufferGeometry()
            geo.setAttribute('position', new Float32BufferAttribute([point.x, point.y, point.z], 3))

            return new Points(
                geo,
                new PointsMaterial({
                    color: 0xffffff,
                    size: 6,
                    sizeAttenuation: false,
                }),
            )
        }

        if (rNode instanceof RenderEdge) {
            const positions: number[] = []
            for (const rawPoint of rNode.points) {
                const point = rawPoint.clone()
                if (rNode.globalMatrix) {
                    point.applyMat4(rNode.globalMatrix)
                }
                positions.push(point.x, point.y, point.z)
            }

            const geo = new LineGeometry()
            geo.setPositions(positions)

            const material = new LineMaterial({
                color: 0xffffff,
                linewidth: 2,
            })

            return new Line2(geo, material)
        }

        return null
    }
}
