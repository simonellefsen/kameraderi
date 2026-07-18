import type { CameraBody, Lens } from '$lib/types/gear';

type IPhoneCamera = {
	id: string;
	label: string;
	focalLengthMm: number;
	maxAperture: number;
	hasOIS: boolean;
};

type IPhoneModel = {
	id: string;
	model: string;
	cameras: IPhoneCamera[];
};

const camera = (
	id: string,
	label: string,
	focalLengthMm: number,
	maxAperture: number,
	hasOIS: boolean
): IPhoneCamera => ({ id, label, focalLengthMm, maxAperture, hasOIS });

const ultraWide15 = camera('ultra_wide', 'Ultra Wide', 13, 2.4, false);
const ultraWide = camera('ultra_wide', 'Ultra Wide', 13, 2.2, false);
const main26 = camera('main', 'Main', 26, 1.6, true);
const main24 = camera('main', 'Main', 24, 1.78, true);
const twoX52 = camera('two_x', '2x Telephoto (Main sensor)', 52, 1.6, true);
const twoX48 = camera('two_x', '2x Telephoto (Main sensor)', 48, 1.78, true);
const tele3x = camera('telephoto_3x', '3x Telephoto', 77, 2.8, true);
const tele5x = camera('telephoto_5x', '5x Telephoto', 120, 2.8, true);
const tele4x = camera('telephoto_4x', '4x Telephoto', 100, 2.8, true);
const tele8x = camera('telephoto_8x', '8x Telephoto', 200, 2.8, true);

// Focal lengths, apertures, and stabilisation are Apple-published 35mm-equivalent values.
// See wiki/sources/iphone-camera-catalog.md for the primary-spec links.
const MODELS: IPhoneModel[] = [
	{ id: 'body_iphone_15', model: 'iPhone 15', cameras: [ultraWide15, main26, twoX52] },
	{ id: 'body_iphone_15_plus', model: 'iPhone 15 Plus', cameras: [ultraWide15, main26, twoX52] },
	{ id: 'body_iphone_15_pro', model: 'iPhone 15 Pro', cameras: [ultraWide, main24, twoX48, tele3x] },
	{ id: 'body_iphone_15_pro_max', model: 'iPhone 15 Pro Max', cameras: [ultraWide, main24, twoX48, tele5x] },
	{ id: 'body_iphone_16', model: 'iPhone 16', cameras: [ultraWide, main26, twoX52] },
	{ id: 'body_iphone_16_plus', model: 'iPhone 16 Plus', cameras: [ultraWide, main26, twoX52] },
	{ id: 'body_iphone_16_pro', model: 'iPhone 16 Pro', cameras: [ultraWide, main24, twoX48, tele5x] },
	{ id: 'body_iphone_16_pro_max', model: 'iPhone 16 Pro Max', cameras: [ultraWide, main24, twoX48, tele5x] },
	{ id: 'body_iphone_17', model: 'iPhone 17', cameras: [ultraWide, main26, twoX52] },
	{ id: 'body_iphone_air', model: 'iPhone Air', cameras: [main26, twoX52] },
	{ id: 'body_iphone_17_pro', model: 'iPhone 17 Pro', cameras: [ultraWide, main24, twoX48, tele4x, tele8x] },
	{ id: 'body_iphone_17_pro_max', model: 'iPhone 17 Pro Max', cameras: [ultraWide, main24, twoX48, tele4x, tele8x] }
];

function bodyForPhone(phone: IPhoneModel): CameraBody {
	return {
		id: phone.id,
		make: 'Apple',
		model: phone.model,
		mount: 'phone-fixed',
		sensor: 'phone',
		// Apple does not publish a consistent physical sensor size. Focal lengths are already 35mm-equiv.
		sensorSizeMm: { w: 9.8, h: 7.3 },
		cropFactor: 1,
		megapixels: 48,
		hasIBIS: false,
		maxShutter: '1/10000',
		minIso: 50,
		maxIso: 6400,
		isPhone: true,
		source: 'catalog'
	};
}

function lensForPhone(phone: IPhoneModel, item: IPhoneCamera): Lens {
	return {
		id: `lens_${phone.id.slice('body_'.length)}_${item.id}`,
		make: 'Apple',
		model: `${phone.model} ${item.label} (${item.focalLengthMm}mm equiv)`,
		mount: 'phone-fixed',
		isPrime: true,
		focalLengthMm: { min: item.focalLengthMm, max: item.focalLengthMm },
		maxAperture: [{ focalLength: item.focalLengthMm, maxAperture: item.maxAperture }],
		hasOIS: item.hasOIS,
		compatibleBodyIds: [phone.id],
		source: 'catalog'
	};
}

export const IPHONE_BODIES = MODELS.map(bodyForPhone);
export const IPHONE_LENSES = MODELS.flatMap((phone) => phone.cameras.map((item) => lensForPhone(phone, item)));
