#!/usr/bin/env node
/**
 * Narrate the film: one ElevenLabs take, with the provider's own alignment.
 *
 * The text sent to the provider is assembled from the segments' `voiceover`
 * fields — the same strings the scenes declare and the same file the video
 * script is assembled from — so the take, the scenes and the script cannot
 * describe three different films. Paragraphs are separated by a blank line, one
 * per scene, in timeline order.
 *
 * The provider is asked for timestamps, so the response carries a character-level
 * alignment: that is what lets `scripts/derive-advances.mjs` place each reveal on
 * the recorded sentence that motivates it instead of on a hand-timed guess.
 *
 * The key is read from ~/.hermes/.env by name and is never printed and never
 * written into the project. The billed character count is recorded in the take's
 * `audio_meta.json` next to the audio.
 *
 * Usage:
 *   node scripts/narrate.mjs [--dry-run]
 *
 * `--dry-run` prints the assembled text, its character count and the estimated
 * cost against the account's remaining quota, and sends nothing.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const VIDEO = join(PROJECT, 'videos', 'encore_demo');
const TAKE_SLUG = process.env.TAKE_SLUG ?? 'alice-uk-v1';
const TAKE = join(VIDEO, 'audio', 'originals', 'voiceovers', TAKE_SLUG);

/**
 * The voice, chosen from the account's real catalogue rather than from a guess.
 *
 * What was available: this account is on the free tier, and its twenty-one
 * reachable voices are all `premade`. The only British female premades are Alice
 * and Lily, both labelled `middle_aged`. The British female *young* voices are
 * library voices, and the free tier refuses library voices through the API with
 * HTTP 402 `paid_plan_required` — verified by request, not inferred. No spend was
 * authorised, so the closest permitted British female voice was auditioned and
 * used. Both auditions and the 402 refusal are recorded in audio_meta.json.
 */
const VOICE_ID = 'Xb7hH8MSUJpSbSDYk0k2'; // Alice — Clear, Engaging Educator (premade, British, female)
const MODEL_ID = 'eleven_multilingual_v2';
const VOICE_SETTINGS = {
	stability: 0.5,
	similarity_boost: 0.75,
	style: 0.0,
	use_speaker_boost: true,
};

function read(path) {
	return readFileSync(path, 'utf8');
}

function fail(message) {
	console.error(`[narrate] FAIL: ${message}`);
	process.exit(1);
}

/** Segment ids in timeline order. */
function segmentOrder() {
	const source = read(join(VIDEO, 'timeline.ts'));
	const ids = [...source.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
	if (ids.length === 0) fail('no segments found in timeline.ts');
	return ids;
}

/** Each scene's declared narration, in order. */
function paragraphs() {
	return segmentOrder().map((id) => {
		const source = read(join(PROJECT, 'segments', id, 'index.ts'));
		const match = source.match(/voiceover:\s*\n?\s*'((?:[^'\\]|\\.)*)'/s);
		if (!match) fail(`segment "${id}" has no voiceover text`);
		return match[1].replace(/\\'/g, "'");
	});
}

