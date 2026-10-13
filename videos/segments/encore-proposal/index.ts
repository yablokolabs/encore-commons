import { defineSegment } from 'videowright';
import { mountSceneFrame, settle } from '../../components/scene-frame/index';
import { panelHtml, revealPanel } from '../../components/panel/index';
import proposalUrl from '../../assets/captures/06-proposal.png';

let host: HTMLElement | null = null;

/**
 * The proposal as this run scored it. These three values are read off the live
 * plan's own fit meters — Ada 0.836, Bo 0.793, Cy 0.837 — which is why the mean
 * below checks out at 0.822 and the worst person at 0.793. Nothing here is
 * averaged into a single number, because the whole point of the ranking is the
 * person the average would have hidden.
 */
const FIT = [
	{ name: 'Ada', value: 0.836, dot: 'var(--color-accent)' },
	{ name: 'Bo', value: 0.793, dot: 'var(--color-gold)' },
	{ name: 'Cy', value: 0.837, dot: 'var(--color-violet)' },
];

/**
 * Scene 4 — one venue, and the same evidence behind every person's score. The
 * screenshot is the proposal card from the running app; the meters beside it are
 * drawn from the values that card produced.
 */
export default defineSegment({
	id: 'encore-proposal',
	advances: [5.0, 12.0, 20.0],
	voiceover:
		'That produced Absinthdepot Berlin. Its worst-person affinity is zero point seven nine three, the lowest score any single participant gave it. The group mean is zero point eight two two, and nobody was averaged away.',
	notes: 'Recorded interface plus the run\u2019s own fit values.',

	mount(el) {
		host = el;
		const frame = mountSceneFrame(el, 'What the group actually agrees on');
		frame.setContent(`
      <div style="position:absolute; left:var(--safe-x); right:var(--safe-x); top:200px; display:flex; gap:72px; align-items:flex-start;">

        <div data-ref="panel-wrap" style="flex:0 0 900px; opacity:0;">
          ${panelHtml({
						imageUrl: proposalUrl,
						alt: 'The proposed venue',
						caption: 'Recorded interface · /shortlist · the proposed venue',
					})}
        </div>

        <div style="flex:1 1 0;">
          <div data-ref="headline" style="font-family:var(--font-display); font-size:92px; line-height:1.04; opacity:0;">
            Everyone scores<br />the same place<span style="color:var(--color-accent);">.</span>
          </div>

          <div data-ref="meters" style="margin-top:64px; opacity:0;">
            ${FIT.map(
							(person) => `
              <div style="margin-bottom:34px;">
                <div style="display:flex; align-items:baseline; justify-content:space-between; gap:20px;">
                  <span style="display:flex; align-items:center; gap:14px; font-family:var(--font-body); font-size:34px; font-weight:500;">
                    <span style="width:14px; height:14px; border-radius:50%; background:${person.dot}; display:block;"></span>${person.name}
                  </span>
                  <span style="font-family:var(--font-mono); font-size:34px;">${person.value.toFixed(3)}</span>
                </div>
                <div style="height:10px; background:var(--color-border); border-radius:999px; margin-top:12px; overflow:hidden;">
                  <div data-bar="${person.name}" style="height:100%; width:0%; background:var(--color-fg); border-radius:999px;"></div>
                </div>
              </div>`,
						).join('')}
            <div style="font-family:var(--font-body); font-size:25px; line-height:1.4; color:var(--color-muted); margin-top:8px;">
              Worst-person affinity 0.793 &middot; mean 0.822 &middot; 100% coverage. Affinity is a relative
              provider signal from 0 to 1, not a percentage of enjoyment.
            </div>
          </div>
        </div>
      </div>
    `);
	},

	async play(ctx) {
		const headline = host?.querySelector('[data-ref="headline"]') as HTMLElement | null;
		const wrap = host?.querySelector('[data-ref="panel-wrap"]') as HTMLElement | null;
		const meters = host?.querySelector('[data-ref="meters"]') as HTMLElement | null;
		const frame = host?.querySelector('scene-frame') as HTMLElement | null;

		(frame as { reveal?: () => void } | null)?.reveal?.();
		settle(headline, 0);
		revealPanel(wrap, 120);

		await ctx.waitForNext();

		settle(meters, 0);

		await ctx.waitForNext();

		// Draw each bar to its own value. The width is the affinity itself, so the
		// bars are a reading of the run rather than decoration.
		const bars = meters?.querySelectorAll('[data-bar]') ?? [];
		bars.forEach((bar, index) => {
			const person = FIT[index];
			if (!person) return;
			(bar as HTMLElement).animate(
				[{ width: '0%' }, { width: `${Math.round(person.value * 100)}%` }],
				{ duration: 780, delay: index * 140, fill: 'forwards', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
			);
		});
	},

	unmount() {
		host = null;
	},
});
