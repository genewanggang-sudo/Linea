import { describe, expect, it } from 'vitest'
import { BSpline2, Ellipse2, Vec2, intersectCurveCurve, intersectCurveSelf } from '../src'

describe('intersections regression', () => {
    it('bspline self-intersection should be found for known snapshot case', () => {
        const curve = new BSpline2(
            [
                new Vec2(-9.589858087117241, 5.725944476947604),
                new Vec2(-6.977386057485579, 6.536828110078608),
                new Vec2(-12.676948182347818, 3.338908048921967),
                new Vec2(-9.545103426091833, 2.816368702964526),
                new Vec2(-14.61354076459806, 1.2496371668059858),
                new Vec2(-6.7826020117063255, 1.2155225483262713),
                new Vec2(-12.663329771604452, -0.2735319699046684),
                new Vec2(-4.1265846648253275, -0.45177499437323676),
                new Vec2(-5.812264693252418, 1.8613475658832932),
                new Vec2(-3.608864585817204, 1.9061575151515584),
                new Vec2(-5.697236999095774, 0.8318480092617876),
            ],
            3,
            {
                expandedKnots: [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8],
                weights: new Array(11).fill(1),
                isPeriodic: false,
            },
        )

        const result = intersectCurveSelf(curve)
        expect(result.length).toBeGreaterThan(0)

        // Expected self intersection around (-5.06482, 1.17931) from exported snapshot analysis.
        const target = new Vec2(-5.06482, 1.17931)
        const hit = result.some((item) => item.point.distanceTo(target) < 5e-3)
        expect(hit).toBe(true)
    })

    it('bspline self-intersection should reject diagonal pseudo-solutions', () => {
        const curve = new BSpline2(
            [
                new Vec2(-4.806333910963993, 9.48474299388984),
                new Vec2(-13.20823438432106, 5.917096057447496),
                new Vec2(-4.235309955437865, 4.316006494445661),
                new Vec2(-13.01723199193359, 3.6372835197711737),
                new Vec2(-5.557947589169872, 1.9143713532897815),
                new Vec2(-12.304807523652203, 0.5569254039408046),
                new Vec2(-4.831163048354044, 0.3480875655794231),
                new Vec2(-4.1662499653776495, 2.9933663203881613),
                new Vec2(-2.5622060453492246, 1.3400672977959835),
                new Vec2(-4.07573287890349, 1.2008410100175546),
                new Vec2(-5.76307176607934, 1.8621618936994355),
            ],
            3,
            {
                expandedKnots: [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8],
                weights: new Array(11).fill(1),
                isPeriodic: false,
            },
        )

        const result = intersectCurveSelf(curve)
        expect(result.length).toBe(1)
        expect(Math.abs(result[0].u1 - result[0].u2)).toBeGreaterThan(1e-2)
    })

    it('bspline self-intersection should find three intersections for multi-loop snapshot', () => {
        const curve = new BSpline2(
            [
                new Vec2(-5.622669194368708, 8.501255772756485),
                new Vec2(-11.886651297276986, 6.263101501942873),
                new Vec2(-5.369127516778522, 4.711314313168606),
                new Vec2(-13.348247348862207, 2.8163432418594287),
                new Vec2(-4.891870827216163, 1.9658446189502554),
                new Vec2(-5.846382840901147, 4.562103573094047),
                new Vec2(-15.078299776286356, 4.2189203735896115),
                new Vec2(-6.785980156337389, 0.36929502779019713),
                new Vec2(-6.532438478747205, 5.382760594412691),
            ],
            3,
            {
                expandedKnots: [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 6, 6, 6],
                weights: new Array(9).fill(1),
                isPeriodic: false,
            },
        )

        const result = intersectCurveSelf(curve)
        expect(result.length).toBe(3)
    })

    it('bspline-ellipse should not miss intersections for latest exported snapshot case', () => {
        const bspline = new BSpline2(
            [
                new Vec2(-10.114583015441895, 5.394629246457196),
                new Vec2(-7.54368447414322, 5.164394195213687),
                new Vec2(-12.06085747654279, 3.423476705992265),
                new Vec2(-7.781045669440174, 3.0604548002689205),
                new Vec2(-12.999978968607593, 1.9238576929479574),
                new Vec2(-4.5252858061087915, 1.9689256663129922),
                new Vec2(-14.278394433914318, 1.0002570034468807),
                new Vec2(-2.8397445671896295, 0.5084355583995462),
                new Vec2(-9.760802635973114, 0.25776275382670827),
                new Vec2(-4.248371160369387, 2.6319481182334523),
                new Vec2(-13.25290210418723, 2.6332274117400156),
                new Vec2(-7.280960539701358, 4.269326800763631),
            ],
            3,
            {
                expandedKnots: [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9],
                weights: new Array(12).fill(1),
                isPeriodic: false,
            },
        )
        const ellipse = new Ellipse2(
            new Vec2(-8.02083444595337, 4.4881439877168905),
            5.365393745882672,
            0.38843209851400406,
            -1.6777803371495785,
        )

        const result = intersectCurveCurve(bspline, ellipse)
        // Latest snapshot still misses 2 roots: expected 10, current 8.
        expect(result.length).toBe(10)
    })
})
