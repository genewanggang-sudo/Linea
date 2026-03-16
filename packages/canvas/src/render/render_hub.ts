import { GRep, RenderEdge, RenderGroup, RenderNode, RenderPoint } from '@ccpc/core'
import { Vec3 } from '@ccpc/math'
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Object3D, Points, PointsMaterial } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { RenderMesh, RenderText } from '../../../core/src/render/render_node'
import { Text } from 'troika-three-text'
import { ThreeUtil } from '../toolkit/three_util'

/**
 * 渲染数据转换、缓存、管理
 */
export class RenderHub {

    /**
     * 添加GRep
     */
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

        return group
    }

    /**
     * 移除GRep
     */
    public removeGRep(_eId: number) {

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
    // TODO 拆成两步, 单独创建几何和材质
    private _buildLeafObject3d(rNode: RenderNode): Object3D | null {
        if (rNode instanceof RenderPoint) {
            const point = new Vec3(rNode.point)
            if (rNode.globalMatrix) {
                point.transform(rNode.globalMatrix)
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
                    point.transform(rNode.globalMatrix)
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

        if (rNode instanceof RenderMesh) {
            const geo = new BufferGeometry()
            const position = rNode.getVerts()
            const indices = rNode.getIndices()
            const normals = rNode.getNormals()
            geo.setAttribute('position', new Float32BufferAttribute(position, 3))
            geo.setAttribute('normal', new Float32BufferAttribute(normals, 3))
            geo.setIndex(new BufferAttribute(indices, 1))

            const globalMatrix = rNode.globalMatrix
            if (globalMatrix) {
                geo.applyMatrix4(ThreeUtil.mathMatrix4toThreeMatrix4(globalMatrix))
            }
            const material = new MeshBasicMaterial({ color: Math.random() * 0xffffff })
            return new Mesh(geo, material)
        }

        if (rNode instanceof RenderText) {
            const text = new Text()
            const position = new Vec3(rNode.position)
            text.text = rNode.text
            text.fontSize = 16
            text.color = 0xffffff
            text.anchorX = 'center'
            text.anchorY = 'middle'
            text.position.set(position.x, position.y, position.z)

            if (rNode.globalMatrix) {
                text.applyMatrix4(ThreeUtil.mathMatrix4toThreeMatrix4(rNode.globalMatrix))
            }

            text.sync()
            return text
        }

        return null
    }
}
