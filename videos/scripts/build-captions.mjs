#!/usr/bin/env node
/**
 * Build the caption files from the recorded narration.
 *
 * The cue times are not estimated: they come from the same character-level
 * alignment that places the scenes' reveals, so a caption appears on the syllable
 * that is being spoken and cannot drift from the audio. Text is wrapped at word
 * boundaries into at most two lines, which is what makes it readable at playback
 * size rather than a wall of subtitle.
 *
 * Output (both written, SRT for editors and VTT for the web):
 *   docs/media/encore-commons-demo.en.vtt
 *   docs/media/encore-commons-demo.en.srt
 *
 * Usage: node scripts/build-captions.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const REPO = resolve(PROJECT, '..');
const VIDEO = join(PROJECT, 'videos', 'encore_demo');
const TAKE = join(VIDEO, 'audio', 'originals', 'voiceovers', 'alice-uk-v1');
const OUT = join(REPO, 'docs', 'media');

/** Two lines of at most this many characters: readable, not a wall of text. */
const MAX_LINE = 42;
const MAX_CUE = MAX_LINE * 2;

function read(path) {
	return readFileSync(path, 'utf8');
}

/** `00:00:01,250` for SRT and `00:00:01.250` for WebVTT. */
function stamp(seconds, comma) {
	const clamped = Math.max(0, seconds);
	const hours = Math.floor(clamped / 3600);
	const minutes = Math.floor((clamped % 3600) / 60);
	const secs = Math.floor(clamped % 60);
	const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
	const pad = (value, width = 2) => String(value).padStart(width, '0');
	return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${comma ? ',' : '.'}${pad(millis, 3)}`;
}

/** Break a paragraph into cues of at most MAX_CUE characters, on word boundaries. */
function cuesForParagraph(paragraph, offset, starts, ends) {
	const words = [];
	const pattern = /\S+/g;
	let match;
	while ((match = pattern.exec(paragraph)) !== null) {
		words.push({ text: match[0], from: match.index, to: match.index + match[0].length - 1 });
	}
	const cues = [];
	let current = [];
	let length = 0;
	const flush = () => {
		if (current.length === 0) return;
		const first = current[0];
		const last = current.at(-1);
		const start = starts[offset + first.from];
		const end = ends[offset + last.to] ?? start;
		cues.push({ start, end, text: current.map((word) => word.text).join(' ') });
		current = [];
		length = 0;
	};
	for (const word of words) {
		const added = length === 0 ? word.text.length : length + 1 + word.text.length;
		if (added > MAX_CUE && current.length > 0) flush();
		length = length === 0 ? word.text.length : length + 1 + word.text.length;
		current.push(word);
	}
	flush();
	return cues;
}

/**
 * Wrap one cue into at most two lines, splitting where both lines fit and the
 * longer of them is shortest. A cue is already capped at MAX_CUE, so a valid
 * split normally exists; if none does the text is left on one line rather than
 * broken mid-word.
 */
function wrap(text) {
	if (text.length <= MAX_LINE) return text;
	const words = text.split(' ');
	let bestAt = -1;
	let bestLongest = Number.POSITIVE_INFINITY;
	for (let i = 1; i < words.length; i += 1) {
		const first = words.slice(0, i).join(' ');
		const second = words.slice(i).join(' ');
		if (first.length > MAX_LINE || second.length > MAX_LINE) continue;
		const longest = Math.max(first.length, second.length);
		if (longest < bestLongest) {
			bestLongest = longest;
			bestAt = i;
		}
	}
	if (bestAt === -1) return text;
	return `${words.slice(0, bestAt).join(' ')}\n${words.slice(bestAt).join(' ')}`;
}

function main() {
	const timing = JSON.parse(read(join(TAKE, 'timing.json')));
	const text = timing.characters.join('');
	const starts = timing.character_start_times_seconds;
	const ends = timing.character_end_times_seconds;

	mkdirSync(OUT, { recursive: true });

	const cues = [];
	let offset = 0;
	for (const paragraph of text.split('\n\n')) {
		for (const cue of cuesForParagraph(paragraph, offset, starts, ends)) {
			cues.push(cue);
		}
		offset += paragraph.length + 2;
	}
	// A cue must not run into the next one; the last one may keep its own end.
	for (let i = 0; i < cues.length - 1; i += 1) {
		if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
	}

	const vtt = [
		'WEBVTT',
		'',
		...cues.map(
			(cue, index) =>
				`${index + 1}\n${stamp(cue.start, false)} --> ${stamp(cue.end, false)}\n${wrap(cue.text)}\n`,
		),
	].join('\n');
	const srt = [
		...cues.map(
			(cue, index) =>
				`${index + 1}\n${stamp(cue.start, true)} --> ${stamp(cue.end, true)}\n${wrap(cue.text)}\n`,
		),
	].join('\n');

	writeFileSync(join(OUT, 'encore-commons-demo.en.vtt'), vtt);
	writeFileSync(join(OUT, 'encore-commons-demo.en.srt'), srt);

	const last = cues.at(-1);
	console.log(`[captions] ${cues.length} cues, last ends at ${last.end.toFixed(3)} s`);
	console.log(`[captions] wrote ${join(OUT, 'encore-commons-demo.en.vtt')}`);
	console.log(`[captions] wrote ${join(OUT, 'encore-commons-demo.en.srt')}`);
}

main();
