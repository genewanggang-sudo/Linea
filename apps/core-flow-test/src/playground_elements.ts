import {
    DBGenerator,
    EN_AnchorX,
    EN_AnchorY,
    Element,
    GCurve2d,
    GPoint2d,
    GPolygon,
    GRep,
    GText2d,
    MathSymbol,
    RegisterElement,
} from '@ccpc/core'
import { Arc2, Coord2, Curve2, Ln2, Loader, Loop, Plane, Polygon, Vec2, types } from '@ccpc/math'


class DrawingCurveItem {
    public curve: Curve2 = DBGenerator.newGeoObject<Curve2>()
    public color = '#d7e3f4'
    public width = 1.2
    public opacity = 1

    constructor(init?: Partial<DrawingCurveItem>) {
        if (init) {
            Object.assign(this, init)
        }
    }

    public dump() {
        return {
            curve: this.curve === MathSymbol ? undefined : this.curve.dump(),
            color: this.color,
            width: this.width,
            opacity: this.opacity,
        }
    }

    public load(json: Partial<{ curve?: types.IDBLibGeo, color?: string, width?: number, opacity?: number }>) {
        if (json.curve) {
            this.curve = Loader.load(json.curve) as Curve2
        }
        if (json.color !== undefined) this.color = json.color
        if (json.width !== undefined) this.width = json.width
        if (json.opacity !== undefined) this.opacity = json.opacity
        return this
    }
}

class DrawingFillItem {
    public polygon: Polygon = DBGenerator.newGeoObject<Polygon>()
    public color = '#94a3b8'
    public opacity = 0.1

    constructor(init?: Partial<DrawingFillItem>) {
        if (init) {
            Object.assign(this, init)
        }
    }

    public dump() {
        return {
            polygon: this.polygon === MathSymbol ? undefined : this.polygon.dump(),
            color: this.color,
            opacity: this.opacity,
        }
    }

    public load(json: Partial<{ polygon?: types.IDBLibGeo, color?: string, opacity?: number }>) {
        if (json.polygon) {
            this.polygon = Loader.load(json.polygon) as Polygon
        }
        if (json.color !== undefined) this.color = json.color
        if (json.opacity !== undefined) this.opacity = json.opacity
        return this
    }
}

class DrawingTextItem {
    public text = ''
    public x = 0
    public y = 0
    public fontSize = 3.2
    public color = '#d7e3f4'
    public anchorX = EN_AnchorX.CENTER
    public anchorY = EN_AnchorY.CENTER

    constructor(init?: Partial<DrawingTextItem>) {
        if (init) {
            Object.assign(this, init)
        }
    }

    public dump() {
        return {
            text: this.text,
            x: this.x,
            y: this.y,
            fontSize: this.fontSize,
            color: this.color,
            anchorX: this.anchorX,
            anchorY: this.anchorY,
        }
    }

    public load(json: Partial<DrawingTextItem>) {
        Object.assign(this, json)
        return this
    }
}

abstract class PlaygroundElementBase extends Element {
    protected _addLine(grep: GRep, start: Vec2, end: Vec2) {
        grep.addNode(new GCurve2d(Plane.XOY(), new Ln2(start, end)))
    }

    protected _addRect(grep: GRep, center: Vec2, width: number, height: number) {
        const halfW = width * 0.5
        const halfH = height * 0.5
        const lb = new Vec2(center.x - halfW, center.y - halfH)
        const rb = new Vec2(center.x + halfW, center.y - halfH)
        const rt = new Vec2(center.x + halfW, center.y + halfH)
        const lt = new Vec2(center.x - halfW, center.y + halfH)
        this._addLine(grep, lb, rb)
        this._addLine(grep, rb, rt)
        this._addLine(grep, rt, lt)
        this._addLine(grep, lt, lb)
    }

    protected _addCircle(grep: GRep, center: Vec2, radius: number) {
        grep.addNode(new GCurve2d(
            Plane.XOY(),
            new Arc2(new Coord2(center, Vec2.X()), radius, radius, true, [0, Math.PI * 2]),
        ))
    }

    protected _addText(grep: GRep, text: string, position: Vec2) {
        grep.addNode(new GText2d(text, Plane.XOY(), position))
    }

    protected _addStyledText(grep: GRep, text: string, position: Vec2, fontSize = 16, color = '#d7e3f4') {
        const node = new GText2d(text, Plane.XOY(), position)
        node.setStyle({
            text: {
                color,
                fontSize,
            },
        })
        grep.addNode(node)
    }

