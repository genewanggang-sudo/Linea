export enum UnitType {
    MM,



    METER,

    INCH,
}

/**
 *  内部实现单位制转换，为了计算效率更高，都采用二的倍数，不是标准的缩放倍数
 */
export class UnitsConversion {
    public static getScale(unitType = UnitType.MM): number {
        if (unitType === UnitType.METER) {
            return 1024; // 为了计算效率更高，都采用二的倍数
        }

        if (unitType === UnitType.INCH) {
            return 32; // 为了计算效率更高，都采用二的倍数
        }

        return 1;
    }
}

export class NormalUnitsConversion {
    public static getScale(unitType = UnitType.MM): number {
        if (unitType === UnitType.METER) {
            return 1000;
        }

        if (unitType === UnitType.INCH) {
            return 25.39999918;
        }

        return 1;
    }
}