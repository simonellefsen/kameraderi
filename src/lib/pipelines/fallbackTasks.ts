import { enforceFeasibility, type RigCapabilities } from '$lib/gear/capability';
import { translate, type MessageKey } from '$lib/i18n/messages';
import type { UiKey } from '$lib/i18n/locales';
import type { SessionContext } from '$lib/types/context';
import type { ActiveRig } from '$lib/types/gear';
import type { Difficulty, Task } from '$lib/types/task';
import { uid } from '$lib/utils/id';

type FallbackLight = 'day' | 'golden' | 'twilight' | 'night';

const objectiveKey: Record<FallbackLight, MessageKey> = {
	day: 'fallback.dayObjective',
	golden: 'fallback.goldenObjective',
	twilight: 'fallback.twilightObjective',
	night: 'fallback.nightObjective'
};

function templateFor(context: SessionContext): FallbackLight {
	switch (context.light.phase) {
		case 'golden-hour':
			return 'golden';
		case 'night':
			return 'night';
		case 'astronomical-twilight':
		case 'nautical-twilight':
		case 'blue-hour':
		case 'civil-twilight':
			return 'twilight';
		default:
			return 'day';
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Build a deliberately small, local-only practice brief. It receives the same rig capabilities as
 * LLM output and is passed through enforceFeasibility before it can reach the session UI.
 */
export function createFallbackTask(
	rig: ActiveRig,
	cap: RigCapabilities,
	context: SessionContext,
	ui: UiKey,
	difficulty: Difficulty
): Task {
	const light = templateFor(context);
	const lowLight = light === 'twilight' || light === 'night';
	const weatherNeedsMoreLight = context.weather.cloudCoverPct >= 70 || context.weather.precipitationMm > 0;
	const baseIso = lowLight ? 800 : weatherNeedsMoreLight ? 400 : 100;
	const iso = clamp(baseIso, cap.body.minIso, cap.body.maxIso);
	const aperture = cap.fastestAperture ?? 5.6;
	const focalLengthTarget = cap.focalRangeMm.min;

	const task: Task = {
		id: uid('task'),
		createdAt: Date.now(),
		objective: translate(ui, objectiveKey[light]),
		techniqueTags: ['local-practice', light],
		constraints: {
			focalLengthTarget,
			apertureTarget: aperture,
			isoMax: cap.body.maxIso,
			compositionalRule: translate(ui, 'fallback.composition')
		},
		suggestedExposure: {
			aperture,
			shutter: lowLight ? '1/60' : '1/250',
			iso,
			note: translate(ui, lowLight ? 'fallback.exposureLowLight' : 'fallback.exposureDay')
		},
		successCriteria: [translate(ui, 'fallback.success')],
		coachingHints: [translate(ui, 'fallback.hint')],
		difficulty,
		context,
		rig,
		generationSource: 'fallback'
	};

	return enforceFeasibility(task, cap);
}
