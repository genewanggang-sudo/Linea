import { Request, registerRequest } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';
import { RectLineElement } from '../element/rect_line_element';
import { EN_SdkRequestIds } from '../types/type_define';

@registerRequest(EN_SdkRequestIds.CREATE_RECT_LINE)
export class CreateRectLineRequest extends Request {
    constructor(
        private readonly _start: Vec2,
        private readonly _end: Vec2,
    ) {
        super();
    }

    public execute(): RectLineElement {
        const rectLine = this._doc.create(RectLineElement);
        rectLine.start = this._start;
        rectLine.end = this._end;
        rectLine.markGRepDirty();
        return rectLine;
    }
}
