import { defineSegment } from 'videowright';
import { mountSceneFrame, settle } from '../../components/scene-frame/index';
import { panelHtml, revealPanel } from '../../components/panel/index';
import removedUrl from '../../assets/captures/09-removed-by-veto.png';

let host: HTMLElement | null = null;

/**
 * Scene 5 — the veto. It is a hard exclusion, not a low score, and the excluded
 * venue stays on the page with its reason and the evidence it had. The figure at
 * the bottom is the cost of replanning: this session's replan trace shows
 * `query_places` skipped and zero discovery calls made after the veto.
 */
export default defineSegment({
	id: 'encore-veto',
	advances: [5.0, 12.0, 20.0],
	voiceover:
		'Affinity is a ranking signal, not a promise, so a veto is a hard exclusion, not a low score. Bo vetoes one venue; it stays visible with its reason, and the plan rebuilds from discovery already paid for, with zero new Qloo calls.',
	notes: 'Recorded interface: the removed-by-a-veto section after a real veto.',

	mount(el) {
		host = el;
		const frame = mountSceneFrame(el, 'When someone says no');
		frame.setContent(`
      <div style="position:absolute; left:var(--safe-x); right:var(--safe-x); top:170px; display:flex; gap:72px; align-items:flex-start;">

        <div data-ref="panel-wrap" style="flex:0 0 900px; opacity:0;">
          ${panelHtml({
						imageUrl: removedUrl,
						alt: 'Removed by a veto',
						caption: 'Recorded interface · /shortlist · after a veto',
					})}
        </div>

        <div style="flex:1 1 0;">
          <div data-ref="headline" style="font-family:var(--font-display); font-size:86px; line-height:1.06; opacity:0;">
            A veto is an exclusion,<br />not a low score<span style="color:var(--color-accent);">.</span>
          </div>

          <div data-ref="detail" style="margin-top:52px; opacity:0;">
            <div style="font-family:var(--font-mono); font-size:20px; letter-spacing:0.08em; text-transform:uppercase; color:var(--color-muted);">
              Excluded in this run
            </div>
            <div style="font-family:var(--font-body); font-size:32px; line-height:1.4; color:var(--color-soft); margin-top:14px;">
              <strong style="color:var(--color-fg);">Reichstagskuppel</strong> — excluded for Bo. It had a
              worst-person affinity of 0.782. It is kept visible, because hiding it would hide the
              group's decision.
            </div>
          </div>

          <div data-ref="cost" style="margin-top:64px; padding-top:40px; border-top:1px solid var(--color-border); opacity:0;">
            <div style="font-family:var(--font-display); font-size:120px; line-height:1; color:var(--color-accent);">0</div>
            <div style="font-family:var(--font-body); font-size:28px; line-height:1.4; color:var(--color-muted); margin-top:10px;">
              new Qloo discovery calls to replan. The same candidate pool is re-ranked from the
              evidence already fetched.
            </div>
          </div>
        </div>
      </div>
    `);
	},

	async play(ctx) {
		const headline = host?.querySelector('[data-ref="headline"]') as HTMLElement | null;
		const wrap = host?.querySelector('[data-ref="panel-wrap"]') as HTMLElement | null;
		const detail = host?.querySelector('[data-ref="detail"]') as HTMLElement | null;
		const cost = host?.querySelector('[data-ref="cost"]') as HTMLElement | null;
		const frame = host?.querySelector('scene-frame') as HTMLElement | null;

		(frame as { reveal?: () => void } | null)?.reveal?.();
		settle(headline, 0);
		revealPanel(wrap, 120);

		await ctx.waitForNext();

		settle(detail, 0);

		await ctx.waitForNext();

		settle(cost, 0);
	},

	unmount() {
		host = null;
	},
});
