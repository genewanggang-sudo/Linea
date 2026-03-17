import { Request, registerRequest } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';
import { PolyLineElement } from '../element/poly_line_element';
import { EN_SdkRequestIds } from '../types/type_define';

@registerRequest(EN_SdkRequestIds.CREATE_POLYLINE)
export class CreatePolylineRequest extends Request {
    constructor(
        private readonly _points: Vec2[],
    ) {
        super();
    }

    public execute(): PolyLineElement {
        const polyline = this._doc.create(PolyLineElement);
        polyline.points = this._points;
        polyline.markGRepDirty();
        return polyline;
    }
}
