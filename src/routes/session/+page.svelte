<script lang="ts">
	import { onMount } from 'svelte';
	import { session } from '$lib/stores/session.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { generateTask } from '$lib/pipelines/taskGeneration';
	import { evaluateSubmission } from '$lib/pipelines/evaluation';
	import { parseExif } from '$lib/media/exif';
	import { downscaleToJpeg, makeThumbnailDataUrl } from '$lib/media/downscale';
	import { capturePhoto } from '$lib/media/capture';
	import { pickImageViaInput } from '$lib/media/filepick';
	import { putPhoto } from '$lib/db/photos';
	import { db } from '$lib/db/schema';
	import { allBodies, allLenses } from '$lib/gear/catalog';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { distanceMeters } from '$lib/context';
	import { errorMessage } from '$lib/utils/result';
	import { formatShutter } from '$lib/utils/focal';
	import { mapsUrl, linkifyDestination } from '$lib/utils/maps';
	import { difficultyLabel, motionLabel, t } from '$lib/i18n';
	import { uid } from '$lib/utils/id';
	import {
		isOffline,
		PENDING_EVALUATION_COMPLETE,
		queueEvaluation,
		type PendingEvaluationComplete
	} from '$lib/queue/pendingEvaluations';
	import { PROVIDERS } from '$lib/llm/providers';
	import type { NearbyPlace } from '$lib/types/context';
	import type { CoachingSession } from '$lib/types/session';
	import type { Submission } from '$lib/types/submission';
	import type { Task } from '$lib/types/task';

	const PROJECT_INDIGO_URL = 'https://apps.apple.com/us/app/project-indigo/id6742591546';

	const bodies = useLiveQuery(() => allBodies());
	const lenses = useLiveQuery(() => allLenses());
	const activeBody = $derived(
		bodies.value?.find((b) => b.id === settings.current.activeRig?.bodyId)
	);
	const activeLens = $derived(
		lenses.value?.find((l) => l.id === settings.current.activeRig?.lensId)
	);
	const hasKey = $derived(!!settings.active.apiKey);
	const hasRig = $derived(!!settings.current.activeRig);

	// Which nearby place the current task is focused on, and whether we're re-rolling for it.
	let selectedPlaceName = $state<string | null>(null);
	let rerolling = $state(false);

	// Resume an in-progress session after a reload; only when nothing is loaded yet
	// (the store is a singleton, so client-side nav keeps state without a restore).
	onMount(() => {
		if (session.phase === 'idle') session.restore();
		const onPendingEvaluationComplete = (event: Event) => {
			const { detail } = event as CustomEvent<PendingEvaluationComplete>;
			if (session.submission?.id !== detail.submissionId) return;
			session.evaluation = detail.evaluation;
			session.phase = 'done';
		};
		window.addEventListener(PENDING_EVALUATION_COMPLETE, onPendingEvaluationComplete);
		return () => window.removeEventListener(PENDING_EVALUATION_COMPLETE, onPendingEvaluationComplete);
	});
	// Persist on every meaningful change (save() reads the reactive fields, so this re-runs).
	$effect(() => {
		session.save();
	});

	function constraintList(task: Task): string[] {
		const c = task.constraints;
		const items: string[] = [];
		if (c.focalLengthTarget != null) {
			items.push(
				typeof c.focalLengthTarget === 'number'
					? t('constraint.focalExact', { n: c.focalLengthTarget })
					: t('constraint.focalRange', { min: c.focalLengthTarget.min, max: c.focalLengthTarget.max })
			);
		}
		if (c.apertureTarget != null) items.push(t('constraint.aperture', { n: c.apertureTarget }));
		if (c.isoMax != null) items.push(t('constraint.iso', { n: c.isoMax }));
		if (c.minShutterForHandheld)
			items.push(t('constraint.handhold', { s: c.minShutterForHandheld }));
		if (c.motionType) items.push(t('constraint.motion', { x: motionLabel(c.motionType) }));
		items.push(t('constraint.composition', { rule: c.compositionalRule }));
		return items;
	}

	function scoreColor(score: number): string {
		return score >= 75 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
	}

	async function start() {
		if (!hasRig) {
			session.error = t('session.errorNoCamera');
			return;
		}
		// A prior task in this session means the user is explicitly asking for something
		// different ("New task"), not the first pull — bump the cache's variant counter.
		const forceNewVariant = session.task !== null;
		session.reset();
		selectedPlaceName = null;
		session.phase = 'gathering';
		const res = await generateTask(settings.current.activeRig!, { forceNewVariant });
		if (!res.ok) {
			session.error = res.error;
			session.phase = 'idle';
			return;
		}
		session.task = res.value;
		session.context = res.value.context;
		session.phase = 'task';
	}

	// Re-design the task around a nearby place the user tapped, reusing the gathered context.
	async function focusOn(place: NearbyPlace) {
		if (!settings.current.activeRig || !session.context || rerolling) return;
		// Re-tapping the already-selected place means "give me another one for this spot".
		const forceNewVariant = selectedPlaceName === place.name;
		selectedPlaceName = place.name;
		rerolling = true;
		session.error = null;
		const res = await generateTask(settings.current.activeRig, {
			context: session.context,
			focusPlace: place,
			forceNewVariant
		});
		rerolling = false;
		if (!res.ok) {
			session.error = res.error;
			return;
		}
		session.task = res.value;
	}

	async function submit(source: 'capture' | 'pick') {
		if (!session.task) return;
		const outcome = source === 'capture' ? await capturePhoto() : await pickImageViaInput();
		if (outcome.error) {
			session.error = outcome.error;
			return;
		}
		if (!outcome.file) return; // cancelled
		session.phase = 'submitting';
		session.error = null;
		try {
			// Snapshot the reactive task to a plain object: IndexedDB's structured clone
			// throws DataCloneError on Svelte $state proxies.
			const task = $state.snapshot(session.task) as Task;
			const file = outcome.file;
			const exif = await parseExif(file);

			const photo = await downscaleToJpeg(file);
			const thumbnail = await makeThumbnailDataUrl(file);
			const photoKey = await putPhoto(photo.blob);
			const submissionId = uid('sub');
			const geoMismatchMeters = exif.gps
				? Math.round(distanceMeters(exif.gps, task.context.location))
				: undefined;
			const submission: Submission = {
				id: submissionId,
				taskId: task.id,
				createdAt: Date.now(),
				photoBlobKey: photoKey,
				thumbnailDataUrl: thumbnail,
				exif,
				source: source === 'capture' ? 'phone-capture' : 'file-upload',
				geoMismatchMeters
			};
			await db().submissions.put(submission);
			session.submission = submission;
			if (isOffline()) {
				if (!PROVIDERS[settings.current.activeProvider].supportsVision) {
					session.error = `The active provider (${settings.current.activeProvider}) does not support image input.`;
					session.phase = 'task';
					return;
				}
				await queueEvaluation(task, submission);
				session.phase = 'queued';
				return;
			}
			session.phase = 'evaluating';
			const res = await evaluateSubmission({
				task,
				photo,
				exif,
				submissionId
			});
			if (!res.ok) {
				if (isOffline()) {
					await queueEvaluation(task, submission);
					session.phase = 'queued';
					return;
				}
				session.error = res.error;
				session.phase = 'task';
				return;
			}
			await db().evaluations.put(res.value);
			await db().tasks.put(task);
			const coaching: CoachingSession = {
				id: uid('sess'),
				startedAt: task.createdAt,
				endedAt: Date.now(),
				rig: task.rig,
				context: task.context,
				taskId: task.id,
				submissionId: submission.id,
				evaluationId: res.value.id
			};
			await db().sessions.put(coaching);
			session.evaluation = res.value;
			session.phase = 'done';
		} catch (e) {
			session.error = errorMessage(e);
			session.phase = 'task';
		}
	}
