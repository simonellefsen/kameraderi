import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const database = {
		tasks: { put: vi.fn() },
		submissions: { put: vi.fn() },
		sessions: { put: vi.fn() },
		pendingEvaluations: { get: vi.fn(), put: vi.fn() }
	};
	return {
		database,
		transaction: vi.fn(async (_mode: string, ...args: unknown[]) => {
			const callback = args.at(-1) as () => Promise<void>;
			return callback();
		})
	};
});

vi.mock('$lib/db/schema', () => ({
	db: () => ({ ...mocks.database, transaction: mocks.transaction })
}));
vi.mock('$lib/stores/settings.svelte', () => ({
	settings: {
		current: { activeProvider: 'openrouter' },
		active: { visionModel: 'openai/gpt-4o' }
	}
}));
vi.mock('$lib/utils/id', () => ({ uid: vi.fn(() => 'sess_queued') }));

import { queueEvaluation } from './pendingEvaluations';
import type { Submission } from '$lib/types/submission';
import type { Task } from '$lib/types/task';

describe('queueEvaluation', () => {
	function resetMocks() {
		mocks.transaction.mockClear();
		mocks.database.tasks.put.mockClear();
		mocks.database.submissions.put.mockClear();
		mocks.database.sessions.put.mockClear();
		mocks.database.pendingEvaluations.get.mockReset();
		mocks.database.pendingEvaluations.put.mockClear();
	}

	it('atomically saves the task, submission, unfinished session, and provider/model choice', async () => {
		resetMocks();
		const task = { id: 'task_1', createdAt: 1, rig: { bodyId: 'body_1', lensId: 'lens_1' }, context: {} } as Task;
		const submission = { id: 'sub_1', photoBlobKey: 'photo_1' } as Submission;

		const pending = await queueEvaluation(task, submission);

		expect(mocks.transaction).toHaveBeenCalledOnce();
		expect(mocks.database.tasks.put).toHaveBeenCalledWith(task);
		expect(mocks.database.submissions.put).toHaveBeenCalledWith(submission);
		expect(mocks.database.sessions.put).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'sess_queued', taskId: 'task_1', submissionId: 'sub_1' })
		);
		expect(mocks.database.pendingEvaluations.put).toHaveBeenCalledWith(
			expect.objectContaining({
				submissionId: 'sub_1',
				taskId: 'task_1',
				provider: 'openrouter',
				visionModel: 'openai/gpt-4o',
				attempts: 0
			})
		);
		expect(pending.sessionId).toBe('sess_queued');
	});

	it('reuses an existing queue entry for the same submission', async () => {
		resetMocks();
		const existing = {
			submissionId: 'sub_1',
			taskId: 'task_old',
			sessionId: 'sess_old',
			queuedAt: 1,
			provider: 'openrouter' as const,
			visionModel: 'openai/gpt-4o',
			attempts: 2
		};
		mocks.database.pendingEvaluations.get.mockResolvedValue(existing);

		const pending = await queueEvaluation({ id: 'task_1' } as Task, { id: 'sub_1' } as Submission);

		expect(pending).toBe(existing);
		expect(mocks.database.tasks.put).not.toHaveBeenCalled();
		expect(mocks.database.pendingEvaluations.put).not.toHaveBeenCalled();
	});
});