/** The API key from ~/.hermes/.env, by name. Never returned or logged. */
function apiKey() {
	if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
	const envPath = join(homedir(), '.hermes', '.env');
	if (!existsSync(envPath)) fail('no ELEVENLABS_API_KEY in the environment and no ~/.hermes/.env');
	const line = read(envPath)
		.split('\n')
		.find((candidate) => candidate.startsWith('ELEVENLABS_API_KEY='));
	if (!line) fail('ELEVENLABS_API_KEY is not present in ~/.hermes/.env');
	return line.slice('ELEVENLABS_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}

async function main() {
	const dryRun = process.argv.includes('--dry-run');
	const text = paragraphs().join('\n\n');
	const ids = segmentOrder();

	console.log(`[narrate] ${ids.length} scene(s), ${text.length} characters`);
	for (const [index, id] of ids.entries()) {
		console.log(`[narrate]   ${id.padEnd(20)} ${paragraphs()[index].length} chars`);
	}

	const key = apiKey();
	const quota = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
		headers: { 'xi-api-key': key },
	}).then((response) => response.json());
	const remaining = quota.character_limit - quota.character_count;
	console.log(
		`[narrate] account tier=${quota.tier} used=${quota.character_count}/${quota.character_limit} remaining=${remaining}`,
	);
	if (text.length > remaining) {
		fail(`this take needs ${text.length} characters but only ${remaining} remain on the account`);
	}

	if (dryRun) {
		console.log('[narrate] --dry-run: nothing sent to the provider');
		console.log(`\n${text}\n`);
		return;
	}

	mkdirSync(TAKE, { recursive: true });
	const response = await fetch(
		`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
		{
			method: 'POST',
			headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
			body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
		},
	);
	if (!response.ok) {
		const detail = await response.text();
		fail(`provider refused the take: HTTP ${response.status} — ${detail.slice(0, 400)}`);
	}
	const result = await response.json();
	if (!result.audio_base64) fail('the provider returned no audio');
	if (!result.alignment?.characters) fail('the provider returned no character alignment');

	writeFileSync(join(TAKE, 'audio.mp3'), Buffer.from(result.audio_base64, 'base64'));
	writeFileSync(join(TAKE, 'timing.json'), `${JSON.stringify(result.alignment)}\n`);

	// Paragraph starts, derived from the text that was actually sent. The check
	// script re-derives these from the alignment, so a mismatch is caught.
	const starts = {};
	let cursor = 0;
	for (const [index, id] of ids.entries()) {
		const paragraph = paragraphs()[index];
		starts[id] = {
			char_start: cursor,
			start_seconds: result.alignment.character_start_times_seconds[cursor] ?? null,
			paragraph,
		};
		cursor += paragraph.length + 2; // the "\n\n" separator
	}
	writeFileSync(join(TAKE, 'section_starts.json'), `${JSON.stringify(starts, null, 2)}\n`);

	const billed = result.alignment.characters.length;
	const seconds = result.alignment.character_end_times_seconds.at(-1);
	writeFileSync(
		join(TAKE, 'audio_meta.json'),
		`${JSON.stringify(
			{
				provider: 'elevenlabs',
				model_id: MODEL_ID,
				voice_name: 'Alice - Clear, Engaging Educator',
				voice_id: VOICE_ID,
				voice_profile: 'premade, British, female, middle_aged',
				requested_profile: 'British English, female, youthful adult',
				requested_profile_note:
					'No British female premade voice in this account carries a young age label; the account\'s British female premades are Alice and Lily, both middle_aged. The British female young voices are library voices, and the free tier refuses library voices through the API with HTTP 402 paid_plan_required (verified by request). Voice design and cloning are paid-plan features. No spend was authorised, so the closest permitted British female voice was audited by audition and used. Both auditions synthesised successfully.',
				voice_settings: VOICE_SETTINGS,
				characters_billed: billed,
				audio_seconds: Number(seconds.toFixed(3)),
				auditions: [
					{ voice: 'Alice', id: VOICE_ID, http: 200, seconds: 5.51 },
					{ voice: 'Lily', id: 'pFZP5JQG7iQjIQuC4Bku', http: 200, seconds: 5.25 },
				],
			},
			null,
			2,
		)}\n`,
	);

	// The provider script is the input record for the take, so it is the same text.
	writeFileSync(
		join(TAKE, 'provider_script.md'),
		`# Provider script — take ${TAKE_SLUG}\n\n> Sent to ElevenLabs, model \`${MODEL_ID}\`, voice "Alice - Clear, Engaging Educator".\n> One paragraph per scene, blank-line separated, in reading order. Prosody comes from\n> punctuation only; no model tags are used. This file is the input record for the take,\n> so it is the same wording as each scene's \`voiceover\` field. Rewritten by\n> \`node scripts/derive-advances.mjs --write\`.\n\n${text}\n`,
	);

	console.log(`[narrate] wrote audio.mp3 (${billed} chars, ${seconds.toFixed(3)} s) to ${TAKE}`);
}

main().catch((error) => fail(error.stack ?? String(error)));
