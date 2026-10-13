#!/usr/bin/env node
/**
 * Derive every segment's advance times from the recorded narration alignment.
 *
 * Why this exists
 * ---------------
 * The renderer takes a segment's `advances` as one array and uses it twice: the
 * entries before the last are the moments a scene reveals its next beat, and the
 * LAST entry is the whole segment's duration. A scene with N `waitForNext()`
 * calls therefore needs exactly N + 1 entries — one per reveal, plus the span.
 *
 * When that arithmetic is kept by hand, a short array is invisible: the render
 * still succeeds, the scene still shows, and the reveal with no entry is simply
 * never drawn. So the numbers are computed here instead. The sentences of each
 * scene's recorded paragraph come from the provider's own character alignment,
 * `beat_map.json` says which sentence opens which reveal, and the span is the
 * distance to the next scene's first word.
 *
 * `--check` fails when the committed timing files disagree with what this
 * produces, which is what makes a re-record a one-command regeneration rather
 * than a manual re-timing.
 *
 * Usage:
 *   node scripts/derive-advances.mjs            # print the table, then check
 *   node scripts/derive-advances.mjs --write    # rewrite track.ts, voiceover.ts,
 *                                               # script.md, provider_script.md, PLAN.md
 *   node scripts/derive-advances.mjs --check    # exit non-zero if any of them differ
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const VIDEO = join(PROJECT, 'videos', 'encore_demo');
const TITLE = 'Encore Commons — Different tastes. One great night.';

/**
 * Smallest advance the renderer accepts. A scene whose first reveal belongs on
 * the narration's first word derives a beat of 0 s, and `validateTiming` refuses
 * it, so beats are held 50 ms apart — three frames at 60 fps, the same instant
 * to any viewer.
 */
const MIN_BEAT = 0.05;

/**
 * Earliest a scene's first reveal may appear. A scene arrives on a 400 ms
 * crossfade, and a beat that fires during it makes the render driver see the
 * outgoing scene still current and abort the export. Holding the first reveal
 * until 0.5 s keeps the picture a fraction of a screenshot behind the voice.
 */
const MIN_FIRST_BEAT = 0.5;

function read(path) {
	return readFileSync(path, 'utf8');
}

function fail(message) {
	console.error(`[derive] FAIL: ${message}`);
	process.exit(1);
}

