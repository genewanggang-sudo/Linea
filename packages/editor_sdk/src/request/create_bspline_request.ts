import { Request, registerRequest } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';
import { BSplineElement } from '../element/bspline_element';
import { EN_SdkRequestIds } from '../types/type_define';

@registerRequest(EN_SdkRequestIds.CREATE_BSPLINE)
export class CreateBSplineRequest extends Request {
    constructor(
        private readonly _controlPoints: Vec2[],
        private readonly _degree: number,
        private readonly _knots: number[] = [],
        private readonly _weights: number[] = [],
    ) {
        super();
    }

    public execute(): BSplineElement {
        const bspline = this._doc.create(BSplineElement);
        bspline.controlPoints = this._controlPoints;
        bspline.degree = this._degree;
        bspline.knots = this._knots;
        bspline.weights = this._weights;
        bspline.markGRepDirty();
        return bspline;
    }
}
