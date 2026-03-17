import { Request, registerRequest } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';
import { LineElement } from '../element/line_element';
import { EN_SdkRequestIds } from '../types/type_define';

@registerRequest(EN_SdkRequestIds.CREATE_LINE)
export class CreateLineRequest extends Request {
    constructor(
        private readonly _start: Vec2,
        private readonly _end: Vec2,
    ) {
        super();
    }

    public execute(): LineElement {
        const line = this._doc.create(LineElement);
        line.start = this._start;
        line.end = this._end;
        line.markGRepDirty();
        return line;
    }
}
