import { describe, expect, it } from 'vitest';
import { lensIsCompatibleWithBody } from './capability';
import { IPHONE_BODIES, IPHONE_LENSES } from './iphoneCatalog';

function body(id: string) {
	const found = IPHONE_BODIES.find((item) => item.id === id);
	if (!found) throw new Error(`Missing test body ${id}`);
	return found;
}

function lens(id: string) {
	const found = IPHONE_LENSES.find((item) => item.id === id);
	if (!found) throw new Error(`Missing test lens ${id}`);
	return found;
}

describe('iPhone camera catalog', () => {
	it('covers the selectable iPhone 15–17 families', () => {
		expect(IPHONE_BODIES.map((item) => item.model)).toEqual(
			expect.arrayContaining([
				'iPhone 15',
				'iPhone 15 Pro Max',
				'iPhone 16 Plus',
				'iPhone 16 Pro',
				'iPhone 17',
				'iPhone Air',
				'iPhone 17 Pro Max'
			])
		);
	});

	it('keeps materially different telephoto cameras tied to their real models', () => {
		const fifteenProTele = lens('lens_iphone_15_pro_telephoto_3x');
		expect(fifteenProTele.focalLengthMm).toEqual({ min: 77, max: 77 });
		expect(fifteenProTele.maxAperture[0].maxAperture).toBe(2.8);

		const sixteenProTele = lens('lens_iphone_16_pro_telephoto_5x');
		expect(sixteenProTele.focalLengthMm).toEqual({ min: 120, max: 120 });
		expect(lensIsCompatibleWithBody(sixteenProTele, body('body_iphone_16_pro'))).toBe(true);
		expect(lensIsCompatibleWithBody(sixteenProTele, body('body_iphone_15_pro'))).toBe(false);

		const seventeenProTele = lens('lens_iphone_17_pro_telephoto_8x');
		expect(seventeenProTele.focalLengthMm).toEqual({ min: 200, max: 200 });
	});

	it('does not invent cameras on iPhone Air', () => {
		const airLenses = IPHONE_LENSES.filter((item) => item.compatibleBodyIds?.includes('body_iphone_air'));
		expect(airLenses.map((item) => item.model)).toHaveLength(2);
		expect(airLenses.map((item) => item.focalLengthMm.min)).toEqual([26, 52]);
	});
});
