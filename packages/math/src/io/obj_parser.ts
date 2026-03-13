import { types } from '../type_define/i_types';



export class ObjParser {
    public static exportMeshes(meshes: types.IFlatMesh[]): string {
        let ret = '';

        // output vertex
        for (const mesh of meshes) {
            for (let i = 0; i < mesh.vertices.length; i += 3) {
                ret += `v ${mesh.vertices[i]} ${mesh.vertices[i + 1]} ${mesh.vertices[i + 2]}\n`;
            }
        }

        // output uv
        for (const mesh of meshes) {
            for (let i = 0; i < mesh.uvs.length; i += 2) {
                ret += `vt ${mesh.uvs[i]} ${mesh.uvs[i + 1]}\n`;
            }
        }

        // output normal
        for (const mesh of meshes) {
            for (let i = 0; i < mesh.normals.length; i += 3) {
                ret += `vn ${mesh.normals[i]} ${mesh.normals[i + 1]} ${mesh.normals[i + 2]}\n`;
            }
        }

        // output faces (obj index start with 1)
        let ofs = 1;
        for (const mesh of meshes) {
            for (let i = 0; i < mesh.faces.length; i += 3) {
                const v0 = mesh.faces[i] + ofs;
                const v1 = mesh.faces[i + 1] + ofs;
                const v2 = mesh.faces[i + 2] + ofs;
                ret += `f ${v0}/${v0}/${v0} ${v1}/${v1}/${v1} ${v2}/${v2}/${v2}\n`;
            }
            ofs += mesh.vertices.length / 3;
        }

        return ret;
    }
}