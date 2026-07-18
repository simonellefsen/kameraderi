import { browser } from '$app/environment';
import { db, type PendingEvaluation } from '$lib/db/schema';
import { getPhoto } from '$lib/db/photos';
import { evaluateSubmission } from '$lib/pipelines/evaluation';
import { blobToBase64 } from '$lib/media/downscale';
import { settings } from '$lib/stores/settings.svelte';
import { uid } from '$lib/utils/id';
import type { Evaluation } from '$lib/types/evaluation';
import type { CoachingSession } from '$lib/types/session';
import type { Submission } from '$lib/types/submission';
import type { Task } from '$lib/types/task';

export const PENDING_EVALUATION_COMPLETE = 'kameraderi:pending-evaluation-complete';

export interface PendingEvaluationComplete {
	submissionId: string;
	evaluation: Evaluation;
}

let processing: Promise<void> | undefined;

/** True only in a browser which explicitly reports that it is currently offline. */
export function isOffline(): boolean {
	return browser && !navigator.onLine;
}

/**
 * Persist the work required to evaluate an already-downscaled submission. The queue is keyed by
 * submission id, so repeat calls are idempotent and never duplicate a provider request.
 */
export async function queueEvaluation(task: Task, submission: Submission): Promise<PendingEvaluation> {
	const sessionId = uid('sess');
	let pending: PendingEvaluation = {
		submissionId: submission.id,
		taskId: task.id,
		sessionId,
		queuedAt: Date.now(),
		provider: settings.current.activeProvider,
		visionModel: settings.active.visionModel,
		attempts: 0
	};
	const coaching: CoachingSession = {
		id: sessionId,
		startedAt: task.createdAt,
		rig: task.rig,
		context: task.context,
		taskId: task.id,
		submissionId: submission.id
	};

	await db().transaction(
		'rw',
		db().tasks,
		db().submissions,
		db().sessions,
		db().pendingEvaluations,
		async () => {
			const existing = await db().pendingEvaluations.get(submission.id);
			if (existing) {
				pending = existing;
				return;
			}
			await db().tasks.put(task);
			await db().submissions.put(submission);
			await db().sessions.put(coaching);
			await db().pendingEvaluations.put(pending);
		}
	);
	return pending;
}

/** Process saved evaluations oldest-first while the app is open and the browser is online. */
export function processPendingEvaluations(): Promise<void> {
	if (!browser || !navigator.onLine) return Promise.resolve();
	if (!processing) processing = drainPendingEvaluations().finally(() => (processing = undefined));
	return processing;
}

async function drainPendingEvaluations(): Promise<void> {
	const pending = await db().pendingEvaluations.orderBy('queuedAt').toArray();
	for (const item of pending) {
		if (!navigator.onLine) return;
		const [task, submission] = await Promise.all([
			db().tasks.get(item.taskId),
			db().submissions.get(item.submissionId)
		]);
		const photo = submission ? await getPhoto(submission.photoBlobKey) : undefined;
		if (!task || !submission || !photo) {
			await db().pendingEvaluations.update(item.submissionId, {
				attempts: item.attempts + 1,
				lastError: 'The saved task, submission, or photo could not be found.'
			});
			continue;
		}

		const result = await evaluateSubmission({
			task,
			photo: {
				blob: photo,
				base64: await blobToBase64(photo),
				width: 0,
				height: 0,
				mediaType: 'image/jpeg'
			},
			exif: submission.exif,
			submissionId: submission.id,
			providerKey: item.provider,
			visionModel: item.visionModel
		});
		if (!result.ok) {
			await db().pendingEvaluations.update(item.submissionId, {
				attempts: item.attempts + 1,
				lastError: result.error
			});
			continue;
		}

		await db().transaction('rw', db().evaluations, db().sessions, db().pendingEvaluations, async () => {
			await db().evaluations.put(result.value);
			await db().sessions.update(item.sessionId, {
				endedAt: Date.now(),
				evaluationId: result.value.id
			});
			await db().pendingEvaluations.delete(item.submissionId);
		});
		window.dispatchEvent(
			new CustomEvent<PendingEvaluationComplete>(PENDING_EVALUATION_COMPLETE, {
				detail: { submissionId: item.submissionId, evaluation: result.value }
			})
		);
	}
}
