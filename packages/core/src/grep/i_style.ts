
/**
 * 文字水平对齐
 */
export enum EN_AnchorX {
    Left = 'left',
    Center = 'center',
    Right = 'right',
}

/**
 * 文字垂直对齐
 */
export enum EN_AnchorY {
    Top = 'top',
    Middle = 'middle',
    Bottom = 'bottom',
}

export type IPointStyle = Partial<{
    color: number | string
    opacity: number
    size: number
}>

export type ILineStyle = Partial<{
    opacity: number
    color: number | string
    width: number
}>

export type IFaceStyle = Partial<{
    opacity: number
    color: number | string
}>

export type ITextStyle = Partial<{
    color: number | string
    fontSize: number
    anchorX: EN_AnchorX
    anchorY: EN_AnchorY
}>
