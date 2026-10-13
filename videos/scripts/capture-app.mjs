#!/usr/bin/env node
/**
 * Capture the Encore Commons interface as it actually renders.
 *
 * The demo video shows the product, so the product has to be photographed
 * rather than re-drawn: this drives the real UI in a real browser — types the
 * show location, loads the demo group, presses "Resolve favourites with Qloo",
 * confirms each match in the select this app really renders, plans, and vetoes —
 * and saves what the browser painted.
 *
 * Every capture is therefore a recorded artefact of a live run. Nothing here
 * touches the providers directly; the app does that, which is the point, and the
 * scenes in the film label these frames as recorded interface rather than as
 * live proof of a provider call.
 *
 * Usage:
 *   node scripts/capture-app.mjs                        # http://127.0.0.1:3300
 *   CAPTURE_BASE_URL=https://host node scripts/capture-app.mjs
 *
 * Writes 1920x1080 PNGs to videos/assets/captures/.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(resolve(HERE, '..'), 'assets', 'captures');
const BASE = (process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:3300').replace(/\/+$/, '');

const VIEWPORT = { width: 1920, height: 1080 };

/** The plan the film narrates, so a capture carries the run it came from. */
const RUN_NOTE = {};

function log(message) {
	console.log(`[capture] ${message}`);
}

