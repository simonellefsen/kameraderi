export interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isIosBrowser(userAgent: string, maxTouchPoints: number): boolean {
	return /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Mac') && maxTouchPoints > 1);
}

export function isAndroidBrowser(userAgent: string): boolean {
	return /Android/i.test(userAgent);
}

export function isStandalone(displayModeMatches: boolean, navigatorStandalone: boolean): boolean {
	return displayModeMatches || navigatorStandalone;
}
