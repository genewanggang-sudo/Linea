import { Request, registerRequest } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';
import { CircleElement } from '../element/circle_element';
import { EN_SdkRequestIds } from '../types/type_define';

@registerRequest(EN_SdkRequestIds.CREATE_CIRCLE)
export class CreateCircleRequest extends Request {
    constructor(
        private readonly _center: Vec2,
        private readonly _radius: number,
    ) {
        super();
    }

    public execute(): CircleElement {
        const circle = this._doc.create(CircleElement);
        circle.center = this._center;
        circle.radius = this._radius;
        circle.markGRepDirty();
        return circle;
    }
}
