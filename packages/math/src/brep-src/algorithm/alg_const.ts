export enum PreviewType {
    TryGenerate = 0,
    GenerateOnly = 1,
    PreviewOnly = 2,
}



export enum SweepErrorCode {
    CoordinateZUnparallelWithPath = 'CoordinateZUnparallelWithPath',
    PathReversedConnection = 'PathReversedConnection',
    PathTwistedLoop = 'PathTwistedLoop',
    SurfaceDegenerate = 'SurfaceDegenerate',
}

export enum RevolveErrorCode {
    InputInvalidLoop = 'InputInvalidLoop',
    AllCurveInRevolveLine = 'AllCurveInRevolveLine',
    PathProjectError = 'PathProjectError',
    InvalidRevolveBody = 'InvalidRevolveBody',
}

export enum FilletErrorCode {
    InputInvalidRadius = 'InputInvalidRadius',
    InputInvalidEdges = 'InputInvalidEdges',
    FilletSelfIntersect = 'FilletSelfIntersect',
    InvalidFilletBody = 'InvalidFilletBody',
}