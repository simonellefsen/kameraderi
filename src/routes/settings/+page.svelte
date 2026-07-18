<script lang="ts">
	import { onMount } from 'svelte';
	import { defaultSettings, settings } from '$lib/stores/settings.svelte';
	import { PROVIDER_LIST, PROVIDERS } from '$lib/llm/providers';
	import { createProvider } from '$lib/llm/registry';
	import { SUPPORTED_LOCALES, t } from '$lib/i18n';
	import { aiCacheEntryCount, aiCacheStats, clearAiCache } from '$lib/cache/aiCache';
	import {
		rollingMonthlyUsage,
		todayUsage,
		type UsageTotals
	} from '$lib/usage/usageMeter';
	import { isOverBudget } from '$lib/usage/usageMath';
	import { freeSpaceOlderThan, type FreedPhotoStorage } from '$lib/db/photos';
	import { formatStorageBytes, getStorageEstimate, type StorageEstimate } from '$lib/storage/estimate';
	import { createBackup, parseBackup, restoreBackup } from '$lib/backup/archive';
	import { migrateCatalog } from '$lib/gear/catalog';
	import { session } from '$lib/stores/session.svelte';
	import type { ProviderKey, Settings } from '$lib/types/settings';
	import type { ValidationResult } from '$lib/llm/provider';

	/** Deep, mutable, plain copy of `src` (structuredClone breaks on Svelte $state proxies). */
	function clone<T>(src: T): T {
		return JSON.parse(JSON.stringify(src)) as T;
	}

	let draft = $state<Settings | null>(null);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	const results = $state<Record<string, ValidationResult>>({});

	let cacheEntries = $state(0);
	let cacheHits = $state(0);
	let cacheTokensSaved = $state(0);
	let clearingCache = $state(false);
	let cacheCleared = $state(false);
	let todayTokens = $state<UsageTotals>({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
	let monthlyTokens = $state<UsageTotals>({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
	let refreshingUsage = $state(false);
	let storage = $state<StorageEstimate>({});
	let storageDays = $state(90);
	let freeingSpace = $state(false);
	let freedStorage = $state<FreedPhotoStorage | null>(null);
	let exportingBackup = $state(false);
	let importingBackup = $state(false);
	let backupMessage = $state<string | null>(null);
	let backupInput = $state<HTMLInputElement>();

	async function refreshCacheStats() {
		cacheEntries = await aiCacheEntryCount();
		const s = aiCacheStats();
		cacheHits = s.hits;
		cacheTokensSaved = s.tokensSaved;
	}

	async function refreshUsage() {
		refreshingUsage = true;
		try {
			[todayTokens, monthlyTokens] = await Promise.all([todayUsage(), rollingMonthlyUsage()]);
		} finally {
			refreshingUsage = false;
		}
	}

	async function refreshStorage() {
		storage = await getStorageEstimate();
	}

	async function freeSpace() {
		if (!window.confirm(t('setup.storageConfirm', { days: storageDays }))) return;
		freeingSpace = true;
		freedStorage = null;
		try {
			freedStorage = await freeSpaceOlderThan(storageDays);
			await refreshStorage();
		} finally {
			freeingSpace = false;
		}
	}

	function downloadBackup(text: string) {
		const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `kameraderi-backup-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	async function exportBackup() {
		exportingBackup = true;
		backupMessage = null;
		try {
			downloadBackup(JSON.stringify(await createBackup()));
		} catch (e) {
			backupMessage = t('setup.backupError', { msg: e instanceof Error ? e.message : String(e) });
		} finally {
			exportingBackup = false;
		}
	}

	async function importBackup(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		backupMessage = null;
		try {
			const parsed = parseBackup(await file.text());
			if (!parsed.ok) {
				backupMessage = t('setup.backupError', { msg: parsed.error });
				return;
			}
			if (!window.confirm(t('setup.backupImportConfirm'))) return;
			importingBackup = true;
			const restored = await restoreBackup(parsed.value);
			if (!restored.ok) {
				backupMessage = t('setup.backupError', { msg: restored.error });
				return;
			}
		await migrateCatalog();
		await settings.reload();
		draft = clone(settings.current);
		session.reset();
			backupMessage = t('setup.backupImported');
			await Promise.all([refreshCacheStats(), refreshUsage(), refreshStorage()]);
		} catch (e) {
			backupMessage = t('setup.backupError', { msg: e instanceof Error ? e.message : String(e) });
		} finally {
			importingBackup = false;
			if (backupInput) backupInput.value = '';
		}
	}

	onMount(async () => {
		// Always resolve to a usable draft — never leave the page stuck on "Loading…".
		try {
			await settings.load();
			draft = clone(settings.current);
		} catch (e) {
			console.error('Settings load failed', e);
			loadError = e instanceof Error ? e.message : String(e);
			draft = clone(defaultSettings());
		}
		await Promise.all([refreshCacheStats(), refreshUsage(), refreshStorage()]);
	});

	async function clearCache() {
		clearingCache = true;
		cacheCleared = false;
		try {
			await clearAiCache();
			await refreshCacheStats();
			cacheCleared = true;
		} finally {
			clearingCache = false;
		}
	}

	const activeKey = $derived(draft?.activeProvider ?? 'openrouter');
	const overBudget = $derived(isOverBudget(monthlyTokens, draft?.monthlyTokenBudget ?? null));

	function setMonthlyTokenBudget(event: Event) {
		if (!draft) return;
		const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
		draft.monthlyTokenBudget = Number.isFinite(value) && value > 0 ? Math.round(value) : null;
	}

	async function save() {
		if (!draft) return;
		saving = true;
		try {
			await settings.save(draft);
		} finally {
			saving = false;
		}
	}

	async function validate() {
		if (!draft) return;
		const key = activeKey;
		results[key] = { ok: false };
		results[key] = { ok: true }; // optimistically clear error while loading
		const provider = createProvider(key, draft.providers[key]);
		results[key] = await provider.validateKey();
	}
</script>

<h1 style="margin-bottom: 12px;">{t('setup.title')}</h1>

<div class="note">{t('setup.byokNote')}</div>

{#if draft}
	<div class="card">
		<label for="language">{t('setup.language')}</label>
		<select id="language" bind:value={draft.locale}>
			{#each SUPPORTED_LOCALES as loc (loc.id)}
				<option value={loc.id}>{loc.label} ({loc.english})</option>
			{/each}
		</select>
		<p class="muted" style="font-size: 0.8rem;">{t('setup.languageHint')}</p>
	</div>

	<div class="card">
		<label for="provider">{t('setup.provider')}</label>
		<select id="provider" bind:value={draft.activeProvider}>
			{#each PROVIDER_LIST as p (p.key)}
				<option value={p.key}>{p.label} {p.supportsVision ? '' : t('setup.noVision')}</option>
			{/each}
		</select>

		<label for="key">{t('setup.apiKey')}</label>
		<input
			id="key"
			type="password"
			placeholder={t('setup.apiKeyPlaceholder')}
			bind:value={draft.providers[activeKey].apiKey}
		/>
		<div class="row" style="margin-top: 8px;">
			<button class="btn btn-ghost" onclick={validate}>{t('setup.testKey')}</button>
			<a href={PROVIDERS[activeKey].helpURL} target="_blank" rel="noopener" class="muted" style="font-size: 0.85rem;">
				{t('setup.getKey', { provider: PROVIDERS[activeKey].label })}
			</a>
			<div class="spacer"></div>
			{#if results[activeKey]}
				<span class="badge {results[activeKey].ok ? 'badge-good' : 'badge-bad'}">
					{results[activeKey].ok ? t('setup.valid') : t('setup.failed')}
				</span>
			{/if}
		</div>
		{#if results[activeKey] && !results[activeKey].ok && results[activeKey].error}
			<div class="error" style="margin-top: 8px;">{results[activeKey].error}</div>
		{/if}

		<label for="textmodel">{t('setup.textModel')}</label>
		<input id="textmodel" bind:value={draft.providers[activeKey].textModel} />

		<label for="visionmodel">{t('setup.visionModel')}</label>
		<input id="visionmodel" bind:value={draft.providers[activeKey].visionModel} />
		<p class="muted" style="font-size: 0.8rem;">
			{t('setup.visionQuality', { q: PROVIDERS[activeKey].visionQuality })}
		</p>
	</div>

	<div class="card">
		<label for="skill">{t('setup.skill')}</label>
		<select id="skill" bind:value={draft.skillLevel}>
			<option value="beginner">{t('difficulty.beginner')}</option>
			<option value="intermediate">{t('difficulty.intermediate')}</option>
			<option value="advanced">{t('difficulty.advanced')}</option>
		</select>
		<label class="row" style="margin-top: 12px; align-items: center;">
			<input
				type="checkbox"
				bind:checked={draft.llmAugmentGear}
				style="width: auto;"
			/>
			{t('setup.augmentGear')}
		</label>
	</div>

	<div class="card">
		<h3 style="margin-top: 0;">{t('setup.aiCache')}</h3>
		<p class="muted" style="font-size: 0.85rem;">{t('setup.aiCacheHint')}</p>
		<label class="row" style="align-items: center;">
			<input type="checkbox" bind:checked={draft.aiCacheEnabled} style="width: auto;" />
			{t('setup.aiCacheEnabled')}
		</label>
		<label for="cachettl">{t('setup.aiCacheTtl')}</label>
		<input
			id="cachettl"
			type="number"
			min="1"
			step="1"
			bind:value={draft.aiCacheTtlHours}
			disabled={!draft.aiCacheEnabled}
		/>
		<div class="row" style="margin-top: 10px; align-items: center;">
			<span class="muted" style="font-size: 0.82rem;">
				{t('setup.aiCacheStats', {
					entries: cacheEntries,
					hits: cacheHits,
					tokens: cacheTokensSaved.toLocaleString()
				})}
			</span>
			<div class="spacer"></div>
			<button class="btn btn-ghost" onclick={clearCache} disabled={clearingCache}>
				{t('setup.aiCacheClear')}
			</button>
		</div>
		{#if cacheCleared}
			<div class="note" style="margin-top: 8px;">{t('setup.aiCacheCleared')}</div>
		{/if}
	</div>

	<div class="card">
		<h3 style="margin-top: 0;">{t('setup.tokenUsage')}</h3>
		<p class="muted" style="font-size: 0.85rem;">{t('setup.tokenUsageHint')}</p>
		<div class="usage-totals">
			<div>
				<span>{t('setup.usageToday')}</span>
				<strong>{todayTokens.totalTokens.toLocaleString()}</strong>
				<small>{t('setup.usageCalls', { calls: todayTokens.calls })}</small>
			</div>
			<div>
				<span>{t('setup.usageLast30Days')}</span>
				<strong>{monthlyTokens.totalTokens.toLocaleString()}</strong>
				<small>{t('setup.usageCalls', { calls: monthlyTokens.calls })}</small>
			</div>
		</div>
		<label for="tokenbudget">{t('setup.usageBudget')}</label>
		<input
			id="tokenbudget"
			type="number"
			min="1"
			step="1"
			value={draft.monthlyTokenBudget ?? ''}
			onchange={setMonthlyTokenBudget}
		/>
		<p class="muted" style="font-size: 0.8rem;">{t('setup.usageBudgetHint')}</p>
		{#if overBudget}
			<div class="error" style="margin-top: 8px;">{t('setup.usageOverBudget')}</div>
		{/if}
		<div class="row" style="margin-top: 10px; justify-content: flex-end;">
			<button class="btn btn-ghost" onclick={refreshUsage} disabled={refreshingUsage}>
				{t('setup.usageRefresh')}
			</button>
		</div>
	</div>

	<div class="card">
		<h3 style="margin-top: 0;">{t('setup.storage')}</h3>
		<p class="muted" style="font-size: 0.85rem;">{t('setup.storageHint')}</p>
		{#if storage.usage != null && storage.quota != null}
			<p class="muted" style="font-size: 0.82rem;">
				{t('setup.storageEstimate', {
					used: formatStorageBytes(storage.usage),
					quota: formatStorageBytes(storage.quota)
				})}
			</p>
		{:else}
			<p class="muted" style="font-size: 0.82rem;">{t('setup.storageUnavailable')}</p>
		{/if}
		<label for="storageage">{t('setup.storageAge')}</label>
		<select id="storageage" bind:value={storageDays}>
			<option value={30}>{t('setup.storage30Days')}</option>
			<option value={90}>{t('setup.storage90Days')}</option>
			<option value={180}>{t('setup.storage180Days')}</option>
		</select>
		<div class="row" style="margin-top: 10px; justify-content: flex-end;">
			<button class="btn btn-ghost" onclick={refreshStorage}>{t('setup.storageRefresh')}</button>
			<button class="btn btn-danger" onclick={freeSpace} disabled={freeingSpace}>
				{t('setup.storageFree')}
			</button>
		</div>
		{#if freedStorage}
			<div class="note" style="margin-top: 8px;">
				{t('setup.storageFreed', {
					count: freedStorage.photoCount,
					size: formatStorageBytes(freedStorage.bytes)
				})}
			</div>
		{/if}
	</div>

	<div class="card">
		<h3 style="margin-top: 0;">{t('setup.backup')}</h3>
		<p class="muted" style="font-size: 0.85rem;">{t('setup.backupHint')}</p>
		<input
			bind:this={backupInput}
			type="file"
			accept="application/json,.json"
			style="display: none;"
			onchange={importBackup}
		/>
		<div class="row" style="margin-top: 10px; justify-content: flex-end;">
			<button class="btn btn-ghost" onclick={exportBackup} disabled={exportingBackup || importingBackup}>
				{exportingBackup ? t('setup.backupExporting') : t('setup.backupExport')}
			</button>
			<button class="btn btn-primary" onclick={() => backupInput?.click()} disabled={importingBackup || exportingBackup}>
				{importingBackup ? t('setup.backupImporting') : t('setup.backupImport')}
			</button>
		</div>
		{#if backupMessage}
			<div class="note" style="margin-top: 8px;">{backupMessage}</div>
		{/if}
	</div>

	<button class="btn btn-primary btn-block" onclick={save} disabled={saving}>
		{saving ? t('setup.saving') : t('setup.save')}
	</button>
{:else if loadError}
	<div class="error">{loadError} {t('setup.loadErrorSuffix')}</div>
	<button class="btn btn-primary btn-block" onclick={() => settings.load()}>{t('common.retry')}</button>
{:else}
	<p class="muted">{t('common.loading')}</p>
{/if}
