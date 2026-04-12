import { EN_AnchorX, EN_AnchorY, GNode, GRep, RenderEdge, RenderMesh, RenderNode, RenderNodeUtil, RenderPoint, RenderText } from '@ccpc/core'
import { Vec3 } from '@ccpc/math'
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Object3D, Points, PointsMaterial } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { Text } from 'troika-three-text'
import { ThreeUtil } from '../toolkit/three_util'

/**
 * 渲染数据转换、缓存、管理
 */
export class RenderHub {

    /**
     * 渲染对象和GNode的映射
     */
    private _objectGNodeMap = new WeakMap<Object3D, GNode>

    /**
     * 添加GRep
     */
    public addGrep(grep: GRep) {
        const rNode = grep.toRenderNode()
        const allNodes = RenderNodeUtil.flatLeafRNodes(rNode)

        const group = new Group()
        for (const node of allNodes) {
            const obj = this._buildLeafObject3d(node)
            if (obj) {
                group.add(obj)
                this._objectGNodeMap.set(obj, node.gnode)
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
     * 根据渲染对象查GNode
     */
    public getGNodesByObject3d(obj: Object3D) {
        let cur: Object3D | null = obj
        while (cur) {
            const gnode = this._objectGNodeMap.get(cur)
            if (gnode) return gnode
            cur = cur.parent
        }
        return undefined
    }

    /**
     * 叶子节点拍平
     */
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
            const pointStyle = rNode.style.point
            const pointMat = new PointsMaterial({
                color: pointStyle?.color ?? 0xffffff,
                size: pointStyle?.size ?? 8,
                sizeAttenuation: false,
                opacity: pointStyle?.opacity ?? 1,
            })
            if (pointMat.opacity < 1) {
                pointMat.transparent = true
            }

            return new Points(geo, pointMat)
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

            const lineStyle = rNode.style.line
            const lineMat = new LineMaterial({
                color: lineStyle?.color ?? 0xffffff,
                linewidth: lineStyle?.width ?? 2,
                opacity: lineStyle?.opacity ?? 1,
            })

            if (lineMat.opacity < 1) {
                lineMat.transparent = true
            }

            return new Line2(geo, lineMat)
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

            const faceStyle = rNode.style.face
            const faceMat = new MeshBasicMaterial({
                color: faceStyle?.color ?? 0xffffff,
                opacity: faceStyle?.opacity ?? 1,
            })

            if (faceMat.opacity < 1) {
                faceMat.transparent = true
            }
            return new Mesh(geo, faceMat)
        }

        if (rNode instanceof RenderText) {
            const text = new Text()
            text.position.set(rNode.position.x, rNode.position.y, rNode.position.z)
            text.text = rNode.text

            const textStyle = rNode.style.text
            text.fontSize = textStyle?.fontSize ?? 16
            text.color = textStyle?.color ?? 0xffffff
            text.anchorX = textStyle?.anchorX ?? EN_AnchorX.Center
            text.anchorY = textStyle?.anchorY ?? EN_AnchorY.Middle

            if (rNode.globalMatrix) {
                text.applyMatrix4(ThreeUtil.mathMatrix4toThreeMatrix4(rNode.globalMatrix))
            }

            text.sync()

            return text
        }

        return null
    }
}
