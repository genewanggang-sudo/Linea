import { EN_AnchorX, EN_AnchorY, IFaceStyle, ILineStyle, IPointStyle, IStyle, ITextStyle } from './i_style';

export class StyleUtils {
    private static default_opacity = 1
    private static default_point_color = 0xffffff
    private static default_point_size = 8
    private static default_line_color = 0xffffff
    private static default_line_width = 2
    private static default_face_color = 0xffffff
    private static default_text_color = 0xffffff
    private static default_text_fontSize = 16
    private static default_text_anchorX = EN_AnchorX.Center
    private static default_text_anchorY = EN_AnchorY.Middle

    public static defaultActiveStyle: IStyle = {
        point: { color: 0xff6800 },
        line: { color: 0xff6800 },
        face: { color: 0xff6800 },
        text: { color: 0xff6800 },
    }

    public static defaultSelectionStyle: IStyle = {
        point: { color: 0xff4500 },
        line: { color: 0xff4500 },
        face: { color: 0xff4500 },
        text: { color: 0xff4500 },
    }

    private static _isValidNumber(value: unknown): value is number {
        return typeof value === 'number' && Number.isFinite(value)
    }

    private static _isValidColor(value: unknown): value is number | string {
        return typeof value === 'number' || typeof value === 'string'
    }

    public static getPointStyle(style: IStyle = {}): IStyle {
        const point = style.point

        const pointStyle: IPointStyle = {
            opacity: this._isValidNumber(point?.opacity) ? point.opacity : this.default_opacity,
            size: this._isValidNumber(point?.size) ? point.size : this.default_point_size,
            color: this._isValidColor(point?.color) ? point.color : this.default_point_color,
        }

        return {
            point: pointStyle,
        }
    }

    public static getLineStyle(style: IStyle = {}): IStyle {
        const line = style.line

        const lineStyle: ILineStyle = {
            opacity: this._isValidNumber(line?.opacity) ? line.opacity : this.default_opacity,
            width: this._isValidNumber(line?.width) ? line.width : this.default_line_width,
            color: this._isValidColor(line?.color) ? line.color : this.default_line_color,
        }

        return {
            line: lineStyle,
        }
    }

    public static getFaceStyle(style: IStyle = {}): IStyle {
        const face = style.face

        const faceStyle: IFaceStyle = {
            opacity: this._isValidNumber(face?.opacity) ? face.opacity : this.default_opacity,
            color: this._isValidColor(face?.color) ? face.color : this.default_face_color,
        }

        return {
            face: faceStyle,
        }
    }

    public static getTextStyle(style: IStyle = {}): IStyle {
        const text = style.text

        const textStyle: ITextStyle = {
            color: this._isValidColor(text?.color) ? text.color : this.default_text_color,
            fontSize: this._isValidNumber(text?.fontSize) ? text.fontSize : this.default_text_fontSize,
            anchorX: text?.anchorX !== undefined ? text.anchorX : this.default_text_anchorX,
            anchorY: text?.anchorY !== undefined ? text.anchorY : this.default_text_anchorY,
        }

        return {
            text: textStyle,
        }
    }
}
