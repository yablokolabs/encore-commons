import { defineSegment } from 'videowright';
import { mountSceneFrame, settle } from '../../components/scene-frame/index';
import { panelHtml, revealPanel } from '../../components/panel/index';
import boardUrl from '../../assets/captures/03-group-board.png';
import confirmedUrl from '../../assets/captures/04-matches-confirmed.png';

let host: HTMLElement | null = null;

/**
 * Scene 2 — the group board, and the one rule the agent will not break: a
 * favourite is resolved to a real Qloo entity, and a person confirms that match
 * before anything is scored. The reveal swaps the board for the same board with
 * every match confirmed, which is what the app does.
 */
export default defineSegment({
	id: 'encore-group',
	advances: [4.0, 10.0, 17.0],
	voiceover:
		'You type where the show is, and each person names a few things they love. Those favourites resolve to real Qloo entities. Nothing is scored against a guess: a person confirms each match, and only confirmed entities reach the provider.',
	notes: 'Recorded interface: both frames are live captures of / .',

	mount(el) {
		host = el;
		const frame = mountSceneFrame(el, 'The group board');
		frame.setContent(`
      <div style="position:absolute; left:var(--safe-x); right:var(--safe-x); top:200px; display:flex; gap:72px; align-items:flex-start;">
        <div style="flex:0 0 560px;">
          <div data-ref="headline" style="font-family:var(--font-display); font-size:96px; line-height:1.02; opacity:0;">
            Confirmed,<br />not guessed<span style="color:var(--color-accent);">.</span>
          </div>
          <div data-ref="lede" style="font-family:var(--font-body); font-size:32px; line-height:1.45; color:var(--color-soft); margin-top:36px; opacity:0;">
            Two to four people, two to five favourites each. A pseudonym is all that is asked for.
          </div>
          <div data-ref="callout" style="margin-top:44px; padding-left:24px; border-left:3px solid var(--color-accent); opacity:0;">
            <div style="font-family:var(--font-body); font-size:30px; line-height:1.4; color:var(--color-fg);">
              Only entities a human has confirmed are sent to Qloo. An ambiguous match stops the run until someone chooses.
            </div>
          </div>
        </div>
        <div data-ref="panel-wrap" style="flex:1 1 0; position:relative; opacity:0;">
          <div data-ref="panel-slot">
            ${panelHtml({ imageUrl: boardUrl, alt: 'Group board', caption: 'Recorded interface · / · the group board' })}
          </div>
          <!-- The second frame sits over the first, not inside it: fading the
               slot out must not take the incoming frame with it. -->
          <div data-ref="panel-next" style="position:absolute; inset:0; opacity:0;">
            ${panelHtml({ imageUrl: confirmedUrl, alt: 'Every match confirmed', caption: 'Recorded interface · / · all six matches confirmed' })}
          </div>
        </div>
      </div>
    `);
	},

	async play(ctx) {
		const headline = host?.querySelector('[data-ref="headline"]') as HTMLElement | null;
		const lede = host?.querySelector('[data-ref="lede"]') as HTMLElement | null;
		const callout = host?.querySelector('[data-ref="callout"]') as HTMLElement | null;
		const wrap = host?.querySelector('[data-ref="panel-wrap"]') as HTMLElement | null;
		const slot = host?.querySelector('[data-ref="panel-slot"]') as HTMLElement | null;
		const next = host?.querySelector('[data-ref="panel-next"]') as HTMLElement | null;
		const frame = host?.querySelector('scene-frame') as HTMLElement | null;

		(frame as { reveal?: () => void } | null)?.reveal?.();
		settle(headline, 0);
		settle(lede, 140);
		revealPanel(wrap, 240);

		await ctx.waitForNext();

		settle(callout, 0);

		await ctx.waitForNext();

		// Cross-fade to the confirmed board: the frame a person sees after doing
		// the confirmation themselves. The two layers are siblings, so fading the
		// outgoing frame out cannot dim the incoming one.
		revealPanel(next, 0);
		slot?.animate([{ opacity: 1 }, { opacity: 0 }], {
			duration: 560,
			fill: 'forwards',
			easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
		});
	},

	unmount() {
		host = null;
	},
});
