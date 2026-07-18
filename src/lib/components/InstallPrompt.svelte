<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { settings } from '$lib/stores/settings.svelte';
	import {
		isAndroidBrowser,
		isIosBrowser,
		isStandalone,
		type BeforeInstallPromptEvent
	} from '$lib/pwa/install';

	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let ios = $state(false);
	let android = $state(false);
	let standalone = $state(false);
	let installed = $state(false);
	let prompting = $state(false);

	const visible = $derived(
		settings.loaded &&
		!settings.current.installPromptDismissed &&
		!standalone &&
		!installed &&
		(ios || android || deferredPrompt !== null)
	);

	onMount(() => {
		ios = isIosBrowser(navigator.userAgent, navigator.maxTouchPoints);
		android = isAndroidBrowser(navigator.userAgent);
		standalone = isStandalone(
			window.matchMedia('(display-mode: standalone)').matches,
			(navigator as Navigator & { standalone?: boolean }).standalone === true
		);

		const onBeforeInstallPrompt = (event: Event) => {
			event.preventDefault();
			deferredPrompt = event as BeforeInstallPromptEvent;
		};
		const onAppInstalled = () => {
			installed = true;
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		window.addEventListener('appinstalled', onAppInstalled);
		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.removeEventListener('appinstalled', onAppInstalled);
		};
	});

	async function dismiss() {
		await settings.save({ ...settings.current, installPromptDismissed: true });
	}

	async function promptForInstall() {
		if (!deferredPrompt) return;
		prompting = true;
		try {
			await deferredPrompt.prompt();
			const choice = await deferredPrompt.userChoice;
			if (choice.outcome === 'accepted') installed = true;
			await dismiss();
		} finally {
			prompting = false;
		}
	}
</script>

{#if visible}
	<div class="modal-backdrop">
		<dialog open class="install-modal" aria-labelledby="install-title">
			<h2 id="install-title">{t('install.title')}</h2>
			<p class="muted">{ios ? t('install.iosBody') : android ? t('install.androidBody') : t('install.otherBody')}</p>
			{#if ios}
				<p class="install-steps">{t('install.iosSteps')}</p>
			{:else if android}
				<p class="install-steps">{t('install.androidSteps')}</p>
			{/if}
			<div class="row install-actions">
				{#if deferredPrompt}
					<button class="btn btn-primary" onclick={promptForInstall} disabled={prompting}>
						{prompting ? t('install.prompting') : t('install.install')}
					</button>
				{/if}
				<button class="btn btn-ghost" onclick={dismiss}>{t('install.dismiss')}</button>
			</div>
		</dialog>
	</div>
{/if}
