import { Request, registerRequest } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';
import { EllipseArcElement } from '../element/ellipse_arc_element';
import { EN_SdkRequestIds } from '../types/type_define';

@registerRequest(EN_SdkRequestIds.CREATE_ELLIPSE_ARC)
export class CreateEllipseArcRequest extends Request {
    constructor(
        private readonly _center: Vec2,
        private readonly _xDir: Vec2,
        private readonly _majorRadius: number,
        private readonly _minorRadius: number,
        private readonly _startAngle: number,
        private readonly _endAngle: number,
        private readonly _isCCW: boolean,
    ) {
        super();
    }

    public execute(): EllipseArcElement {
        const ellipseArc = this._doc.create(EllipseArcElement);
        ellipseArc.center = this._center;
        ellipseArc.xDir = this._xDir;
        ellipseArc.majorRadius = this._majorRadius;
        ellipseArc.minorRadius = this._minorRadius;
        ellipseArc.startAngle = this._startAngle;
        ellipseArc.endAngle = this._endAngle;
        ellipseArc.isCCW = this._isCCW;
        ellipseArc.markGRepDirty();
        return ellipseArc;
    }
}
