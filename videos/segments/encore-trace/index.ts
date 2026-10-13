import { defineSegment } from 'videowright';
import { mountSceneFrame, settle } from '../../components/scene-frame/index';
import { panelHtml, revealPanel } from '../../components/panel/index';
import { revealStats, statHtml } from '../../components/panel/index';
import traceUrl from '../../assets/captures/10-trace-query.png';

let host: HTMLElement | null = null;

/**
 * Scene 6 — the receipt. Every figure here was read out of this session's trace
 * page by the capture script: eleven steps for the query, eight that succeeded,
 * three skipped because the work was already cached, none failed, and 7.48
 * seconds of provider time in total. The input column is a one-way fingerprint,
 * so the trace can be inspected without republishing anyone's taste.
 */
export default defineSegment({
	id: 'encore-trace',
	advances: [6.0, 19.0],
	voiceover:
		'Every step is on the record. This query took eleven steps: eight succeeded, three were skipped because the work was already cached, and none failed.',
	notes: 'Recorded interface: /trace from this session.',

	mount(el) {
		host = el;
		const frame = mountSceneFrame(el, 'The receipt');
		frame.setContent(`
      <div style="position:absolute; left:var(--safe-x); right:var(--safe-x); top:186px;">

        <div style="display:flex; gap:72px; align-items:flex-start;">
          <div style="flex:0 0 900px; opacity:0;" data-ref="panel-wrap">
            ${panelHtml({
							imageUrl: traceUrl,
							alt: 'Agent trace',
							caption: 'Recorded interface · /trace · one row per tool call',
						})}
          </div>

          <div style="flex:1 1 0;">
            <div data-ref="headline" style="font-family:var(--font-display); font-size:100px; line-height:1.02; opacity:0;">
              Every step<br />on the record<span style="color:var(--color-accent);">.</span>
            </div>
            <div data-ref="lede" style="font-family:var(--font-body); font-size:30px; line-height:1.45; color:var(--color-soft); margin-top:32px; opacity:0;">
              Sixteen live smoke checks and seventy tests cover this path. The trace is produced by
              the run itself, not written afterwards.
            </div>
          </div>
        </div>

        <div data-ref="stats" style="display:flex; gap:48px; margin-top:64px; padding-top:36px; border-top:1px solid var(--color-border);">
          ${statHtml('11', 'tool calls for the query')}
          ${statHtml('8', 'succeeded')}
          ${statHtml('3', 'skipped, already cached')}
          ${statHtml('0', 'failed', true)}
          ${statHtml('7.48s', 'total provider time')}
        </div>
      </div>
    `);
	},

	async play(ctx) {
		const headline = host?.querySelector('[data-ref="headline"]') as HTMLElement | null;
		const lede = host?.querySelector('[data-ref="lede"]') as HTMLElement | null;
		const wrap = host?.querySelector('[data-ref="panel-wrap"]') as HTMLElement | null;
		const stats = host?.querySelector('[data-ref="stats"]') as HTMLElement | null;
		const frame = host?.querySelector('scene-frame') as HTMLElement | null;

		(frame as { reveal?: () => void } | null)?.reveal?.();
		settle(headline, 0);
		settle(lede, 140);
		revealPanel(wrap, 220);

		await ctx.waitForNext();

		revealStats(stats, 110);
	},

	unmount() {
		host = null;
	},
});