    protected _addFilledRect(grep: GRep, lb: Vec2, rt: Vec2, color: string, opacity = 0.18) {
        const face = new GPolygon(Plane.XOY(), Polygon.createByRectangle(lb, rt))
        face.setStyle({
            face: {
                color,
                opacity,
            },
        })
        grep.addNode(face)
    }

    protected _addStyledLine(grep: GRep, start: Vec2, end: Vec2, color: string, width = 2, opacity = 1) {
        const node = new GCurve2d(Plane.XOY(), new Ln2(start, end))
        node.setStyle({
            line: {
                color,
                width,
                opacity,
            },
        })
        grep.addNode(node)
    }

    protected _addCenterMark(grep: GRep, center: Vec2, radius: number) {
        this._addCircle(grep, center, radius)
        this._addStyledLine(grep, new Vec2(center.x - radius - 18, center.y), new Vec2(center.x + radius + 18, center.y), '#cbd5e1', 1.2, 0.85)
        this._addStyledLine(grep, new Vec2(center.x, center.y - radius - 18), new Vec2(center.x, center.y + radius + 18), '#cbd5e1', 1.2, 0.85)
    }

    protected _addHatchRect(grep: GRep, lb: Vec2, rt: Vec2, spacing = 14, color = '#cbd5e1') {
        const width = rt.x - lb.x
        const height = rt.y - lb.y
        for (let offset = -height; offset <= width; offset += spacing) {
            const startX = Math.max(lb.x, lb.x + offset)
            const startY = Math.max(lb.y, lb.y - offset)
            const endX = Math.min(rt.x, lb.x + offset + height)
            const endY = Math.min(rt.y, lb.y - offset + width)
            if (endX - startX < 1 || endY - startY < 1) {
                continue
            }
            this._addStyledLine(grep, new Vec2(startX, startY), new Vec2(endX, endY), color, 1, 0.75)
        }
    }

    protected _assertStyle(title: string, condition: boolean, payload?: unknown) {
        console.assert(condition, `[style-demo] ${title}`, payload)
        if (!condition) {
            console.error(`[style-demo] ${title}`, payload)
        }
    }

    protected _addCurveItem(grep: GRep, item: DrawingCurveItem) {
        if (!(item.curve instanceof Curve2)) {
            return
        }
        const node = new GCurve2d(Plane.XOY(), item.curve)
        node.setStyle({
            line: {
                color: item.color,
                width: item.width,
                opacity: item.opacity,
            },
        })
        grep.addNode(node)
    }

    protected _addFillItem(grep: GRep, item: DrawingFillItem) {
        if (!(item.polygon instanceof Polygon)) {
            return
        }
        const node = new GPolygon(Plane.XOY(), item.polygon)
        node.setStyle({
            face: {
                color: item.color,
                opacity: item.opacity,
            },
        })
        grep.addNode(node)
    }

    protected _addTextItem(grep: GRep, item: DrawingTextItem) {
        if (!item.text) {
            return
        }
        const node = new GText2d(item.text, Plane.XOY(), new Vec2(item.x, item.y))
        node.setStyle({
            text: {
                color: item.color,
                fontSize: item.fontSize,
                anchorX: item.anchorX,
                anchorY: item.anchorY,
            },
        })
        grep.addNode(node)
    }
}

@RegisterElement('random-polygon-element')
export class RandomPolygonElement extends PlaygroundElementBase {
    public polygon: Polygon = new Polygon()

    public static createRandomPolygon() {
        const center = new Vec2(Math.random() * 420 - 210, Math.random() * 260 - 130)
        const width = 180 + Math.random() * 140
        const height = 110 + Math.random() * 120
        const radius = Math.min(width, height) * 0.18
        const loop = new Loop([
            new Ln2(new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5), new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5)),
            Arc2.makeArcByStartEndPoints(new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5 + radius), new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5), new Vec2(center.x + width * 0.5, center.y - height * 0.5 + radius), true),
            new Ln2(new Vec2(center.x + width * 0.5, center.y - height * 0.5 + radius), new Vec2(center.x + width * 0.5, center.y + height * 0.5 - radius)),
            Arc2.makeArcByStartEndPoints(new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5 - radius), new Vec2(center.x + width * 0.5, center.y + height * 0.5 - radius), new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5), true),
            new Ln2(new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5), new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5)),
            Arc2.makeArcByStartEndPoints(new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5 - radius), new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5), new Vec2(center.x - width * 0.5, center.y + height * 0.5 - radius), true),
            new Ln2(new Vec2(center.x - width * 0.5, center.y + height * 0.5 - radius), new Vec2(center.x - width * 0.5, center.y - height * 0.5 + radius)),
            Arc2.makeArcByStartEndPoints(new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5 + radius), new Vec2(center.x - width * 0.5, center.y - height * 0.5 + radius), new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5), true),
        ])

        const polygon = new Polygon()
        polygon.addLoop(loop.rotate((Math.random() - 0.5) * Math.PI * 0.7, center), false)
        return polygon
    }

    public override markGRepDirty(): void {
        const grep = new GRep()
        grep.addNode(new GPolygon(Plane.XOY(), this.polygon.clone()))
        this.C_GRep = grep
    }
}

