import { defineSegment } from 'videowright';
import { mountSceneFrame, settle } from '../../components/scene-frame/index';
// The mark is imported, not referenced by URL: the dev and render servers serve
// the videowright entry from the package root, so a root-absolute path into this
// project would resolve against the package and 404. Importing it lets Vite serve
// the project's own file.
import logoUrl from '../../assets/brand/encore-commons-logo.png';

let host: HTMLElement | null = null;

/** The demo group, as the app's own "Use the demo group (Berlin)" button loads it. */
const PEOPLE = [
	{ name: 'Ada', likes: 'Radiohead · In the Mood for Love', dot: 'var(--color-accent)' },
	{ name: 'Bo', likes: 'Nina Simone · Seven Samurai', dot: 'var(--color-gold)' },
	{ name: 'Cy', likes: 'Daft Punk · Blade Runner', dot: 'var(--color-violet)' },
];

/**
 * Scene 1 — the group and the disagreement. One reveal: the mark and the
 * headline are already up, and the three people arrive on the beat. The product
 * mark appears here and nowhere else in the film, as a mark beside the name
 * rather than an opening or closing card.
 */
export default defineSegment({
	id: 'encore-context',
	advances: [4.0, 16.0],
	voiceover:
		'Three people, one night out, and no shared taste. Ada loves Radiohead and In the Mood for Love. Bo wants Nina Simone. Cy wants Daft Punk and Blade Runner. Encore Commons grounds each person\'s taste in real cultural data, then finds one venue they can all say yes to.',
	notes: 'Opening. The mark is used once and never returns.',

	mount(el) {
		host = el;
		const frame = mountSceneFrame(el, 'Different tastes. One great night.');
		frame.setContent(`
      <div style="position:absolute; left:var(--safe-x); right:var(--safe-x); top:170px;">

        <div data-ref="mark" style="display:flex; align-items:center; gap:36px; opacity:0;">
          <img src="${logoUrl}" alt="Encore Commons" style="height:92px; width:auto; display:block;" />
          <div style="font-family:var(--font-mono); font-size:20px; letter-spacing:0.14em; text-transform:uppercase; color:var(--color-muted); line-height:1.5;">
            Group venue agent<br />Qloo &middot; Apertus 1.5 70B
          </div>
        </div>

        <div data-ref="headline" style="
          font-family:var(--font-display);
          font-size:130px;
          line-height:1.0;
          letter-spacing:-0.01em;
          margin-top:60px;
          opacity:0;
        ">Three people.<br />No shared taste<span style="color:var(--color-accent);">.</span></div>

        <div data-ref="people" style="display:flex; gap:56px; margin-top:84px; opacity:0;">
          ${PEOPLE.map(
						(person) => `
            <div data-ref="person" style="flex:1 1 0; border-top:1px solid var(--color-border); padding-top:26px; opacity:0;">
              <div style="display:flex; align-items:center; gap:16px;">
                <span style="width:18px; height:18px; border-radius:50%; background:${person.dot}; display:block;"></span>
                <span style="font-family:var(--font-body); font-size:46px; font-weight:500; color:var(--color-fg);">${person.name}</span>
              </div>
              <div style="font-family:var(--font-body); font-size:30px; line-height:1.4; color:var(--color-soft); margin-top:14px;">${person.likes}</div>
            </div>`,
					).join('')}
        </div>
      </div>
    `);
	},

	async play(ctx) {
		const mark = host?.querySelector('[data-ref="mark"]') as HTMLElement | null;
		const headline = host?.querySelector('[data-ref="headline"]') as HTMLElement | null;
		const people = host?.querySelector('[data-ref="people"]') as HTMLElement | null;
		const frame = host?.querySelector('scene-frame') as HTMLElement | null;

		(frame as { reveal?: () => void } | null)?.reveal?.();
		settle(mark, 0);
		settle(headline, 160);

		await ctx.waitForNext();

		settle(people, 0);
		const cards = people?.querySelectorAll('[data-ref="person"]') ?? [];
		cards.forEach((card, index) => {
			(card as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], {
				duration: 480,
				delay: index * 120,
				fill: 'forwards',
				easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
			});
		});
	},

	unmount() {
		host = null;
	},
});
