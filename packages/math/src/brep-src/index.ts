// Brep算法库
import * as alg from './algorithm';
import * as Continuous from './continuous';
import { v4 as uuid } from 'uuid'

// BREP
export { Vertex } from './brep/vertex';
export { Edge } from './brep/edge';
export { Coedge3d } from './brep/coedge3d';
export { Face } from './brep/face';
export { Wire } from './brep/wire';
export { Shell } from './brep/shell';
export { BrepBody } from './brep/brep_body';

export { BrepUtil } from './util/util';
export { alg };
export { Continuous };
export { uuid }