type EngineeringViewKind = 'front' | 'top' | 'right' | 'section'

@RegisterElement('engineering-sheet-element')
export class EngineeringSheetElement extends PlaygroundElementBase {
    public sheetWidth = 0
    public sheetHeight = 0
    public marginLeft = 0
    public marginTop = 0
    public marginRight = 0
    public marginBottom = 0
    public titleBlockWidth = 0
    public titleBlockHeight = 0
    public revisionBlockWidth = 0
    public revisionLeftColumnWidth = 0
    public revisionDateColumnWidth = 0
    public revisionChangeColumnWidth = 0
    public revisionSignColumnWidth = 0
    public revisionRowHeight = 0
    public revisionRowCount = 0
    public revisionHeaderHeight = 0
    public revisionLowerColumnWidths = [0]
    public companyName = ''
    public drawingName = ''
    public drawingNo = ''
    public version = ''
    public materialValue = ''
    public frameCurves = [new DrawingCurveItem()]
    public titleTexts = [new DrawingTextItem()]

    public applyDemoData() {
        this.sheetWidth = 297
        this.sheetHeight = 210
        this.marginLeft = 15
        this.marginTop = 10
        this.marginRight = 10
        this.marginBottom = 10
        this.titleBlockWidth = 180
        this.titleBlockHeight = 49
        this.revisionBlockWidth = 102
        this.revisionLeftColumnWidth = 10
        this.revisionDateColumnWidth = 16
        this.revisionChangeColumnWidth = 60
        this.revisionSignColumnWidth = 16
        this.revisionRowHeight = 7
        this.revisionRowCount = 7
        this.revisionHeaderHeight = 21
        this.revisionLowerColumnWidths = [12, 10, 16, 12, 10]
        this.companyName = '浙江汇隆晶片技术有限公司'
        this.drawingName = 'S3225封装结构图'
        this.drawingNo = '2301001'
        this.version = 'A01'
        this.materialValue = '材料'
        this.frameCurves = EngineeringSheetElement._buildFrameCurves(this)
        this.titleTexts = EngineeringSheetElement._buildTitleTexts(this)
    }

    public override markGRepDirty(): void {
        const grep = new GRep()
        this.frameCurves.forEach(item => this._addCurveItem(grep, item))
        this.titleTexts.forEach(item => this._addTextItem(grep, item))
        this.C_GRep = grep
    }

