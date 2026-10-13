import type { AudioTrack } from 'videowright';

/**
 * Rendered audio track for the Encore Commons demo.
 *
 * VO-only: one narration cue, the whole file, placed at 0s. The perSegment
 * advances below are generated, not hand-timed — `node scripts/derive-advances.mjs
 * --write` computes them from the provider's word alignment, and `npm run
 * check:timing` fails when they stop agreeing with the recorded take. Do not edit
 * them by hand.
 */
const track: AudioTrack = {
	audio_file: './audio/tracks/v1/track.mp3',
	length_s: 115.82,
	timing: {
		perSegment: {
			'encore-context': [3.971, 20.271],
			'encore-group': [4.725, 8.626, 16.498],
			'encore-agents': [0.5, 8.301, 14.466],
			'encore-proposal': [2.868, 10.066, 15.847],
			'encore-veto': [7.466, 12.284, 17.705],
			'encore-trace': [2.554, 10.554],
			'encore-limits': [2.879, 16.741, 20.479],
		},
	},
};

export default track;
