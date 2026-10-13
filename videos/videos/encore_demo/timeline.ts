import '../../styles/encore/fonts.css';
import '../../styles/encore/tokens.css';
import type { Timeline } from 'videowright';
import defaultAudioTrack from './audio/tracks/v1/track';

/**
 * Encore Commons — Different tastes. One great night.
 *
 * Seven scenes: the group and the disagreement, the group board and its human
 * confirmation step, the allowlisted agent with one run's measured counts, the
 * proposal with every person's score, the veto and the cost of replanning, the
 * trace as the receipt, and the limits the project states about itself.
 *
 * The last scene ends on the deployed address. There is no closing card and no
 * attribution anywhere in the film.
 */
const timeline: Timeline = {
	meta: {
		title: 'Encore Commons — Different tastes. One great night.',
	},
	segments: [
		{ id: 'encore-context' },
		{ id: 'encore-group', transition: 'fade' },
		{ id: 'encore-agents', transition: 'fade' },
		{ id: 'encore-proposal', transition: 'fade' },
		{ id: 'encore-veto', transition: 'fade' },
		{ id: 'encore-trace', transition: 'fade' },
		{ id: 'encore-limits', transition: 'fade' },
	],
	default_audio_track: defaultAudioTrack,
};

export default timeline;