async function main() {
	mkdirSync(OUT, { recursive: true });
	const { chromium } = await import('playwright');
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	page.on('pageerror', (error) => console.error(`[capture] page error: ${error.message}`));

	/** Screenshot the viewport after scrolling an element into view. */
	async function shot(name, { scrollTo, wait = 400 } = {}) {
		if (scrollTo) {
			await page.evaluate((selector) => {
				const el = document.querySelector(selector);
				if (!el) throw new Error(`no element for ${selector}`);
				const top = el.getBoundingClientRect().top + window.scrollY - 24;
				window.scrollTo({ top, behavior: 'instant' });
			}, scrollTo);
		}
		await page.waitForTimeout(wait);
		const file = join(OUT, `${name}.png`);
		await page.screenshot({ path: file });
		log(`${name}.png`);
		return file;
	}

	/**
	 * Read the trace table the page is showing. The film quotes these figures, so
	 * they are read back out of the DOM rather than recomputed or re-typed.
	 */
	async function readTrace() {
		const trace = await page.evaluate(() => {
			const badges = [...document.querySelectorAll('.badge')].map((b) =>
				b.textContent?.replace(/\s+/g, ' ').trim(),
			);
			const rows = [...document.querySelectorAll('table tbody tr')].map((tr) => {
				const cells = [...tr.querySelectorAll('td')].map((td) =>
					td.textContent?.replace(/\s+/g, ' ').trim(),
				);
				return {
					index: cells[0],
					step: cells[1],
					tool: cells[2],
					status: cells[3],
					results: cells[4],
					latency: cells[5],
				};
			});
			return { badges, rows };
		});
		return {
			badges: trace.badges,
			steps: trace.rows.length,
			rows: trace.rows,
			succeeded: trace.rows.filter((row) => row.status === 'ok').length,
			failed: trace.rows.filter((row) => row.status === 'error').length,
			skipped: trace.rows.filter((row) => row.status === 'skipped').length,
		};
	}

	// 1. The landing state: hero, the agent description, and the live provider
	//    status the app renders from /api/health.
	log(`opening ${BASE}/`);
	await page.goto(`${BASE}/`, { waitUntil: 'load' });
	await page.waitForSelector('#location', { timeout: 30000 });
	await page.waitForTimeout(1200);
	await shot('01-hero');
	await shot('02-set-the-night', { scrollTo: '[aria-labelledby="step-1"]' });

	// 2. The group board. The demo button is the app's own; the three people and
	//    their favourites are then visible as the interface draws them.
	await page.fill('#location', 'Berlin');
	await page.getByRole('button', { name: /Use the demo group/i }).click();
	await page.waitForTimeout(600);
	await shot('03-group-board', { scrollTo: '[aria-labelledby="step-2"]' });

	// 3. Resolve with Qloo, then confirm every match in the select the app
	//    renders. The app refuses to score an unconfirmed guess, so the film
	//    shows the same confirmation step a person does.
	await page.getByRole('button', { name: /Resolve favourites with Qloo/i }).click();
	await page.waitForFunction(
		() => document.querySelectorAll('select[id^="match-"]').length >= 6,
		{ timeout: 120000 },
	);
	const selects = await page.$$('select[id^="match-"]');
	log(`${selects.length} match select(s) to confirm`);
	for (const select of selects) {
		const value = await select.evaluate((el) => {
			const option = [...el.options].find((candidate) => candidate.value !== '');
			return option?.value ?? '';
		});
		if (value) await select.selectOption(value);
	}
	await page.waitForTimeout(800);
	await shot('04-matches-confirmed', { scrollTo: '[aria-labelledby="step-3"]' });

	// 4. Plan. The redirect to /shortlist is the app's own navigation.
	log('planning');
	const planned = page.waitForURL(/\/shortlist/, { timeout: 180000 });
	await page.getByRole('button', { name: /Find a venue everyone can agree on/i }).click();
	await planned;
	await page.waitForSelector('[aria-labelledby="proposal"] h3', { timeout: 30000 });
	await page.waitForTimeout(1500);
	await shot('05-preamble', { wait: 200 });
	await shot('06-proposal', { scrollTo: '[aria-labelledby="proposal"]' });

	/**
	 * The headline numbers the film quotes, read back out of the live plan.
	 *
	 * The per-person affinities come from each meter's `aria-label`, which the app
	 * writes as "Affinity 0.836 for Ada on a 0 to 1 relative scale". Reading them
	 * there rather than inferring them from the mean keeps a scene from stating a
	 * number the run never produced.
	 */
	const plan = await page.evaluate(() => {
		const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
		const badges = [...document.querySelectorAll('[aria-labelledby="proposal"] .badge')].map((b) =>
			b.textContent?.trim(),
		);
		const rows = [...document.querySelectorAll('[aria-labelledby="proposal"] .score-list .score-row')].map(
			(row) => ({
				label: row.querySelector('span')?.textContent?.trim() ?? null,
				value: row.querySelector('span.mono')?.textContent?.trim() ?? null,
				scale: row.querySelector('.meter')?.getAttribute('aria-label') ?? null,
			}),
		);
		return {
			venue: text('[aria-labelledby="proposal"] h3'),
			badges,
			fit: rows,
			alternatives: document.querySelectorAll('[aria-labelledby="alternatives"] article').length,
			url: location.href,
		};
	});
	RUN_NOTE.plan = plan;
	log(`proposal: ${plan.venue} — ${plan.badges.join(' | ')}`);
	log(`fit: ${plan.fit.map((row) => `${row.label} ${row.value}`).join(', ')}`);

	await shot('07-alternatives', { scrollTo: '[aria-labelledby="alternatives"]' });

	// 5. The trace of the query itself, read from the page that shows it.
	await page.getByRole('link', { name: /Inspect what the agent actually did/i }).click();
	await page.waitForURL(/\/trace/, { timeout: 30000 });
	await page.waitForSelector('table tbody tr', { timeout: 30000 });
	await page.waitForTimeout(1200);
	await shot('10-trace-query');
	RUN_NOTE.tracePlan = await readTrace();
	log(`plan trace: ${RUN_NOTE.tracePlan.steps} step(s), ${RUN_NOTE.tracePlan.failed} error(s)`);

	// Back to the shortlist. The plan is read from the browser's own session
	// store on mount, so it survives the navigation.
	await page.goBack({ waitUntil: 'load' });
	await page.waitForSelector('[aria-labelledby="proposal"] h3', { timeout: 30000 });
	await page.waitForTimeout(800);

	// 6. A veto. The app makes only the alternatives vetoable — the proposal card
	//    has no veto control — so this vetoes the top-ranked alternative and casts
	//    it as Bo, the participant whose taste differs most. What the scene has to
	//    show is that a veto is a hard exclusion and that the plan is rebuilt from
	//    the discovery already paid for, not that the winner necessarily changes.
	const vetoTarget = await page.evaluate(() => {
		const first = document.querySelector('[aria-labelledby="alternatives"] article');
		first?.scrollIntoView({ block: 'center' });
		return first?.querySelector('h3, h4, strong')?.textContent?.trim() ?? null;
	});
	if (!vetoTarget) throw new Error('no alternative found to veto');
	log(`vetoing the top alternative: ${vetoTarget}`);
	const vetoed = page.waitForResponse((response) => response.url().includes('/api/veto'), {
		timeout: 120000,
	});
	// Choose who vetoes, the way a person would, then read the choice back from
	// the select rather than assuming it: a scene that named the wrong person
	// would be a caption contradicting the screenshot beside it.
	const vetoSelect = '[aria-labelledby="alternatives"] article select';
	await page.selectOption(vetoSelect, { label: 'Bo vetoes' });
	await page.waitForTimeout(200);
	const castBy = await page.$eval(
		'[aria-labelledby="alternatives"] article select',
		(el) => el.options[el.selectedIndex]?.textContent?.trim() ?? null,
	);
	const vetoButton = await page.$('[aria-labelledby="alternatives"] article button.danger');
	if (!vetoButton) throw new Error('no veto button on the alternatives list');
	await vetoButton.click();
	const vetoResponse = await vetoed;
	await page.waitForTimeout(2500);
	const afterVeto = await page.evaluate(() => {
		const heading = document.querySelector('[aria-labelledby="proposal"] h3')?.textContent?.trim();
		const removed = [...document.querySelectorAll('[aria-labelledby="vetoed"] li')].map((li) =>
			li.textContent?.replace(/\s+/g, ' ').trim(),
		);
		return { venue: heading ?? null, removed };
	});
	RUN_NOTE.veto = {
		status: vetoResponse.status(),
		target: vetoTarget,
		castBy,
		venueAfterVeto: afterVeto.venue,
		proposalMoved: afterVeto.venue !== null && afterVeto.venue !== plan.venue,
		removedLines: afterVeto.removed,
	};
	log(
		`veto HTTP ${vetoResponse.status()} — excluded "${vetoTarget}"; proposal now "${afterVeto.venue}" (moved: ${RUN_NOTE.veto.proposalMoved})`,
	);
	await shot('08-after-veto', { wait: 200 });
	await shot('09-removed-by-veto', { scrollTo: '[aria-labelledby="vetoed"]' });

	// 7. The trace of the replan, from the same session.
	await page.getByRole('link', { name: /Inspect what the agent actually did/i }).click();
	await page.waitForURL(/\/trace/, { timeout: 30000 });
	await page.waitForSelector('table tbody tr', { timeout: 30000 });
	await page.waitForTimeout(1200);
	await shot('11-trace-replan');
	RUN_NOTE.traceReplan = await readTrace();
	log(`replan trace: ${RUN_NOTE.traceReplan.steps} step(s), ${RUN_NOTE.traceReplan.failed} error(s)`);

	writeFileSync(join(OUT, 'run.json'), `${JSON.stringify(RUN_NOTE, null, 2)}\n`);
	log("wrote run.json with this session's own figures");

	await browser.close();
}

main().catch((error) => {
	console.error(`[capture] FAIL: ${error.stack ?? error}`);
	process.exit(1);
});
