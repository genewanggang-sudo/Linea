// https://protectwise.github.io/troika/troika-three-text/
declare module 'troika-three-text' {
    import { Material, Mesh } from 'three'

    export class Text extends Mesh {
        public text: string

        public font?: string

        public fontSize: number

        public color: string | number

        public anchorX: string | number

        public anchorY: string | number

        public maxWidth: number

        public overflowWrap: string

        public whiteSpace: string

        public material: Material | Material[]

        public sync(callback?: () => void): void

        public dispose(): void
    }
}
