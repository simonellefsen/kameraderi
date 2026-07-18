import catalogData from './catalog.json';
import { db } from '$lib/db/schema';
import type { CameraBody, Lens } from '$lib/types/gear';
import { IPHONE_BODIES, IPHONE_LENSES } from './iphoneCatalog';

export const CATALOG_BODIES = [...(catalogData.bodies as CameraBody[]), ...IPHONE_BODIES];
export const CATALOG_LENSES = [...(catalogData.lenses as Lens[]), ...IPHONE_LENSES];

/** Seed the curated catalog into IndexedDB on first run. Idempotent. */
export async function seedCatalogIfEmpty(): Promise<void> {
	const count = await db().bodies.count();
	if (count > 0) return;
	await db().bodies.bulkPut(CATALOG_BODIES);
	await db().lenses.bulkPut(CATALOG_LENSES);
}

/** Update/extend catalog rows on existing installs without overwriting user-owned gear. */
export async function migrateCatalog(): Promise<void> {
	await db().transaction('rw', db().bodies, db().lenses, async () => {
		for (const body of CATALOG_BODIES) {
			const existing = await db().bodies.get(body.id);
			if (!existing || existing.source === 'catalog') await db().bodies.put(body);
		}
		for (const lens of CATALOG_LENSES) {
			const existing = await db().lenses.get(lens.id);
			if (!existing || existing.source === 'catalog') await db().lenses.put(lens);
		}
	});
}

export async function allBodies(): Promise<CameraBody[]> {
	return db().bodies.toArray();
}

export async function allLenses(): Promise<Lens[]> {
	return db().lenses.toArray();
}

export async function lensesForMount(mount: string): Promise<Lens[]> {
	return db().lenses.where('mount').equals(mount).toArray();
}

export async function getBody(id: string): Promise<CameraBody | undefined> {
	return db().bodies.get(id);
}

export async function getLens(id: string): Promise<Lens | undefined> {
	return db().lenses.get(id);
}
