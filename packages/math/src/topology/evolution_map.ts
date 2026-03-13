/**
 * 演化关系记录。
 * 鼓励使用 “新几何体 => 旧几何体”的映射方式。在这种方式下，用 replaceKey() 可以高效地追加新的变化。
 * 相比之下，“旧几何体 => 新几何体” 的构造方式，用 merge() 来追加新的变化效率较低
 *
 */
export class EvolutionMap<KeyType, ValueType = KeyType> extends Map<KeyType, ValueType[]> {
    /**
     * 添加演化关系
     * @param key
     * @param value
     */
    public add(key: KeyType, ...values: ValueType[]) {
        const list = this.get(key);
        if (list) {
            list.push(...values);
        } else {
            this.set(key, values);
        }
    }



    /**
     * 删除演化关系，若未指定 key，则会枚举所有 key。若从待删除 value 为某 values 列表中最后一项，则删除该键值对
     * @param value
     * @param key
     * @return 删除成功返回 true
     */
    public remove(value: ValueType, key?: KeyType): boolean {
        const vs0 = this.get(key!);
        const rmOne = (k: KeyType, vs: ValueType[]): boolean => {
            const idx = vs.findIndex(_ => _ === value);
            if (idx < 0) return false;

            if (vs.length === 1) {
                this.delete(k);
            } else {
                vs.splice(idx, 1);
            }
            return true;
        };

        if (vs0) {
            return rmOne(key!, vs0);
        }

        if (key) return false;

        let ret = false;
        for (const [k, vs] of this.entries()) {
            ret = ret || rmOne(k, vs);
        }
        return ret;
    }

    /**
     * 连接演化关系，仅保留使用到的键和值。通常 B' 为 B 的字集，用于连接算法中的多个步骤。
     * this(A -> B) connect evo2(B'-> C) =>  (A -> (B & B') -> C) => (A -> C)
     * 相关函数：connectKeyMap(), mergeKeyMap(), mergeValueMap()
     * @param evo2
     */
    public connectValueMap<ValueType2>(
        evo2: EvolutionMap<ValueType, ValueType2>,
        revserveEmptyKey = true,
    ): EvolutionMap<KeyType, ValueType2> {
        const ret = new EvolutionMap<KeyType, ValueType2>();
        for (const [key, vs] of this) {
            const newVs = new Set<ValueType2>();

            for (const v of vs) {
                const vs2 = evo2.get(v);
                if (vs2) {
                    vs2.forEach(_ => newVs.add(_));
                }
            }
            if (newVs.size > 0 || revserveEmptyKey) {
                ret.set(key, Array.from(newVs));
            }
        }
        return ret;
    }

    /**
     * 连接演化关系，仅保留使用到的键和值。通常 B' 为 B 的字集，用于连接算法中的多个步骤。
     * evo0(A -> B) connect this(B'-> C) =>  (A -> (B & B') -> C) => (A -> C)
     * 相关函数：connectValueMap(), mergeKeyMap(), mergeValueMap()
     * @param evo2
     */
    public connectKeyMap<KeyType0>(
        evo0: EvolutionMap<KeyType0, KeyType>,
        revserveEmptyKey = true,
    ): EvolutionMap<KeyType0, ValueType> {
        return evo0.connectValueMap(this, revserveEmptyKey);
    }

    /**
     * 合并演化关系，尽可能保留所有的键值对。通常用于合并多个操作。
     * this(A -> B) merge evo2(B' -> C) => (A -> C + A -> B (not in B') + B'(not in B) -> C)
     * 相关函数：connectKeyMap(), connectValueMap(), mergeKeyMap()
     * @param evo2
     */
    public mergeValueMap<ValueType2>(
        evo2: EvolutionMap<ValueType, ValueType2>,
    ): EvolutionMap<KeyType | ValueType, ValueType | ValueType2> {
        const newEvo = new EvolutionMap<KeyType | ValueType, ValueType | ValueType2>();
        const usedKey = new Set<ValueType>();

        for (const [k1, v1s] of this) {
            const newVs = new Set<ValueType | ValueType2>();
            for (const v1 of v1s) {
                const v2s = evo2.get(v1);
                if (v2s) {
                    v2s.forEach(_ => newVs.add(_));
                    usedKey.add(v1);
                } else {
                    newVs.add(v1);
                }
            }
            newEvo.set(k1, Array.from(newVs));
        }

        for (const [k2, v2s] of evo2) {
            if (!usedKey.has(k2)) {
                const newVs = newEvo.get(k2);
                if (newVs) {
                    newVs.push(...v2s);
                } else {
                    newEvo.set(k2, v2s);
                }
            }
        }
        return newEvo;
    }