</script>

<h1 style="margin-bottom: 12px;">{t('session.title')}</h1>

{#if session.error}
	<div class="error" style="margin-bottom: 12px;">{session.error}</div>
{/if}

{#if session.phase === 'idle'}
	<div class="card">
		<h3>{t('session.shootingWith')}</h3>
		{#if activeBody}
			<p>
				<strong>{activeBody.make} {activeBody.model}</strong><br />
				{#if activeLens}<span class="muted">{activeLens.make} {activeLens.model}</span>{/if}
			</p>
		{:else}
			<p class="muted">{t('session.noCamera')}</p>
		{/if}
		{#if !hasKey}
			<div class="note">{t('session.noKeyFallbackStart')} <a href="/settings">{t('nav.setup')}</a> {t('session.noKeyFallbackEnd')}</div>
		{/if}
		<button class="btn btn-primary btn-block" onclick={start} disabled={!hasRig}>
			{t('session.generateTask')}
		</button>
	</div>
{:else if session.phase === 'gathering'}
	<div class="card row">
		<span class="spinner"></span>
		<span>{t('session.gathering')}</span>
	</div>
{:else if session.task}
	<!-- Context card -->
	{#if session.context}
		<div class="card">
			<div class="row">
				<strong>{session.context.light.label}</strong>
				<div class="spacer"></div>
				<span class="badge">{session.context.weather.conditions}</span>
			</div>
			<p class="muted" style="margin: 4px 0;">
				{[
					session.context.location.street,
					session.context.location.neighbourhood,
					session.context.location.name,
					session.context.location.country
				].filter(Boolean).join(', ') || t('common.unknownLocation')}
			</p>
			<div class="muted" style="font-size: 0.85rem;">
				{t('session.weatherSummary', {
					temp: session.context.weather.tempC,
					cloud: session.context.weather.cloudCoverPct,
					wind: session.context.weather.windKph
				})}
			</div>
			{#if (session.context.location.nearby ?? []).length}
				<div style="margin-top: 10px;">
					<div class="muted" style="font-size: 0.75rem; margin-bottom: 6px;">
						{t('session.tapPlace')}
					</div>
					<div class="chips">
						{#each (session.context.location.nearby ?? []).slice(0, 8) as place (place.name)}
							<button
								class="chip"
								class:active={selectedPlaceName === place.name}
								disabled={rerolling || session.busy}
								onclick={() => focusOn(place)}
							>{place.name}</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if session.phase === 'queued'}
		<div class="note">{t('session.evaluationQueued')}</div>
	{:else if session.phase === 'submitting' || session.phase === 'evaluating'}
		<div class="card row">
			<span class="spinner"></span>
			<span>{session.phase === 'submitting' ? t('session.preparing') : t('session.critiquing')}</span>
		</div>
	{:else if rerolling}
		<div class="card row">
			<span class="spinner"></span>
			<span>{t('session.designingAround', { name: selectedPlaceName ?? '' })}</span>
		</div>
	{:else}
		{@const dest = session.task.destination}
		{@const loc = session.task.context.location}
		<!-- Task card -->
		<div class="card">
			{#if session.task.generationSource === 'fallback'}
				<div class="note" style="margin: 0 0 10px;">{t('session.localBrief')}</div>
			{/if}
			<div class="chips" style="margin-bottom: 10px;">
				<span class="chip chip-diff {session.task.difficulty}">{difficultyLabel(session.task.difficulty)}</span>
				{#each session.task.techniqueTags as tag}
					<span class="chip chip-tag">{tag}</span>
				{/each}
			</div>

			<h2 style="margin-bottom: 6px;">
				{#if dest}
					{@const parts = linkifyDestination(session.task.objective, dest.name)}
					{#if parts}{parts.before}<a
							class="dest-link"
							href={mapsUrl(dest, loc)}
							target="_blank"
							rel="noopener">{parts.match}</a>{parts.after}{:else}{session.task.objective}{/if}
				{:else}
					{session.task.objective}
				{/if}
			</h2>
			{#if dest}
				<a class="maps-link" href={mapsUrl(dest, loc)} target="_blank" rel="noopener">
					{t('session.openInMaps', { name: dest.name })}
				</a>
			{/if}

			<h3>{t('session.brief')}</h3>
			<ul style="margin: 0; padding-left: 18px;">
				{#each constraintList(session.task) as item}
					<li>{item}</li>
				{/each}
			</ul>

			{#if session.task.cameraSetup}
				<h3>{t('session.onYourCamera')}</h3>
				<div class="chips" style="margin-bottom: 6px;">
					<span class="chip chip-tag">🎛️ {session.task.cameraSetup.mode}</span>
				</div>
				<p class="muted" style="font-size: 0.85rem; margin: 0 0 6px;">
					{session.task.cameraSetup.rationale}
				</p>
				{#if session.task.cameraSetup.steps.length}
					<ol style="margin: 0; padding-left: 18px;">
						{#each session.task.cameraSetup.steps as step}
							<li>{step}</li>
						{/each}
					</ol>
				{/if}
			{/if}

			<h3>{t('session.suggestedStart')}</h3>
			<div class="row" style="flex-wrap: wrap;">
				<span class="pill">f/{session.task.suggestedExposure.aperture}</span>
				<span class="pill">{session.task.suggestedExposure.shutter}</span>
				<span class="pill">ISO {session.task.suggestedExposure.iso}</span>
			</div>
			{#if session.task.suggestedExposure.note}
				<p class="muted" style="font-size: 0.85rem;">{session.task.suggestedExposure.note}</p>
			{/if}

			{#if session.task.successCriteria.length}
				<h3>{t('session.successCriteria')}</h3>
				<ul style="margin: 0; padding-left: 18px;">
					{#each session.task.successCriteria as s}
						<li>{s}</li>
					{/each}
				</ul>
			{/if}

			{#if session.task.coachingHints.length}
				<h3>{t('session.coachingTips')}</h3>
				<ul style="margin: 0; padding-left: 18px; color: var(--muted);">
					{#each session.task.coachingHints as h}
						<li>{h}</li>
					{/each}
				</ul>
			{/if}

			<div style="margin-top: 14px;">
				{#if activeBody?.isPhone && activeBody.make === 'Apple'}
					<div class="note" style="margin-bottom: 10px;">
						<strong>{t('session.projectIndigoTitle')}</strong>
						<p>
							{t('session.projectIndigoBefore')}<a href={PROJECT_INDIGO_URL} target="_blank" rel="noopener">Project Indigo ↗</a>{t('session.projectIndigoAfter')}
						</p>
					</div>
				{/if}
				<button class="btn btn-primary btn-block" onclick={() => submit('capture')}>
					{t('session.captureSubmit')}
				</button>
				<button class="btn btn-ghost btn-block" style="margin-top: 8px;" onclick={() => submit('pick')}>
					{t('session.uploadRoll')}
				</button>
				<button class="btn btn-ghost btn-block" style="margin-top: 8px;" onclick={start}>
					{t('session.newTask')}
				</button>
			</div>
		</div>
	{/if}
{/if}

{#if session.phase === 'done' && session.evaluation && session.submission}
	{@const ev = session.evaluation}
	<div class="card">
		<div class="score-ring">
			<div>
				<div class="score-num" style="color: {scoreColor(ev.overallScore)};">{ev.overallScore}</div>
				<div class="muted" style="font-size: 0.75rem;">{t('session.outOf100')}</div>
			</div>
			<div style="flex: 1;">
				{#each ev.dimensions as d (d.name)}
					<div style="margin-bottom: 8px;">
						<div class="row" style="font-size: 0.82rem;">
							<span>{d.name}</span>
							<div class="spacer"></div>
							<span class="muted">{d.score}/10</span>
						</div>
						<div class="bar"><span style="width: {d.score * 10}%"></span></div>
					</div>
				{/each}
			</div>
		</div>
		<p style="margin-top: 10px;">{ev.summary}</p>
	</div>

	{#if ev.constraintViolations.length}
		<div class="error">{#each ev.constraintViolations as v}<div>• {v}</div>{/each}</div>
	{/if}

	{#if ev.strengths.length}
		<div class="card">
			<h3>{t('session.strengths')}</h3>
			<ul style="margin: 0; padding-left: 18px;">
				{#each ev.strengths as s}<li>{s}</li>{/each}
			</ul>
		</div>
	{/if}
	{#if ev.improvements.length}
		<div class="card">
			<h3>{t('session.tryNext')}</h3>
			<ul style="margin: 0; padding-left: 18px;">
				{#each ev.improvements as s}<li>{s}</li>{/each}
			</ul>
		</div>
	{/if}

	<div class="card">
		<h3>{t('session.detectedFromPhoto')}</h3>
		<div class="muted" style="font-size: 0.88rem;">
			{#if session.submission.exif.make}{session.submission.exif.make} {session.submission.exif.model}{/if}<br />
			{#if session.submission.exif.lensModel}{t('session.lens')}: {session.submission.exif.lensModel}<br />{/if}
			{#if session.submission.exif.focalLengthMm}{session.submission.exif.focalLengthMm}mm{/if}
			{#if session.submission.exif.aperture} · f/{session.submission.exif.aperture}{/if}
			{#if session.submission.exif.exposureTimeSec} · {formatShutter(session.submission.exif.exposureTimeSec)}{/if}
			{#if session.submission.exif.iso} · ISO {session.submission.exif.iso}{/if}
		</div>
		{#if session.submission.geoMismatchMeters != null && session.submission.geoMismatchMeters > 1000}
			<div class="note" style="margin-top: 8px;">
				{t('session.geoMismatch', { m: session.submission.geoMismatchMeters.toLocaleString() })}
			</div>
		{/if}
	</div>

	<button class="btn btn-primary btn-block" onclick={start}>{t('session.newTask')}</button>
	<a class="btn btn-ghost btn-block" href="/history" style="margin-top: 8px;">{t('session.viewHistory')}</a>
{/if}
