import {
    EN_AnchorX,
    EN_AnchorY,
    GRep,
    RenderEdge,
    RenderMesh,
    RenderNode,
    RenderNodeUtil,
    RenderPoint,
    RenderText,
} from '@ccpc/core'
import { Vec3 } from '@ccpc/math'
import {
    BufferAttribute,
    BufferGeometry,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    Points,
    PointsMaterial,
    Scene,
} from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { Text } from 'troika-three-text'
import { ThreeUtil } from '../toolkit/three_util'

/**
 * 高亮选中交互操作
 */
export class ActiveSelectionOp {
    private _activeGroup = new Group()

    private _selectionGroup = new Group()

    constructor(activeScene: Scene) {
        activeScene.add(this._activeGroup)
        activeScene.add(this._selectionGroup)
    }

    public clearActive() {
        this._clearGroup(this._activeGroup)
    }

    public clearSelection() {
        this._clearGroup(this._selectionGroup)
    }

    public drawActives(greps: GRep[]) {
        this.clearActive()
        greps.forEach(grep => {
            const group = this._buildOverlayGroup(grep)
            if (group.children.length) {
                this._activeGroup.add(group)
            }
        })
    }

    public drawSelections(greps: GRep[]) {
        this.clearSelection()
        greps.forEach(grep => {
            const group = this._buildOverlayGroup(grep)
            if (group.children.length) {
                this._selectionGroup.add(group)
            }
        })
    }

    /**
     * GRep转为可渲染Group
     */
    private _buildOverlayGroup(grep: GRep) {
        const group = new Group()
        const rNode = grep.toRenderNode()

        const allNodes = RenderNodeUtil.flatLeafRNodes(rNode)
        allNodes.forEach(node => {
            const obj = this._buildLeafObject(node)
            if (obj) {
                group.add(obj)
            }
        })

        return group
    }

    /**
     * 根据RenderNode构建渲染对象
     */
    private _buildLeafObject(rNode: RenderNode): Object3D | null {
        if (rNode instanceof RenderPoint) {
            const point = new Vec3(rNode.point)
            if (rNode.globalMatrix) {
                point.transform(rNode.globalMatrix)
            }

            const geo = new BufferGeometry()
            geo.setAttribute('position', new Float32BufferAttribute([point.x, point.y, point.z], 3))

            const pointStyle = rNode.style.point
            const mat = new PointsMaterial({
                color: pointStyle?.color ?? 0xffffff,
                size: pointStyle?.size ?? 8,
                sizeAttenuation: false,
                opacity: pointStyle?.opacity ?? 1,
            })
            if (mat.opacity < 1) {
                mat.transparent = true
            }

            return new Points(geo, mat)
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
            const mat = new LineMaterial({
                color: lineStyle?.color ?? 0xffffff,
                linewidth: lineStyle?.width ?? 2,
                opacity: lineStyle?.opacity ?? 1,
            })
            if (mat.opacity < 1) {
                mat.transparent = true
            }

            return new Line2(geo, mat)
        }

        if (rNode instanceof RenderMesh) {
            const geo = new BufferGeometry()
            geo.setAttribute('position', new Float32BufferAttribute(rNode.getVerts(), 3))
            geo.setAttribute('normal', new Float32BufferAttribute(rNode.getNormals(), 3))
            geo.setIndex(new BufferAttribute(rNode.getIndices(), 1))

            if (rNode.globalMatrix) {
                geo.applyMatrix4(ThreeUtil.mathMatrix4toThreeMatrix4(rNode.globalMatrix))
            }

            const faceStyle = rNode.style.face
            const mat = new MeshBasicMaterial({
                color: faceStyle?.color ?? 0xffffff,
                opacity: faceStyle?.opacity ?? 1,
            })
            if (mat.opacity < 1) {
                mat.transparent = true
            }

            return new Mesh(geo, mat)
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

    /**
     * 清空渲染组
     */
    private _clearGroup(group: Group) {
        while (group.children.length) {
            const child = group.children.pop()
            child?.removeFromParent()
        }
    }
}
