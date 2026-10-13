/**
 * The framed screenshot panel used by the walkthrough scenes.
 *
 * Every panel in this film holds a PNG captured from the running application by
 * `scripts/capture-app.mjs`, so the picture is the product rather than a drawing
 * of it. The caption is part of the panel on purpose: a recorded interface is
 * labelled as recorded, and the timestamp and page are printed with it so nobody
 * has to guess which run a frame came from.
 */

const PANEL_CSS = `
  .pn-card {
    position: relative;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    overflow: hidden;
    box-shadow: none;
  }
  .pn-card img { display: block; width: 100%; height: auto; }
  .pn-caption {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding: 16px 20px;
    border-top: 1px solid var(--color-border);
    font-family: var(--font-mono);
    font-size: 17px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .pn-caption .pn-dot {
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--color-accent);
    flex: none;
  }
`;

export interface PanelOptions {
	/** Recorded screenshot, resolved by the bundler from an import. */
	imageUrl: string;
	alt: string;
	/** What the frame is: the page it was taken from, and how it was obtained. */
	caption: string;
}

/** Markup for one framed screenshot. Pair with `revealPanel`. */
export function panelHtml({ imageUrl, alt, caption }: PanelOptions): string {
	return `
    <style>${PANEL_CSS}</style>
    <div class="pn-card" data-ref="panel">
      <img src="${imageUrl}" alt="${alt}" />
      <div class="pn-caption"><span class="pn-dot"></span><span>${caption}</span></div>
    </div>
  `;
}

/** Settle a panel into place: a short fade with a small upward drift. */
export function revealPanel(el: HTMLElement | null, delayMs = 0): void {
	el?.animate(
		[
			{ opacity: 0, transform: 'translateY(18px)' },
			{ opacity: 1, transform: 'translateY(0)' },
		],
		{ duration: 560, delay: delayMs, fill: 'forwards', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
	);
}

/** A labelled figure for the stat rows: value first, then what it counts. */
export function statHtml(value: string, label: string, accent = false): string {
	return `
    <div data-ref="stat" style="flex:1 1 0; opacity:0;">
      <div style="font-family:var(--font-display); font-size:76px; line-height:1; color:${accent ? 'var(--color-accent)' : 'var(--color-fg)'};">${value}</div>
      <div style="font-family:var(--font-body); font-size:26px; line-height:1.35; color:var(--color-muted); margin-top:12px;">${label}</div>
    </div>
  `;
}

/** Reveal a stat row in sequence. */
export function revealStats(container: HTMLElement | null, stepMs = 110): void {
	const stats = container?.querySelectorAll('[data-ref="stat"]') ?? [];
	stats.forEach((stat, index) => {
		(stat as HTMLElement).animate(
			[
				{ opacity: 0, transform: 'translateY(14px)' },
				{ opacity: 1, transform: 'translateY(0)' },
			],
			{ duration: 460, delay: index * stepMs, fill: 'forwards', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
		);
	});
}