/** Segment ids in timeline order. */
function segmentOrder() {
	const source = read(join(VIDEO, 'timeline.ts'));
	const ids = [...source.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
	if (ids.length === 0) fail('no segments found in timeline.ts');
	return ids;
}

/** One segment's declared narration and how many reveals it waits for. */
function segmentSpec(id) {
	const source = read(join(PROJECT, 'segments', id, 'index.ts'));
	const match = source.match(/voiceover:\s*\n?\s*'((?:[^'\\]|\\.)*)'/s);
	if (!match) fail(`segment "${id}" has no voiceover text`);
	const waits = [...source.matchAll(/await\s+ctx\.waitForNext\(\)/g)].length;
	if (waits === 0) fail(`segment "${id}" never calls waitForNext()`);
	return { voiceover: match[1].replace(/\\'/g, "'"), waits };
}

/** The recorded take: its alignment, and the paragraphs it read. */
function alignment() {
	const root = join(VIDEO, 'audio', 'originals', 'voiceovers');
	const takes = existsSync(root)
		? readdirSync(root).filter((name) => existsSync(join(root, name, 'timing.json')))
		: [];
	if (takes.length !== 1) fail(`expected exactly one recorded take under ${root}, found ${takes.length}`);
	const take = takes[0];
	const timing = JSON.parse(read(join(root, take, 'timing.json')));
	const meta = JSON.parse(read(join(root, take, 'audio_meta.json')));
	const text = timing.characters.join('');
	const starts = timing.character_start_times_seconds;
	const ends = timing.character_end_times_seconds;
	if (starts.length !== text.length || ends.length !== text.length) {
		fail('the alignment arrays do not line up with the character list');
	}
	const paragraphs = text.split('\n\n');
	let cursor = 0;
	const paragraphSpan = paragraphs.map((paragraph) => {
		const from = cursor;
		cursor += paragraph.length + 2; // the "\n\n" separator
		return { from, to: from + paragraph.length - 1 };
	});
	return {
		take,
		text,
		paragraphs,
		starts,
		ends,
		paragraphSpan,
		// The film ends with the audio file, so the final span runs to the file's
		// own measured length rather than to the last character's end time.
		fileEnd: meta.audio_seconds,
	};
}

/** Sentence spans inside one paragraph: text, first character, last character. */
function sentences(paragraph) {
	const out = [];
	const pattern = /[^.!?]+[.!?]+(?:\s|$)/g;
	let match;
	while ((match = pattern.exec(paragraph)) !== null) {
		const trimmed = match[0].trim();
		out.push({ text: trimmed, from: match.index, to: match.index + trimmed.length - 1 });
	}
	if (out.length === 0) {
		const trimmed = paragraph.trim();
		out.push({ text: trimmed, from: 0, to: trimmed.length - 1 });
	}
	return out;
}

function round(value, places = 3) {
	return Number(value.toFixed(places));
}

function derive() {
	const order = segmentOrder();
	const align = alignment();
	if (align.paragraphs.length !== order.length) {
		fail(
			`the recorded take has ${align.paragraphs.length} paragraph(s) but the timeline has ` +
				`${order.length} segment(s); the narration and the scene list disagree`,
		);
	}
	const beatMap = JSON.parse(read(join(VIDEO, 'beat_map.json')));

	const segments = order.map((id, index) => {
		const spec = segmentSpec(id);
		const paragraph = align.paragraphs[index];
		const span = align.paragraphSpan[index];
		const spanStart = align.starts[span.from];
		const spanEnd =
			index + 1 < order.length ? align.starts[align.paragraphSpan[index + 1].from] : align.fileEnd;
		const parts = sentences(paragraph);

		const beats = beatMap[id];
		if (!Array.isArray(beats)) fail(`beat_map.json has no entry for "${id}"`);
		if (beats.length !== spec.waits) {
			fail(
				`segment "${id}" waits for ${spec.waits} reveal(s) but beat_map.json lists ${beats.length}; ` +
					`the array needs ${spec.waits + 1} entries (one per reveal, plus the span)`,
			);
		}
		for (const beat of beats) {
			if (!Number.isInteger(beat) || beat < 0 || beat >= parts.length) {
				fail(`segment "${id}" beat ${beat} is outside its ${parts.length} sentence(s)`);
			}
		}

		// Sentence speaking time, shared evenly when several beats cite one sentence.
		const citations = new Map();
		for (const beat of beats) citations.set(beat, (citations.get(beat) ?? 0) + 1);
		const used = new Map();
		const advances = beats.map((beat) => {
			const part = parts[beat];
			const share = used.get(beat) ?? 0;
			used.set(beat, share + 1);
			const from = align.starts[span.from + part.from];
			const to = align.ends[span.from + part.to] ?? from;
			return round(from + ((to - from) * share) / citations.get(beat) - spanStart);
		});
		advances.push(round((index + 1 < order.length ? spanEnd : align.fileEnd) - spanStart));

		for (let i = 0; i < advances.length - 1; i += 1) {
			// The first scene has no incoming transition to wait for.
			const floor = i === 0 ? (index === 0 ? MIN_BEAT : MIN_FIRST_BEAT) : advances[i - 1] + MIN_BEAT;
			advances[i] = round(Math.max(advances[i], floor));
		}
		for (const [i, value] of advances.entries()) {
			if (!Number.isFinite(value) || value <= 0) {
				fail(`segment "${id}" derived advances[${i}] = ${value}; the renderer rejects non-positive advances`);
			}
		}
		for (let i = 1; i < advances.length; i += 1) {
			if (advances[i] <= advances[i - 1]) {
				fail(`segment "${id}" derived non-increasing advances: ${advances.join(', ')}`);
			}
		}
		if (advances.length !== spec.waits + 1) {
			fail(`segment "${id}" derived ${advances.length} advances for ${spec.waits} reveal(s)`);
		}

		return {
			id,
			waits: spec.waits,
			span: [round(spanStart), round(spanEnd)],
			spanEndSeconds: round(index + 1 < order.length ? spanEnd : align.fileEnd),
			sentences: parts.length,
			beats,
			advances,
			paragraph: paragraph.trim(),
			words: paragraph.trim().split(/\s+/).length,
			reveals: beats.map((beat) => `${parts[beat].text.slice(0, 56)}…`),
		};
	});

	const total = round(segments.reduce((sum, segment) => sum + segment.advances.at(-1), 0));
	return { align, segments, total, take: align.take };
}

/**
 * Rewrite a module's `timing` block in place, matching the file's own
 * indentation rather than assuming a depth. The whole `timing: { ... }` object is
 * replaced, so the `perSegment` key it needs is always written back — a previous
 * version of this function emitted the ids one level too high, which type-checks
 * as nothing and silently leaves every advance at its fallback.
 *
 * Two shapes are accepted: the one-line placeholder a fresh module starts with,
 * and an already-expanded block from a previous run, so the command is
 * idempotent either way.
 */
function replacePerSegment(source, segments, lengthSeconds) {
	const opening = source.match(/\n(\t*)timing:\s*\{/);
	if (!opening?.index) fail('could not find the timing block to replace');
	// The block ends at the closing brace that carries the same indentation as
	// `timing:` itself. A non-greedy match to the next `},` would stop at the
	// inner `perSegment` brace and leave a duplicate close behind, which is not
	// idempotent — the second run then differs from the first.
	const indent = opening[1];
	const closing = `\n${indent}},`;
	const end = source.indexOf(closing, opening.index);
	if (end === -1) fail('could not find the end of the timing block');
	const rows = segments
		.map((segment) => `${indent}\t\t'${segment.id}': [${segment.advances.join(', ')}],`)
		.join('\n');
	const block = `\n${indent}timing: {\n${indent}\tperSegment: {\n${rows}\n${indent}\t},\n${indent}},`;
	const next = source.slice(0, opening.index) + block + source.slice(end + closing.length);
	return next.replace(/length_s:\s*[0-9.]+/, `length_s: ${lengthSeconds}`);
}

/** The voiceover script as Markdown: the narration as recorded, scene by scene. */
function assembleScript(segments, take, align) {
	const words = segments.reduce((sum, segment) => sum + segment.words, 0);
	const seconds = segments.reduce((sum, segment) => sum + segment.advances.at(-1), 0);
	const pace = (words / seconds).toFixed(2);
	const wrap = (text) => {
		const lines = [];
		let line = '';
		for (const word of text.split(' ')) {
			if (`${line} ${word}`.trim().length > 76) {
				lines.push(line);
				line = word;
			} else {
				line = line ? `${line} ${word}` : word;
			}
		}
		if (line) lines.push(line);
		return lines.join('\n');
	};
	const rows = segments
		.map((segment) => `| ${segment.id} | ${segment.words} | ${segment.advances.at(-1).toFixed(2)} s |`)
		.join('\n');
	const sections = segments.map((segment) => `## ${segment.id}\n\n${wrap(segment.paragraph)}`).join('\n\n');
	return `# Voiceover script — ${TITLE}

This is the narration as recorded, in the order the film plays it. Each section is
one paragraph of the provider input; the spans are the scene lengths derived from
the provider's own character alignment, so each scene ends exactly where the next
paragraph's first word begins. Assembled by \`scripts/derive-advances.mjs\`;
\`--check\` fails when this file, the segment \`voiceover\` fields and the recorded
take stop agreeing.

Narration pace: measured at ${pace} words per second over the recorded take
(${take}, ElevenLabs \`eleven_multilingual_v2\`, voice Alice). The first take ran
124.4 s, over the 120 s cap, and was trimmed before this one was recorded.

| Segment | Words | Recorded span |
|---|---|---|
${rows}
| **Total** | **${words}** | **${seconds.toFixed(2)} s** |

${sections}
`;
}

/** The provider script: the exact text the take was generated from. */
function assembleProviderScript(segments, take, text) {
	const meta = JSON.parse(read(join(VIDEO, 'audio', 'originals', 'voiceovers', take, 'audio_meta.json')));
	return `# Provider script — take ${take}

> Sent to ${meta.provider}, model \`${meta.model_id}\`, voice "${meta.voice_name}".
> One paragraph per scene, blank-line separated, in reading order; prosody comes from
> punctuation only and no model tags are used. This file is the input record for the
> take, so it is the same wording as each scene's \`voiceover\` field. Rewritten by
> \`node scripts/derive-advances.mjs --write\`.

${text}
`;
}

/** The rendered-timing table in PLAN.md, between its markers. */
function assemblePlanTable(segments, total) {
	const rows = segments
		.map(
			(segment) =>
				`| ${segment.id} | [${segment.advances.join(', ')}] | ` +
				`${segment.span[0].toFixed(2)} – ${segment.spanEndSeconds.toFixed(2)} s |`,
		)
		.join('\n');
	return `| Segment | Rendered advances | Narration span |\n|---|---|---|\n${rows}\n| **Total** | | **${total.toFixed(3)} s** |`;
}

const PLAN_TABLE = /<!-- timing-table:start -->[\s\S]*?<!-- timing-table:end -->/;

/** Guard against the shape regression above: the block must name `perSegment`. */
function assertPerSegmentBlock(source) {
	if (!/timing:\s*\{\s*\n\s*perSegment:\s*\{/.test(source)) {
		fail('the derived timing block is missing its `perSegment` key');
	}
}

function replacePlanTable(source, block) {
	if (!PLAN_TABLE.test(source)) fail('could not find the timing-table markers in PLAN.md');
	return source.replace(
		PLAN_TABLE,
		`<!-- timing-table:start -->\n${block}\n<!-- timing-table:end -->`,
	);
}

function main() {
	const write = process.argv.includes('--write');
	const check = process.argv.includes('--check') || write;
	const { segments, total, take, align } = derive();

	console.log(`[derive] take: ${take} — ${align.text.length} chars, ${total.toFixed(3)} s`);
	console.log(
		`[derive] ${'segment'.padEnd(20)} ${'waits'.padStart(5)} ${'sent'.padStart(5)}  span (s)          advances (s)`,
	);
	for (const segment of segments) {
		console.log(
			`[derive] ${segment.id.padEnd(20)} ${String(segment.waits).padStart(5)} ` +
				`${String(segment.sentences).padStart(5)}  ${segment.span[0].toFixed(2)}–${segment.span[1].toFixed(2)}`.padEnd(72) +
				` ${segment.advances.join(', ')}`,
		);
	}
	console.log(`[derive] ${segments.length} segment(s), ${total.toFixed(3)} s of picture`);

	const lengthSeconds = round(align.fileEnd, 3);
	const targets = [
		{
			path: join(VIDEO, 'audio', 'tracks', 'v1', 'track.ts'),
			replace: (source) => replacePerSegment(source, segments, lengthSeconds),
		},
		{
			path: join(VIDEO, 'audio', 'originals', 'voiceovers', take, 'voiceover.ts'),
			replace: (source) => replacePerSegment(source, segments, lengthSeconds),
		},
		{
			path: join(VIDEO, 'voiceover_script', 'script.md'),
			replace: () => assembleScript(segments, take, align),
		},
		{
			path: join(VIDEO, 'audio', 'originals', 'voiceovers', take, 'provider_script.md'),
			replace: () => assembleProviderScript(segments, take, align.text),
		},
		{
			path: join(VIDEO, 'PLAN.md'),
			replace: (source) => replacePlanTable(source, assemblePlanTable(segments, total)),
		},
	];

	for (const target of targets) {
		if (!existsSync(target.path) && write) fail(`cannot write ${target.path}: it does not exist`);
	}

	const stale = targets.filter(
	(target) => existsSync(target.path) && target.replace(read(target.path)) !== read(target.path),
);
for (const target of stale) assertPerSegmentBlock(target.replace(read(target.path)));

	if (write) {
		for (const target of stale) writeFileSync(target.path, target.replace(read(target.path)));
		console.log(`[derive] wrote ${stale.length} file(s): ${stale.map((t) => t.path.split('/').pop()).join(', ')}`);
		return;
	}
	if (!check) return;

	for (const target of stale) {
		const before = read(target.path).split('\n');
		const after = target.replace(read(target.path)).split('\n');
		const at = before.findIndex((line, index) => line !== after[index]);
		console.error(
			`[derive] ${target.path} is stale at line ${at + 1}:\n` +
				`  committed: ${JSON.stringify(before[at])}\n` +
				`  derived:   ${JSON.stringify(after[at])}`,
		);
	}
	if (stale.length > 0) fail(`${stale.length} file(s) disagree with the recorded narration; run with --write`);
	console.log('[derive] PASS: advance times and script agree with the recorded narration');
}

main();
