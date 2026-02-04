/*
 * Linea Math - Serialize
 * 统一注册入口（在此集中注册所有可反序列化类型）
 */

import { GeomMgr } from './geom_mgr'

export const geomRegistry = new GeomMgr()