    /**
     * 合并演化关系，尽可能保留所有的键值对。通常用于合并多个操作。
     * evo0(A -> B) merge this(B' -> C) => (A -> C + A -> B (not in B') + B'(not in B) -> C)
     * 相关函数：connectKeyMap(), connectValueMap(), mergeValueMap()
     * @param evo2
     */
    public mergeKeyMap<KeyType0>(
        evo0: EvolutionMap<KeyType0, KeyType>,
    ): EvolutionMap<KeyType0 | KeyType, KeyType | ValueType> {
        return evo0.mergeValueMap(this);
    }

    /**
     * 使用新的 key 替换原有 key
     * @param evo2 新 key => 旧 key
     * @param keysToDelete 替换后需删除的键值
     * @return 发生替换的键值对
     */
    public appendKey(evo0: EvolutionMap<KeyType, KeyType>, keysToDelete?: KeyType[]): void;

    /**
     * 使用新的 key 替换原有 key。若输入键值为空，则当 reserveReplacedKey 为 true 时会删除对应键值
     * @param evo2 新 key => 旧 key
     * @param deleteReplacedKeys 为 true 时，会删除被替换的键值
     * @return 发生替换的键值对
     */
    public appendKey(evo0: EvolutionMap<KeyType | undefined, KeyType>, deleteReplacedKeys?: boolean): void;

    public appendKey(evo0: EvolutionMap<KeyType | undefined, KeyType>, keysToDelete?: KeyType[] | boolean): void {
        for (const [k0, v0s] of evo0) {
            if (k0 === undefined) continue;

            for (const v0 of v0s) {
                const vs = this.get(v0);
                if (vs) this.add(k0, ...vs);
            }
        }

        if (keysToDelete instanceof Array) {
            for (const key of keysToDelete) {
                this.delete(key);
            }
        } else if (keysToDelete) {
            for (const v0s of evo0.values()) {
                for (const v0 of v0s) {
                    if (!evo0.has(v0)) {
                        this.delete(v0);
                    }
                }
            }
        }
    }

    /**
     * 获取不重复的结果集
     */
    public uniqueValues(): ValueType[] {
        const ret = new Set<ValueType>();
        for (const vs of this.values()) {
            for (const v of vs) {
                ret.add(v);
            }
        }
        return [...ret];
    }

    /**
     * 生成反向演化关系，不保留空值的键
     */
    public reversed(): EvolutionMap<ValueType, KeyType> {
        const ret = new EvolutionMap<ValueType, KeyType>();
        for (const [key, values] of this) {
            for (const v of values) {
                ret.add(v, key);
            }
        }
        return ret;
    }

    /**
     * 生成反向演化关系，保留空值的键，并以 undefined 作为其新键进行返回
     */
    public reversedWithEmptyValue(): EvolutionMap<ValueType | undefined, KeyType> {
        const ret = new EvolutionMap<ValueType | undefined, KeyType>();
        for (const [key, values] of this) {
            if (values.length === 0) {
                ret.add(undefined, key);
            } else {
                for (const v of values) {
                    ret.add(v, key);
                }
            }
        }
        return ret;
    }

    /**
     * 清空未使用到的键
     * @param usedKeys
     * @returns 返回被清除的键值对
     */
    public clearUnusedKeys(usedKeys: Set<KeyType>): [KeyType, ValueType[]][] {
        const unUsedKeys: [KeyType, ValueType[]][] = [];
        for (const entry of this) {
            if (!usedKeys.has(entry[0])) {
                unUsedKeys.push(entry);
                this.delete(entry[0]);
            }
        }
        return unUsedKeys;
    }

    /**
     * 清空未使用到的值
     * @param values
     * @returns 返回被清除的键和值
     */
    public clearUnusedValues(usedValues: Set<ValueType>): { keys: KeyType[]; values: ValueType[] } {
        const unUsedKeys: KeyType[] = [];
        const unUsedValues = new Set<ValueType>();

        for (const [key, vs] of this) {
            for (let i = vs.length - 1; i >= 0; i--) {
                if (usedValues.has(vs[i])) continue;

                unUsedValues.add(vs[i]);

                if (vs.length === 1) {
                    unUsedKeys.push(key);
                    this.delete(key);
                } else {
                    vs.splice(i, 1);
                }
            }
        }

        return { keys: unUsedKeys, values: Array.from(unUsedValues) };
    }
}