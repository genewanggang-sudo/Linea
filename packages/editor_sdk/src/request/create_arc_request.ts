import { Request, registerRequest } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';
import { ArcElement } from '../element/arc_element';
import { EN_SdkRequestIds } from '../types/type_define';

@registerRequest(EN_SdkRequestIds.CREATE_ARC)
export class CreateArcRequest extends Request {
    constructor(
        private readonly _center: Vec2,
        private readonly _radius: number,
        private readonly _startAngle: number,
        private readonly _endAngle: number,
        private readonly _isCCW: boolean,
    ) {
        super();
    }

    public execute(): ArcElement {
        const arc = this._doc.create(ArcElement);
        arc.center = this._center;
        arc.radius = this._radius;
        arc.startAngle = this._startAngle;
        arc.endAngle = this._endAngle;
        arc.isCCW = this._isCCW;
        arc.markGRepDirty();
        return arc;
    }
}
