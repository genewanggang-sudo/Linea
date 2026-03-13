import { IGeo } from '../type_define/i_element';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';



/**
 * 将字符串/Json反射为几何
 */
export class Loader {
    private static _ctors: Map<EN_GEO_TYPE, types.Class<IGeo>> = new Map();

    public static registerGeo(...ctors: types.Class<IGeo>[]) {
        for (const Ctor of ctors) {
            const type = new Ctor().getType();
            if (this._ctors.has(type)) {
                //
                console.error('registerGeo duplicated');
                return;
            }

            this._ctors.set(type, Ctor);
        }
    }

    /**
     *  将字符串反序列化为几何，调试用
     * @returns 返回几何元素或点
     */
    public static reflect(str: string): IGeo[] {
        const result = [];

        let metaString = str;

        // 支持2种格式：1.整个str是1个json
        try {
            let json = JSON.parse(metaString);
            // 去换行符
            metaString = JSON.stringify(json);
        } catch (error) {
        }

        // 2. 每行是一个json
        const strs: string[] = metaString.split('\n');
        for (let s of strs) {
            s = s.trim();
            if (s.length < 10) {
                continue;
            }

            // 反射出几何对象
            try {
                const jsObj = JSON.parse(s);
                if (Array.isArray(jsObj)) {
                    jsObj.flat(100).forEach(_ => {
                        const geo = this.load(_);
                        result.push(geo);
                    });
                } else {
                    const geo = this.load(jsObj);
                    result.push(geo);
                }
            } catch (error) {
                //
                console.error(error);
            }
        }

        return result;
    }

    /**
     *  根据元数据对象构造几何对象
     * @returns 返回几何元素
     */
    public static load(json: types.IDBLibGeo): IGeo {
        const Ctor = this._ctors.get(json.type);
        if (!Ctor) {
            throw new Error(`请注册类型:${json.type}`);
        }

        return new Ctor().load(json);
    }

    /**
     * load外部的mesh数据
     */
    public static reflectMesh(jsonString: string): IGeo[] {
        const result = [];

        const strs: string[] = jsonString.split('\n');
        for (let s of strs) {
            s = s.trim();
            if (s.length < 10) {
                continue;
            }

            // 反射出几何对象
            try {
                const jsObj = JSON.parse(s);
                if (!jsObj.faces || !jsObj.normals || !jsObj.vertices || !jsObj.uvs) {
                    throw new Error('load数据的类型不正确');
                }

                jsObj.type = 'RENDER_MESH';
                jsObj.data = [jsObj.vertices, jsObj.faces, jsObj.normals, jsObj.uvs];
                jsObj.vertices = [];
                jsObj.faces = [];
                jsObj.uvs = [];

                const geo = this.load(jsObj);
                result.push(geo);
            } catch (error) {
                //
                console.error(error);
            }
        }

        return result;
    }
}