    private static _buildFrameCurves(sheet: EngineeringSheetElement) {
        const curves: DrawingCurveItem[] = []
        const outerLeft = -sheet.sheetWidth * 0.5
        const outerRight = sheet.sheetWidth * 0.5
        const outerBottom = -sheet.sheetHeight * 0.5
        const outerTop = sheet.sheetHeight * 0.5
        const innerLeft = outerLeft + sheet.marginLeft
        const innerRight = outerRight - sheet.marginRight
        const innerBottom = outerBottom + sheet.marginBottom
        const innerTop = outerTop - sheet.marginTop
        const titleLeft = innerRight - sheet.titleBlockWidth
        const titleRight = innerRight
        const titleBottom = innerBottom
        const titleTop = titleBottom + sheet.titleBlockHeight
        const splitX = titleLeft + sheet.revisionBlockWidth

        curves.push(...this._rectCurves(outerLeft, outerBottom, outerRight, outerTop, 1.8))
        curves.push(...this._rectCurves(innerLeft, innerBottom, innerRight, innerTop, 1.2))
        curves.push(...this._rectCurves(titleLeft, titleBottom, titleRight, titleTop, 1.2))
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(splitX, titleBottom), new Vec2(splitX, titleTop)) }))

        const x1 = titleLeft + sheet.revisionLeftColumnWidth
        const x2 = x1 + sheet.revisionDateColumnWidth
        const x3 = x2 + sheet.revisionChangeColumnWidth
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(x1, titleBottom), new Vec2(x1, titleTop)) }))
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(x2, titleBottom), new Vec2(x2, titleTop)) }))
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(x3, titleBottom), new Vec2(x3, titleTop)) }))

        for (let i = 1; i < sheet.revisionRowCount; i += 1) {
            const y = titleBottom + i * sheet.revisionRowHeight
            curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(titleLeft, y), new Vec2(splitX, y)) }))
        }

        const lowerTop = titleBottom + sheet.revisionHeaderHeight
        let currentX = x2
        sheet.revisionLowerColumnWidths.slice(0, -1).forEach(width => {
            currentX += width
            curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(currentX, titleBottom), new Vec2(currentX, lowerTop)) }))
        })

        const companyBottom = titleTop - 21
        const nameBottom = companyBottom - 9
        const materialBottom = nameBottom - 9
        const labelSplit = splitX + 12
        const middleSplit = labelSplit + 36
        const versionLabelSplit = middleSplit + 9
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(splitX, companyBottom), new Vec2(titleRight, companyBottom)) }))
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(splitX, nameBottom), new Vec2(titleRight, nameBottom)) }))
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(splitX, materialBottom), new Vec2(titleRight, materialBottom)) }))
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(labelSplit, titleBottom), new Vec2(labelSplit, companyBottom)) }))
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(middleSplit, titleBottom), new Vec2(middleSplit, materialBottom)) }))
        curves.push(new DrawingCurveItem({ curve: new Ln2(new Vec2(versionLabelSplit, titleBottom), new Vec2(versionLabelSplit, materialBottom)) }))

        return curves
    }

    private static _buildTitleTexts(sheet: EngineeringSheetElement) {
        const texts: DrawingTextItem[] = []
        const outerBottom = -sheet.sheetHeight * 0.5
        const outerRight = sheet.sheetWidth * 0.5
        const innerRight = outerRight - sheet.marginRight
        const innerBottom = outerBottom + sheet.marginBottom
        const titleLeft = innerRight - sheet.titleBlockWidth
        const splitX = titleLeft + sheet.revisionBlockWidth
        const titleTop = innerBottom + sheet.titleBlockHeight
        const rowCenters = Array.from({ length: sheet.revisionRowCount }, (_v, index) => innerBottom + sheet.revisionRowHeight * 0.5 + index * sheet.revisionRowHeight)

        texts.push(new DrawingTextItem({ text: '审核', x: titleLeft + 5, y: rowCenters[0], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '校对', x: titleLeft + 5, y: rowCenters[1], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '设计', x: titleLeft + 5, y: rowCenters[2], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '标记', x: titleLeft + 5, y: rowCenters[3], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '日期', x: titleLeft + 18, y: rowCenters[3], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '更改记录', x: titleLeft + 56, y: rowCenters[3], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '签名', x: titleLeft + 94, y: rowCenters[3], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '24.6.28', x: titleLeft + 18, y: rowCenters[0], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '24.6.15', x: titleLeft + 18, y: rowCenters[1], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '24.6.3', x: titleLeft + 18, y: rowCenters[2], fontSize: 3 }))

        const lowerX0 = titleLeft + sheet.revisionLeftColumnWidth + sheet.revisionDateColumnWidth
        const lowerWidths = sheet.revisionLowerColumnWidths
        const lowerCenters = [
            lowerX0 + lowerWidths[0] * 0.5,
            lowerX0 + lowerWidths[0] + lowerWidths[1] * 0.5,
            lowerX0 + lowerWidths[0] + lowerWidths[1] + lowerWidths[2] * 0.5,
            lowerX0 + lowerWidths[0] + lowerWidths[1] + lowerWidths[2] + lowerWidths[3] * 0.5,
            splitX - lowerWidths[4] * 0.5,
        ]

        texts.push(new DrawingTextItem({ text: '批准', x: lowerCenters[0], y: rowCenters[0], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '24.6.10', x: lowerCenters[1], y: rowCenters[0], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '比例', x: lowerCenters[3], y: rowCenters[0], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '10 : 1', x: lowerCenters[4], y: rowCenters[0], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '标准化', x: lowerCenters[0], y: rowCenters[1], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '24.6.25', x: lowerCenters[1], y: rowCenters[1], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '数量', x: lowerCenters[3], y: rowCenters[1], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '1 / 2', x: lowerCenters[4], y: rowCenters[1], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '工艺', x: lowerCenters[0], y: rowCenters[2], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '24.6.10', x: lowerCenters[1], y: rowCenters[2], fontSize: 3 }))
        texts.push(new DrawingTextItem({ text: '重量', x: lowerCenters[3], y: rowCenters[2], fontSize: 3 }))

        const companyBottom = titleTop - 21
        const nameBottom = companyBottom - 9
        const materialBottom = nameBottom - 9
        const labelSplit = splitX + 12
        const middleSplit = labelSplit + 36
        const versionLabelSplit = middleSplit + 9
        const titleRight = innerRight

        texts.push(new DrawingTextItem({ text: sheet.companyName, x: (splitX + titleRight) * 0.5, y: (companyBottom + titleTop) * 0.5, fontSize: 4.4 }))
        texts.push(new DrawingTextItem({ text: '名称', x: (splitX + labelSplit) * 0.5, y: (nameBottom + companyBottom) * 0.5, fontSize: 3.2 }))
        texts.push(new DrawingTextItem({ text: sheet.drawingName, x: (labelSplit + titleRight) * 0.5, y: (nameBottom + companyBottom) * 0.5, fontSize: 3.2 }))
        texts.push(new DrawingTextItem({ text: '物料号', x: (splitX + labelSplit) * 0.5, y: (materialBottom + nameBottom) * 0.5, fontSize: 3.2 }))
        texts.push(new DrawingTextItem({ text: sheet.materialValue, x: (middleSplit + versionLabelSplit) * 0.5, y: (materialBottom + nameBottom) * 0.5, fontSize: 3.2 }))
        texts.push(new DrawingTextItem({ text: '图号', x: (splitX + labelSplit) * 0.5, y: (innerBottom + materialBottom) * 0.5, fontSize: 3.2 }))
        texts.push(new DrawingTextItem({ text: sheet.drawingNo, x: (labelSplit + middleSplit) * 0.5, y: (innerBottom + materialBottom) * 0.5, fontSize: 3.2 }))
        texts.push(new DrawingTextItem({ text: '版本', x: (middleSplit + versionLabelSplit) * 0.5, y: (innerBottom + materialBottom) * 0.5, fontSize: 3.2 }))
        texts.push(new DrawingTextItem({ text: sheet.version, x: (versionLabelSplit + titleRight) * 0.5, y: (innerBottom + materialBottom) * 0.5, fontSize: 3.2 }))

        return texts
    }

    private static _rectCurves(left: number, bottom: number, right: number, top: number, width: number) {
        return [
            new DrawingCurveItem({ curve: new Ln2(new Vec2(left, bottom), new Vec2(right, bottom)), width }),
            new DrawingCurveItem({ curve: new Ln2(new Vec2(right, bottom), new Vec2(right, top)), width }),
            new DrawingCurveItem({ curve: new Ln2(new Vec2(right, top), new Vec2(left, top)), width }),
            new DrawingCurveItem({ curve: new Ln2(new Vec2(left, top), new Vec2(left, bottom)), width }),
        ]
    }
}

