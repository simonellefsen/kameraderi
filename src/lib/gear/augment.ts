import { activeProvider } from '$lib/llm/registry';
import { zodToJsonSchema } from '$lib/llm/structured';
import type { ChatMessage } from '$lib/llm/provider';
import { settings } from '$lib/stores/settings.svelte';
import { getCacheEntry, setCacheEntry } from '$lib/cache/aiCache';
import { gearFullKey } from '$lib/cache/aiCacheKey';
import type { CameraBody, Lens, SensorFormat } from '$lib/types/gear';
import type { Result } from '$lib/utils/result';
import { err, ok } from '$lib/utils/result';
import { uid } from '$lib/utils/id';
import { z } from 'zod';

/** Gear specs are deterministic by make+model — cache far longer than task generation (30 days). */
const GEAR_CACHE_TTL_HOURS = 24 * 30;

const apertureStepSchema = z.object({
	focalLength: z.number(),
	maxAperture: z.number()
});

const lensSpecSchema = z.object({
	make: z.string(),
	model: z.string(),
	mount: z.string(),
	isPrime: z.boolean(),
	focalLengthMin: z.number(),
	focalLengthMax: z.number(),
	maxApertureSteps: z.array(apertureStepSchema).min(1),
	hasOIS: z.boolean(),
	filterThreadMm: z.number().optional()
});

const bodySpecSchema = z.object({
	make: z.string(),
	model: z.string(),
	mount: z.string(),
	sensor: z.enum([
		'full-frame',
		'aps-c',
		'm4/3',
		'1-inch',
		'phone',
		'medium-format'
	]),
	cropFactor: z.number(),
	megapixels: z.number(),
	hasIBIS: z.boolean(),
	maxShutter: z.string(),
	minIso: z.number(),
	maxIso: z.number(),
	isPhone: z.boolean()
});

const LENS_SYSTEM =
	'You are an expert photography gear database. Return accurate, real-world specifications for the requested lens. ' +
	'For variable-aperture zooms, provide maxApertureSteps at the short and long ends (and any midpoint). ' +
	'mount is lowercase (rf, ef, e, fe, z, m43). If genuinely uncertain, give your best estimate.';

const BODY_SYSTEM =
	'You are an expert photography gear database. Return accurate, real-world specifications for the requested camera body. ' +
	'mount is lowercase (rf, ef, e, fe, z, m43, phone-fixed). isPhone is true only for smartphones.';

/**
 * Run a structured gear-spec lookup, checking the (long-TTL, deterministic-by-name) cache
 * first. A defensive re-validation on cache hits guards against a schema shape change between
 * app versions — a stale entry is treated as a miss and refetched.
 */
async function runCachedStructured<T>(
	kind: 'gearLens' | 'gearBody',
	make: string,
	model: string,
	system: string,
	prompt: string,
	schemaName: string,
	zodSchema: z.ZodType<T>
): Promise<T> {
	const provider = activeProvider();
	const modelId = settings.active.textModel;
	const key = await gearFullKey(kind, provider.id, modelId, make, model);

	const cached = await getCacheEntry<T>(key);
	const cachedValid = cached ? zodSchema.safeParse(cached) : undefined;
	if (cachedValid?.success) return cachedValid.data;

	const messages: ChatMessage[] = [
		{ role: 'system', content: system },
		{ role: 'user', content: prompt }
	];
	const { json, usage } = await provider.generateStructured({
		messages,
		schema: zodToJsonSchema(zodSchema),
		schemaName
	});
	const parsed = zodSchema.parse(json);
	await setCacheEntry(key, kind, provider.id, modelId, parsed, usage, GEAR_CACHE_TTL_HOURS);
	return parsed;
}

/** Ask the LLM to fill in specs for a lens not in the catalog. Result is marked llm-augmented. */
export async function augmentLens(make: string, model: string): Promise<Result<Lens, string>> {
	try {
		const p = await runCachedStructured(
			'gearLens',
			make,
			model,
			LENS_SYSTEM,
			`Lens: ${make} ${model}. Return its specifications.`,
			'lens_specs',
			lensSpecSchema
		);
		const lens: Lens = {
			id: uid('lens'),
			make: p.make,
			model: p.model,
			mount: p.mount.toLowerCase(),
			isPrime: p.isPrime,
			focalLengthMm: { min: p.focalLengthMin, max: p.focalLengthMax },
			maxAperture: p.maxApertureSteps.map((s) => ({ focalLength: s.focalLength, maxAperture: s.maxAperture })),
			hasOIS: p.hasOIS,
			filterThreadMm: p.filterThreadMm,
			source: 'llm-augmented'
		};
		return ok(lens);
	} catch (e) {
		return err(e instanceof Error ? e.message : String(e));
	}
}

/** Ask the LLM to fill in specs for a camera body not in the catalog. Result is marked llm-augmented. */
export async function augmentBody(make: string, model: string): Promise<Result<CameraBody, string>> {
	try {
		const p = await runCachedStructured(
			'gearBody',
			make,
			model,
			BODY_SYSTEM,
			`Camera body: ${make} ${model}. Return its specifications.`,
			'body_specs',
			bodySpecSchema
		);
		const body: CameraBody = {
			id: uid('body'),
			make: p.make,
			model: p.model,
			mount: p.mount.toLowerCase(),
			sensor: p.sensor as SensorFormat,
			sensorSizeMm: { w: 36, h: 24 },
			cropFactor: p.cropFactor,
			megapixels: p.megapixels,
			hasIBIS: p.hasIBIS,
			maxShutter: p.maxShutter,
			minIso: p.minIso,
			maxIso: p.maxIso,
			isPhone: p.isPhone,
			source: 'llm-augmented'
		};
		return ok(body);
	} catch (e) {
		return err(e instanceof Error ? e.message : String(e));
	}
}
