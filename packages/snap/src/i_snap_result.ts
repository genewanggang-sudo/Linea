import type { GGroup, GNode } from '@ccpc/core'

import { EN_SNAP_TYPE } from './snap_type';

/**
* 捕捉结果
*/
export interface ISnapResult {
    getSnapType(): EN_SNAP_TYPE;

    getSnappedGNodes(): GNode[];

    addSnappedGNode(snappedGNode: GNode): void;

    getSnapPrompt(): GGroup;
}