@RegisterElement('engineering-sheet-view-element')
export class EngineeringSheetViewElement extends PlaygroundElementBase {
    public viewKind: EngineeringViewKind | '' = ''
    public curves = [new DrawingCurveItem()]
    public fills = [new DrawingFillItem()]
    public texts = [new DrawingTextItem()]

    public applyDemoGeometry(viewKind: EngineeringViewKind) {
        this.viewKind = viewKind
        switch (viewKind) {
            case 'front':
                this.curves = EngineeringSheetViewElement._buildFrontCurves()
                this.fills = []
                this.texts = EngineeringSheetViewElement._buildFrontTexts()
                break
            case 'top':
                this.curves = EngineeringSheetViewElement._buildTopCurves()
                this.fills = []
                this.texts = EngineeringSheetViewElement._buildTopTexts()
                break
            case 'right':
                this.curves = EngineeringSheetViewElement._buildRightCurves()
                this.fills = []
                this.texts = EngineeringSheetViewElement._buildRightTexts()
                break
            case 'section':
                this.curves = EngineeringSheetViewElement._buildSectionCurves()
                this.fills = EngineeringSheetViewElement._buildSectionFills()
                this.texts = EngineeringSheetViewElement._buildSectionTexts()
                break
        }
    }

    public override markGRepDirty(): void {
        const grep = new GRep()
        this.fills.forEach(item => this._addFillItem(grep, item))
        this.curves.forEach(item => this._addCurveItem(grep, item))
        this.texts.forEach(item => this._addTextItem(grep, item))
        this.C_GRep = grep
    }

    private static _line(x1: number, y1: number, x2: number, y2: number, width = 1, color = '#d7e3f4', opacity = 1) {
        return new DrawingCurveItem({
            curve: new Ln2(new Vec2(x1, y1), new Vec2(x2, y2)),
            color,
            width,
            opacity,
        })
    }

