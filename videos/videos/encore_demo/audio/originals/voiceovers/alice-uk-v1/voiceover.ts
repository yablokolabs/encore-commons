import type { Voiceover } from 'videowright';

/**
 * Narration for the Encore Commons demo.
 *
 * Provider: ElevenLabs, model `eleven_multilingual_v2`, voice "Alice - Clear,
 * Engaging Educator" (premade, British, female). The brief asked for a youthful
 * adult British female voice; no British female voice in this account carries a
 * young age label, and the British female young voices are library voices the
 * free tier refuses with HTTP 402. Both auditions and that refusal are recorded
 * in `audio_meta.json` next to the audio, and no spend was authorised.
 *
 * Advance times are segment-relative and derived from the provider's word
 * alignment by `node scripts/derive-advances.mjs --write`: each reveal sits at the
 * start of the recorded sentence that motivates it (recorded in
 * `../../../beat_map.json`), and a sentence cited twice has its speaking time
 * split evenly. The renderer treats a segment's last advance as its whole
 * duration, so that value is the segment's full narration span and the seven
 * spans sum to the length of the narration file.
 */
const voiceover: Voiceover = {
	audio_file: './audio.mp3',
	provider: 'elevenlabs',
	provider_timing_file: './timing.json',
	// The installed videowright release types this field as `eleven_labs_voice_id`;
	// the model and the full voice settings are recorded in `audio_meta.json`.
	eleven_labs_voice_id: 'Xb7hH8MSUJpSbSDYk0k2',
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

export default voiceover;
