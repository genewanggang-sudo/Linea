import { Request, registerRequest } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';
import { EllipseElement } from '../element/ellipse_element';
import { EN_SdkRequestIds } from '../types/type_define';

@registerRequest(EN_SdkRequestIds.CREATE_ELLIPSE)
export class CreateEllipseRequest extends Request {
    constructor(
        private readonly _center: Vec2,
        private readonly _xDir: Vec2,
        private readonly _majorRadius: number,
        private readonly _minorRadius: number,
    ) {
        super();
    }

    public execute(): EllipseElement {
        const ellipse = this._doc.create(EllipseElement);
        ellipse.center = this._center;
        ellipse.xDir = this._xDir;
        ellipse.majorRadius = this._majorRadius;
        ellipse.minorRadius = this._minorRadius;
        ellipse.markGRepDirty();
        return ellipse;
    }
}