    private static _rect(center: Vec2, width: number, height: number, lineWidth = 1.2) {
        const halfW = width * 0.5
        const halfH = height * 0.5
        const left = center.x - halfW
        const right = center.x + halfW
        const bottom = center.y - halfH
        const top = center.y + halfH
        return [
            this._line(left, bottom, right, bottom, lineWidth),
            this._line(right, bottom, right, top, lineWidth),
            this._line(right, top, left, top, lineWidth),
            this._line(left, top, left, bottom, lineWidth),
        ]
    }

    private static _circle(center: Vec2, radius: number, width = 1.2) {
        return new DrawingCurveItem({
            curve: new Arc2(new Coord2(center, Vec2.X()), radius, radius, true, [0, Math.PI * 2]),
            width,
        })
    }

    private static _centerMark(center: Vec2, radius: number) {
        return [
            this._circle(center, radius),
            this._line(center.x - radius - 18, center.y, center.x + radius + 18, center.y, 1.2, '#cbd5e1', 0.85),
            this._line(center.x, center.y - radius - 18, center.x, center.y + radius + 18, 1.2, '#cbd5e1', 0.85),
        ]
    }

    private static _hatchRect(lb: Vec2, rt: Vec2, spacing = 5, color = '#cbd5e1') {
        const curves: DrawingCurveItem[] = []
        const width = rt.x - lb.x
        const height = rt.y - lb.y
        for (let offset = -height; offset <= width; offset += spacing) {
            const startX = Math.max(lb.x, lb.x + offset)
            const startY = Math.max(lb.y, lb.y - offset)
            const endX = Math.min(rt.x, lb.x + offset + height)
            const endY = Math.min(rt.y, lb.y - offset + width)
            if (endX - startX < 1 || endY - startY < 1) {
                continue
            }
            curves.push(this._line(startX, startY, endX, endY, 1, color, 0.75))
        }
        return curves
    }

    private static _buildFrontCurves() {
        const center = new Vec2(-88, -2)
        return [
            ...this._rect(center, 76, 56),
            ...this._rect(center, 48, 32),
            ...this._rect(new Vec2(center.x - 22, center.y + 10), 18, 10),
            ...this._rect(new Vec2(center.x - 22, center.y - 12), 18, 10),
            this._line(center.x - 38, center.y, center.x + 38, center.y, 0.9),
            this._line(center.x, center.y - 28, center.x, center.y + 28, 0.9),
            this._line(center.x - 24, center.y + 16, center.x + 24, center.y + 16, 0.8),
            this._line(center.x - 24, center.y - 16, center.x + 24, center.y - 16, 0.8),
            ...this._centerMark(center, 8),
            this._line(center.x - 18, center.y + 31, center.x - 18, center.y - 27, 0.8),
            this._line(center.x + 18, center.y + 31, center.x + 18, center.y - 27, 0.8),
        ]
    }

    private static _buildFrontTexts() {
        return [
            new DrawingTextItem({ text: 'A', x: -106, y: 36, fontSize: 3 }),
            new DrawingTextItem({ text: 'A', x: -70, y: 36, fontSize: 3 }),
            new DrawingTextItem({ text: '主视图', x: -88, y: -37, fontSize: 3.4 }),
        ]
    }

    private static _buildTopCurves() {
        const center = new Vec2(-88, 54)
        return [
            ...this._rect(center, 48, 34),
            ...this._rect(center, 24, 18),
            this._line(center.x - 24, center.y - 8, center.x + 24, center.y - 8, 0.8),
            this._line(center.x - 24, center.y + 8, center.x + 24, center.y + 8, 0.8),
            this._line(center.x - 12, center.y - 17, center.x - 12, center.y + 17, 0.8),
            this._line(center.x + 12, center.y - 17, center.x + 12, center.y + 17, 0.8),
            ...this._centerMark(center, 6),
        ]
    }

    private static _buildTopTexts() {
        return [
            new DrawingTextItem({ text: '俯视图', x: -88, y: 79, fontSize: 3.4 }),
        ]
    }

    private static _buildRightCurves() {
        const center = new Vec2(18, -2)
        return [
            ...this._rect(center, 58, 52),
            ...this._rect(center, 38, 28),
            this._line(center.x - 29, center.y + 14, center.x + 29, center.y + 14, 0.8),
            this._line(center.x - 29, center.y - 14, center.x + 29, center.y - 14, 0.8),
            this._line(center.x - 15, center.y - 26, center.x - 15, center.y + 26, 0.8),
            this._line(center.x + 15, center.y - 26, center.x + 15, center.y + 26, 0.8),
            ...this._centerMark(center, 7),
        ]
    }

