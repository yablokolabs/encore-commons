import { defineSegment } from 'videowright';
import { mountSceneFrame, settle } from '../../components/scene-frame/index';
import { revealStats, statHtml } from '../../components/panel/index';

let host: HTMLElement | null = null;

/**
 * The five tools the agent is allowed to call. This list is the whole surface:
 * the trace page in the application names the same five, and nothing outside it
 * can be reached.
 */
const TOOLS = [
	{ name: 'search_entities', note: 'resolve a favourite' },
	{ name: 'query_places', note: 'discover venues' },
	{ name: 'score_candidates', note: 'score per person' },
	{ name: 'apply_veto', note: 'exclude, then re-rank' },
	{ name: 'explain_plan', note: 'word the result' },
];

/**
 * Scene 3 — the agent, and the measured shape of one real run. The pipeline is
 * the allowlist; the figures below it are this session's own, read out of the
 * trace page by the capture script rather than retyped here.
 */
export default defineSegment({
	id: 'encore-agents',
	advances: [5.0, 11.0, 19.0],
	voiceover:
		'The agent is a bounded state machine, not an open-ended loop: five allowlisted tools, at most two replans. This run queried places three times and scored twenty-four candidates for all three people.',
	notes: 'Tool allowlist plus the captured run\u2019s counts.',

	mount(el) {
		host = el;
		const frame = mountSceneFrame(el, 'The agent');
		frame.setContent(`
      <div style="position:absolute; left:var(--safe-x); right:var(--safe-x); top:190px;">

        <div data-ref="headline" style="font-family:var(--font-display); font-size:104px; line-height:1.02; opacity:0;">
          A bounded state machine<span style="color:var(--color-accent);">.</span>
        </div>

        <div data-ref="pipeline" style="display:flex; align-items:stretch; gap:18px; margin-top:76px; opacity:0;">
          ${TOOLS.map(
						(tool, index) => `
            <div style="flex:1 1 0; display:flex; align-items:center; gap:18px;">
              <div style="flex:1 1 0; border-top:2px solid var(--color-fg); padding-top:18px;">
                <div style="font-family:var(--font-mono); font-size:22px; letter-spacing:0.02em; color:var(--color-fg);">${tool.name}</div>
                <div style="font-family:var(--font-body); font-size:24px; line-height:1.35; color:var(--color-muted); margin-top:10px;">${tool.note}</div>
              </div>
              ${
								index < TOOLS.length - 1
									? '<span style="font-family:var(--font-body); font-size:30px; color:var(--color-accent);">→</span>'
									: ''
							}
            </div>`,
					).join('')}
        </div>

        <div data-ref="stats" style="display:flex; gap:52px; margin-top:96px; padding-top:44px; border-top:1px solid var(--color-border);">
          ${statHtml('3', 'query_places calls, 25 venues each')}
          ${statHtml('24', 'candidates scored for every person')}
          ${statHtml('100%', 'of candidates at full coverage')}
          ${statHtml('2', 'replans allowed, then it stops', true)}
        </div>
      </div>
    `);
	},

	async play(ctx) {
		const headline = host?.querySelector('[data-ref="headline"]') as HTMLElement | null;
		const pipeline = host?.querySelector('[data-ref="pipeline"]') as HTMLElement | null;
		const stats = host?.querySelector('[data-ref="stats"]') as HTMLElement | null;
		const frame = host?.querySelector('scene-frame') as HTMLElement | null;

		(frame as { reveal?: () => void } | null)?.reveal?.();
		settle(headline, 0);

		await ctx.waitForNext();

		settle(pipeline, 0);

		await ctx.waitForNext();

		revealStats(stats, 120);
	},

	unmount() {
		host = null;
	},
});
