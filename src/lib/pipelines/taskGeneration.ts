import type { ChatMessage } from '$lib/llm/provider';
import { activeProvider } from '$lib/llm/registry';
import { zodToJsonSchema } from '$lib/llm/structured';
import { gatherContext } from '$lib/context';
import { enforceFeasibility, resolveRig, rigCapabilities } from '$lib/gear/capability';
import { getBody, getLens } from '$lib/gear/catalog';
import { settings } from '$lib/stores/settings.svelte';
import { localeMeta, uiKeyFor } from '$lib/i18n/locales';
import { getCacheEntry, resolveVariant, setCacheEntry } from '$lib/cache/aiCache';
import { taskBaseKey, taskFullKey } from '$lib/cache/aiCacheKey';
import { recordUsage } from '$lib/usage/usageMeter';
import type { NearbyPlace, SessionContext } from '$lib/types/context';
import type { ActiveRig } from '$lib/types/gear';
import type { Task, TaskDestination } from '$lib/types/task';
import { errorMessage, err, ok, type Result } from '$lib/utils/result';
import { findMentionedPlace } from '$lib/utils/maps';
import { uid } from '$lib/utils/id';
import { taskSystemPrompt, buildTaskUserPrompt } from './prompts/taskSystem';
import { taskOutputSchema, type TaskOutput } from './schemas';
import { createFallbackTask } from './fallbackTasks';

export interface GenerateTaskOptions {
	/** Reuse already-gathered context (e.g. when re-rolling for a chosen place) instead of re-fetching. */
	context?: SessionContext;
	/** A nearby place the user explicitly chose — the task is centred on it. */
	focusPlace?: NearbyPlace;
	/**
	 * Explicitly request a different result than any cached one for this context ("New task",
	 * re-rolling the same place). Bumps the cache's variant counter; a plain repeat of the same
	 * request (retry after an error, duplicate click) reuses the last cached variant instead.
	 */
	forceNewVariant?: boolean;
}

/**
 * Gather context for here-and-now, then ask the LLM to design a single task that is
 * feasible with the mounted rig. The result is clamped by enforceFeasibility as insurance
 * against the model requesting impossible settings.
 */
export async function generateTask(
	rig: ActiveRig,
	opts: GenerateTaskOptions = {}
): Promise<Result<Task, string>> {
	const locale = settings.current.locale;
	const ui = uiKeyFor(locale);
	const languageName = localeMeta(locale).languageName;

	let context = opts.context;
	if (!context) {
		try {
			context = await gatherContext(new Date(), ui);
		} catch (e) {
			return err(`Could not determine your location: ${errorMessage(e)}`);
		}
	}

	let body;
	let lens;
	try {
		const resolved = await resolveRig(rig, getBody, getLens);
		body = resolved.body;
		lens = resolved.lens;
	} catch (e) {
		return err(errorMessage(e));
	}
	const cap = rigCapabilities(body, lens);
	const fallbackTask = () => {
		const task = createFallbackTask(rig, cap, context, ui, settings.current.skillLevel);
		const destination: TaskDestination | undefined = opts.focusPlace
			? { name: opts.focusPlace.name, lat: opts.focusPlace.lat, lon: opts.focusPlace.lon }
			: undefined;
		return ok(destination ? { ...task, destination } : task);
	};

	// A useful practice brief must not depend on credentials or a connection. Unlike a cached LLM
	// result, it is intentionally not persisted in the AI cache and costs no provider tokens.
	if (!settings.active.apiKey || (typeof navigator !== 'undefined' && !navigator.onLine)) {
		return fallbackTask();
	}

	const messages: ChatMessage[] = [
		{ role: 'system', content: taskSystemPrompt(languageName) },
		{
			role: 'user',
			content: buildTaskUserPrompt({
				context,
				cap,
				skill: settings.current.skillLevel,
				languageName,
				focusPlace: opts.focusPlace
			})
		}
	];
	const schema = zodToJsonSchema(taskOutputSchema);
	const provider = activeProvider();
	const modelId = settings.active.textModel;

	// Cache lookup: same context/rig/skill/locale (coarsened) reuses a prior result for free,
	// unless the caller explicitly wants a different one ("New task", re-rolling the same place).
	const baseKey = await taskBaseKey({
		provider: provider.id,
		model: modelId,
		locale,
		skill: settings.current.skillLevel,
		bodyId: rig.bodyId,
		lensId: rig.lensId,
		context,
		focusPlace: opts.focusPlace
	});
	const variant = await resolveVariant(baseKey, opts.forceNewVariant ?? false);
	const fullKey = await taskFullKey(baseKey, variant);

	const cached = await getCacheEntry<TaskOutput>(fullKey);
	// Defensive re-validation: guards against a schema shape change between app versions.
	const cachedValid = cached ? taskOutputSchema.safeParse(cached) : undefined;

	let output: TaskOutput;
	if (cachedValid?.success) {
		output = cachedValid.data;
	} else {
		let usage: { inputTokens?: number; outputTokens?: number } | undefined;
		try {
			const first = await provider.generateStructured({
				messages,
				schema,
				schemaName: 'photo_task',
				temperature: 0.8
			});
			void recordUsage('task', provider.id, modelId, first.usage).catch((e) =>
				console.warn('Could not record task token usage', e)
			);
			const r = taskOutputSchema.safeParse(first.json);
			usage = first.usage;
			if (r.success) {
				output = r.data;
			} else {
				const retry = await provider.generateStructured({
					messages: [
						...messages,
						{
							role: 'user',
							content: `Your previous output failed schema validation: ${r.error.message}. Return valid JSON matching the schema.`
						}
					],
					schema,
					schemaName: 'photo_task',
					temperature: 0.4
				});
				void recordUsage('task', provider.id, modelId, retry.usage).catch((e) =>
					console.warn('Could not record task token usage', e)
				);
				usage = retry.usage;
				const r2 = taskOutputSchema.safeParse(retry.json);
				if (!r2.success) return err(`The model's task output was invalid: ${r2.error.message}`);
				output = r2.data;
			}
		} catch (e) {
			if (typeof navigator !== 'undefined' && !navigator.onLine) return fallbackTask();
			return err(`Task generation failed: ${errorMessage(e)}`);
		}
		await setCacheEntry(fullKey, 'task', provider.id, modelId, output, usage, settings.current.aiCacheTtlHours);
	}

	// Prefer the explicitly chosen place; otherwise detect one the model named in the objective.
	const destPlace = opts.focusPlace ?? findMentionedPlace(output.objective, context.location.nearby);
	const destination: TaskDestination | undefined = destPlace
		? { name: destPlace.name, lat: destPlace.lat, lon: destPlace.lon }
		: undefined;

	const task: Task = {
		id: uid('task'),
		createdAt: Date.now(),
		objective: output.objective,
		techniqueTags: output.techniqueTags,
		constraints: output.constraints,
		suggestedExposure: output.suggestedExposure,
		successCriteria: output.successCriteria,
		coachingHints: output.coachingHints,
		difficulty: output.difficulty,
		cameraSetup: output.cameraSetup,
		context,
		rig,
		destination
	};

	return ok(enforceFeasibility(task, cap));
}
