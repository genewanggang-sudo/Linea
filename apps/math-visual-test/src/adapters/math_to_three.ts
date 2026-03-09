import { DiscretizeOptions, type Box2, type Curve2, type Vec2 } from '@ccpc/math'
import * as THREE from 'three'

function toVec3(v: Vec2): THREE.Vector3 {
    return new THREE.Vector3(v.x, v.y, 0)
}

function lineFromPoints(points: Vec2[], color: number): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(toVec3))
    const material = new THREE.LineBasicMaterial({ color })
    return new THREE.Line(geometry, material)
}

function appendClosed(points: Vec2[], closed: boolean): Vec2[] {
    if (!closed || points.length <= 1) return points
    const first = points[0]
    const last = points[points.length - 1]
    if (!first || !last) return points
    if (first.distanceTo(last) <= 1e-9) return points
    return [...points, first.clone()]
}

export function discretizePolylinePoints(curve: Curve2, options: DiscretizeOptions): Vec2[] {
    return appendClosed(curve.discretize(options), curve.isClosed())
}

export function buildCurveLine(curve: Curve2, options?: DiscretizeOptions): THREE.Line {
    const opt = options ? options.clone() : DiscretizeOptions.high.clone()
    const points = discretizePolylinePoints(curve, opt)
    return lineFromPoints(points, 0x2563eb)
}

export function buildDiscreteLine(curve: Curve2, options: DiscretizeOptions): THREE.Line {
    const points = discretizePolylinePoints(curve, options)
    return lineFromPoints(points, 0xea580c)
}

export function buildDiscreteLineFromPoints(points: Vec2[]): THREE.Line {
    return lineFromPoints(points, 0xea580c)
}

export function buildDiscretePoints(curve: Curve2, options: DiscretizeOptions): THREE.Points {
    const points = discretizePolylinePoints(curve, options)
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(toVec3))
    const material = new THREE.PointsMaterial({
        color: 0x0f766e,
        size: 5,
        sizeAttenuation: false,
    })
    return new THREE.Points(geometry, material)
}

export function buildDiscretePointsFromPoints(points: Vec2[]): THREE.Points {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(toVec3))
    const material = new THREE.PointsMaterial({
        color: 0x0f766e,
        size: 5,
        sizeAttenuation: false,
    })
    return new THREE.Points(geometry, material)
}

function boxSegments(box: Box2): THREE.Vector3[] {
    if (box.isEmpty()) return []
    const p0 = new THREE.Vector3(box.minX, box.minY, 0)
    const p1 = new THREE.Vector3(box.maxX, box.minY, 0)
    const p2 = new THREE.Vector3(box.maxX, box.maxY, 0)
    const p3 = new THREE.Vector3(box.minX, box.maxY, 0)
    return [p0, p1, p1, p2, p2, p3, p3, p0]
}

export function buildBoundingBox(curve: Curve2): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry().setFromPoints(boxSegments(curve.getBBox(true)))
    const material = new THREE.LineBasicMaterial({ color: 0x64748b })
    return new THREE.LineSegments(geometry, material)
}

export function buildDirectionArrows(curve: Curve2, count = 4): THREE.Group {
    const group = new THREE.Group()
    const range = curve.getRange()
    const box = curve.getBBox(true)
    const scale = Math.max(box.width(), box.height(), 1) * 0.12
    const sampleCount = Math.max(1, Math.floor(count))

    for (let i = 0; i < sampleCount; i++) {
        const t = curve.isClosed() ? i / sampleCount : (i + 1) / (sampleCount + 1)
        const u = range.start + range.length() * t
        const p = curve.getPtAt(u)
        const d = curve.getTangentAt(u)
        const len = d.len()
        if (len <= 1e-12 || !Number.isFinite(len)) continue
        const dir = new THREE.Vector3(d.x / len, d.y / len, 0)
        const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(p.x, p.y, 0), scale, 0x7c3aed, scale * 0.35, scale * 0.2)
        group.add(arrow)
    }

    return group
}
