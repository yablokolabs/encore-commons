import { defineSegment } from 'videowright';
import { mountSceneFrame, settle } from '../../components/scene-frame/index';

let host: HTMLElement | null = null;

/**
 * What the project refuses to claim. These are the product's own stated limits,
 * printed in the app under "What this does not claim", and the film says the same
 * four things rather than softening them.
 */
const LIMITS = [
	'Affinity is cultural fit. It is not a chance that anyone enjoys the night.',
	'Distance is a straight line. It is not a walking route and not travel time.',
	'Hours, price and access are unverified third-party metadata. Confirm them with the venue.',
	'Nothing is booked, reserved or paid for.',
];

/**
 * Scene 7 — the limits, then the address of the running app. The film ends on
 * product content: a sentence about the live deployment and where to reach it.
 * There is no closing card, no credits strip and no attribution of any kind.
 */
export default defineSegment({
	id: 'encore-limits',
	advances: [5.0, 12.0, 20.0],
	voiceover:
		'It claims no more than it can show. Affinity is cultural fit, not a chance anyone enjoys the night. Distance is a straight line, not travel time. Hours, price and access are unverified metadata. Nothing is booked. The working app is public, and its address is on screen.',
	notes: 'Final scene. Ends on the deployed address; no closing card.',

	mount(el) {
		host = el;
		const frame = mountSceneFrame(el, 'What it does not claim');
		frame.setContent(`
      <div style="position:absolute; left:var(--safe-x); right:var(--safe-x); top:156px;">

        <div data-ref="headline" style="font-family:var(--font-display); font-size:88px; line-height:1.02; opacity:0;">
          It does not claim<br />more than it can show<span style="color:var(--color-accent);">.</span>
        </div>

        <div data-ref="limits" style="display:grid; grid-template-columns:1fr 1fr; gap:30px 56px; margin-top:48px; opacity:0;">
          ${LIMITS.map(
						(limit, index) => `
            <div style="border-top:1px solid var(--color-border); padding-top:22px;">
              <span style="font-family:var(--font-mono); font-size:20px; color:var(--color-accent);">0${index + 1}</span>
              <div style="font-family:var(--font-body); font-size:27px; line-height:1.4; color:var(--color-soft); margin-top:10px;">${limit}</div>
            </div>`,
					).join('')}
        </div>

        <div data-ref="address" style="margin-top:44px; padding-top:30px; border-top:1px solid var(--color-border); opacity:0;">
          <div style="font-family:var(--font-mono); font-size:20px; letter-spacing:0.1em; text-transform:uppercase; color:var(--color-muted);">
            The working app, live now
          </div>
          <div style="font-family:var(--font-body); font-size:46px; font-weight:500; color:var(--color-fg); margin-top:12px;">
            encore.yablokolabs.com
          </div>
          <div style="font-family:var(--font-body); font-size:24px; line-height:1.4; color:var(--color-muted); margin-top:10px;">
            No sign-in. Live Qloo and Apertus calls, and the source is at github.com/yablokolabs/encore-commons.
          </div>
        </div>
      </div>
    `);
	},

	async play(ctx) {
		const headline = host?.querySelector('[data-ref="headline"]') as HTMLElement | null;
		const limits = host?.querySelector('[data-ref="limits"]') as HTMLElement | null;
		const address = host?.querySelector('[data-ref="address"]') as HTMLElement | null;
		const frame = host?.querySelector('scene-frame') as HTMLElement | null;

		(frame as { reveal?: () => void } | null)?.reveal?.();
		settle(headline, 0);

		await ctx.waitForNext();

		settle(limits, 0);

		await ctx.waitForNext();

		settle(address, 0);
	},

	unmount() {
		host = null;
	},
});