    private static _buildRightTexts() {
        return [
            new DrawingTextItem({ text: '右视图', x: 18, y: -36, fontSize: 3.4 }),
        ]
    }

    private static _buildSectionCurves() {
        const center = new Vec2(18, 54)
        const lb = new Vec2(center.x - 30, center.y - 18)
        const rt = new Vec2(center.x + 30, center.y + 18)
        return [
            ...this._rect(center, 60, 36),
            ...this._rect(new Vec2(center.x - 10, center.y), 10, 18),
            ...this._rect(new Vec2(center.x + 10, center.y), 10, 18),
            this._line(center.x - 30, center.y, center.x + 30, center.y, 0.8),
            ...this._hatchRect(lb, rt, 5, '#cbd5e1'),
        ]
    }

    private static _buildSectionFills() {
        const center = new Vec2(18, 54)
        const lb = new Vec2(center.x - 30, center.y - 18)
        const rt = new Vec2(center.x + 30, center.y + 18)
        return [
            new DrawingFillItem({
                polygon: Polygon.createByRectangle(lb, rt),
                color: '#94a3b8',
                opacity: 0.1,
            }),
        ]
    }

    private static _buildSectionTexts() {
        return [
            new DrawingTextItem({ text: '剖面 A-A', x: 18, y: 78, fontSize: 3.4 }),
        ]
    }
}

