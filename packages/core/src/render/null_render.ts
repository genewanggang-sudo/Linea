import { GRep } from '../grep/grep';
import { IRender } from './i_render';

export class NullRender implements IRender {
    public drawActives(_greps: GRep[]): void {
        throw new Error('Method not implemented.');
    }
    public clearActive(): void {
        throw new Error('Method not implemented.');
    }
    public clearSelection(): void {
        throw new Error('Method not implemented.');
    }
    public drawSelections(_greps: GRep[]): void {
        throw new Error('Method not implemented.');
    }
    public updateView(): void {
        throw new Error('Method not implemented.');
    }
}
