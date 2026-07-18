import { describe, expect, it } from 'vitest';
import { rigCapabilities } from '$lib/gear/capability';
import type { SessionContext } from '$lib/types/context';
import type { CameraBody, Lens } from '$lib/types/gear';
import { createFallbackTask } from './fallbackTasks';

const body: CameraBody = {
	id: 'body',
	make: 'Test',
	model: 'Camera',
	mount: 'test',
	sensor: 'full-frame',
	sensorSizeMm: { w: 36, h: 24 },
	cropFactor: 1,
	megapixels: 24,
	hasIBIS: false,
	maxShutter: '1/8000',
	minIso: 100,
	maxIso: 640,
	isPhone: false,
	source: 'catalog'
};

const lens: Lens = {
	id: 'lens',
	make: 'Test',
	model: '24-70mm f/4',
	mount: 'test',
	isPrime: false,
	focalLengthMm: { min: 24, max: 70 },
	maxAperture: [{ focalLength: 24, maxAperture: 4 }],
	hasOIS: false,
	source: 'catalog'
};

function context(phase: SessionContext['light']['phase'], cloudCoverPct = 0): SessionContext {
	return {
		location: { lat: 55.7, lon: 12.6, accuracyM: 10 },
		weather: {
			tempC: 15,
			cloudCoverPct,
			precipitationMm: 0,
			windKph: 5,
			conditions: 'Clear',
			uvIndex: 2
		},
		light: { phase, sunElevationDeg: 20, minutesUntilChange: 30, label: phase }
	};
}

describe('createFallbackTask', () => {
	it('marks the brief as local and keeps the chosen rig feasible', () => {
		const task = createFallbackTask(
			{ bodyId: body.id, lensId: lens.id },
			rigCapabilities(body, lens),
			context('day'),
			'en',
			'beginner'
		);

		expect(task.generationSource).toBe('fallback');
		expect(task.objective).toContain('foreground');
		expect(task.constraints.focalLengthTarget).toBe(24);
		expect(task.constraints.apertureTarget).toBe(4);
		expect(task.suggestedExposure.aperture).toBe(4);
		expect(task.suggestedExposure.iso).toBe(100);
	});

	it('uses a low-light brief and clamps its ISO to the body limit', () => {
		const task = createFallbackTask(
			{ bodyId: body.id, lensId: lens.id },
			rigCapabilities(body, lens),
			context('night', 100),
			'en',
			'intermediate'
		);

		expect(task.objective).toContain('bright subject');
		expect(task.suggestedExposure.shutter).toBe('1/60');
		expect(task.suggestedExposure.iso).toBe(640);
		expect(task.suggestedExposure.note).toContain('Hold steady');
	});
});