@RegisterElement('style-demo-element')
export class StyleDemoElement extends PlaygroundElementBase {
    public override markGRepDirty(): void {
        const grep = new GRep()
        this._addText(grep, 'Style Mechanism Demo', new Vec2(-420, 310))
        this._addText(grep, 'default', new Vec2(-360, 230))
        this._addText(grep, 'local style', new Vec2(-40, 230))
        this._addText(grep, 'inherit', new Vec2(290, 230))

        const pointDefault = new GPoint2d(Plane.XOY(), new Vec2(-360, 140))
        const pointLocal = new GPoint2d(Plane.XOY(), new Vec2(-40, 140))
        pointLocal.setStyle({ point: { color: '#ef4444', size: 16, opacity: 0.45 } })
        const pointParent = new GRep().setStyle({ point: { color: '#06b6d4', size: 20, opacity: 0.55 } })
        pointParent.addNode(new GPoint2d(Plane.XOY(), new Vec2(290, 140)))
        grep.addNode(pointDefault)
        grep.addNode(pointLocal)
        grep.addNode(pointParent)

        const lineDefault = new GCurve2d(Plane.XOY(), new Ln2(new Vec2(-420, 40), new Vec2(-300, 40)))
        const lineLocal = new GCurve2d(Plane.XOY(), new Ln2(new Vec2(-100, 40), new Vec2(20, 40)))
        lineLocal.setStyle({ line: { color: '#22c55e', width: 6, opacity: 0.4 } })
        const lineParent = new GRep().setStyle({ line: { color: '#f59e0b', width: 10, opacity: 0.65 } })
        lineParent.addNode(new GCurve2d(Plane.XOY(), new Ln2(new Vec2(230, 40), new Vec2(350, 40))))
        grep.addNode(lineDefault)
        grep.addNode(lineLocal)
        grep.addNode(lineParent)

        const polygonDefault = new GPolygon(Plane.XOY(), Polygon.createByRectangle(new Vec2(-420, -130), new Vec2(-300, -40)))
        const polygonLocal = new GPolygon(Plane.XOY(), Polygon.createByRectangle(new Vec2(-100, -130), new Vec2(20, -40)))
        polygonLocal.setStyle({ face: { color: '#3b82f6', opacity: 0.42 } })
        const polygonParent = new GRep().setStyle({ face: { color: '#8b5cf6', opacity: 0.58 } })
        polygonParent.addNode(new GPolygon(Plane.XOY(), Polygon.createByRectangle(new Vec2(230, -130), new Vec2(350, -40))))
        grep.addNode(polygonDefault)
        grep.addNode(polygonLocal)
        grep.addNode(polygonParent)

        const textDefault = new GText2d('Default text', Plane.XOY(), new Vec2(-360, -245))
        const textLocal = new GText2d('Styled text', Plane.XOY(), new Vec2(-40, -245))
        textLocal.setStyle({
            text: {
                color: '#f97316',
                fontSize: 28,
                anchorX: EN_AnchorX.Left,
                anchorY: EN_AnchorY.Top,
            },
        })
        const textParent = new GRep().setStyle({
            text: {
                color: '#14b8a6',
                fontSize: 24,
                anchorX: EN_AnchorX.Right,
                anchorY: EN_AnchorY.Bottom,
            },
        })
        textParent.addNode(new GText2d('Inherited text', Plane.XOY(), new Vec2(290, -245)))
        grep.addNode(textDefault)
        grep.addNode(textLocal)
        grep.addNode(textParent)

        this._assertStyle('point local style applied', pointLocal.toRenderNode().style.point?.color === '#ef4444', pointLocal.toRenderNode().style.point)
        this._assertStyle('point inherited style applied', pointParent.children[0].toRenderNode().style.point?.color === '#06b6d4', pointParent.children[0].toRenderNode().style.point)
        this._assertStyle('line local style applied', lineLocal.toRenderNode().style.line?.color === '#22c55e', lineLocal.toRenderNode().style.line)
        this._assertStyle('line inherited style applied', lineParent.children[0].toRenderNode().style.line?.color === '#f59e0b', lineParent.children[0].toRenderNode().style.line)
        this._assertStyle('face local style applied', polygonLocal.toRenderNode().style.face?.color === '#3b82f6', polygonLocal.toRenderNode().style.face)
        this._assertStyle('face inherited style applied', polygonParent.children[0].toRenderNode().style.face?.color === '#8b5cf6', polygonParent.children[0].toRenderNode().style.face)
        this._assertStyle('text local style applied', textLocal.toRenderNode().style.text?.color === '#f97316', textLocal.toRenderNode().style.text)
        this._assertStyle('text inherited style applied', textParent.children[0].toRenderNode().style.text?.color === '#14b8a6', textParent.children[0].toRenderNode().style.text)

        this._addText(grep, 'Anchor Probe', new Vec2(-420, -340))
        const anchorCenter = new Vec2(260, -350)
        const horizontalGuide = new GCurve2d(Plane.XOY(), new Ln2(new Vec2(anchorCenter.x - 170, anchorCenter.y), new Vec2(anchorCenter.x + 170, anchorCenter.y)))
        horizontalGuide.setStyle({ line: { color: '#64748b', width: 1, opacity: 0.75 } })
        grep.addNode(horizontalGuide)
        const verticalGuide = new GCurve2d(Plane.XOY(), new Ln2(new Vec2(anchorCenter.x, anchorCenter.y - 120), new Vec2(anchorCenter.x, anchorCenter.y + 120)))
        verticalGuide.setStyle({ line: { color: '#64748b', width: 1, opacity: 0.75 } })
        grep.addNode(verticalGuide)
        const centerPoint = new GPoint2d(Plane.XOY(), anchorCenter.clone())
        centerPoint.setStyle({ point: { color: '#e2e8f0', size: 6, opacity: 1 } })
        grep.addNode(centerPoint)
        const centerLabel = new GText2d('cross = shared anchor point', Plane.XOY(), new Vec2(anchorCenter.x - 150, anchorCenter.y + 132))
        centerLabel.setStyle({ text: { color: '#94a3b8', fontSize: 14 } })
        grep.addNode(centerLabel)

        const anchorSpecs = [
            { label: 'Left / Top', pos: new Vec2(anchorCenter.x - 120, anchorCenter.y + 80), anchorX: EN_AnchorX.Left, anchorY: EN_AnchorY.Top, color: '#f97316' },
            { label: 'Center / Middle', pos: new Vec2(anchorCenter.x, anchorCenter.y), anchorX: EN_AnchorX.Center, anchorY: EN_AnchorY.Middle, color: '#22c55e' },
            { label: 'Right / Bottom', pos: new Vec2(anchorCenter.x + 120, anchorCenter.y - 80), anchorX: EN_AnchorX.Right, anchorY: EN_AnchorY.Bottom, color: '#38bdf8' },
        ]

        anchorSpecs.forEach(spec => {
            const probe = new GText2d(spec.label, Plane.XOY(), spec.pos)
            probe.setStyle({ text: { color: spec.color, fontSize: 20, anchorX: spec.anchorX, anchorY: spec.anchorY } })
            grep.addNode(probe)
            const probeStyle = probe.toRenderNode().style.text
            this._assertStyle(`anchor probe ${spec.label}`, probeStyle?.anchorX === spec.anchorX && probeStyle?.anchorY === spec.anchorY && probeStyle?.color === spec.color, probeStyle)
        })

        this.C_GRep = grep
    }
}
