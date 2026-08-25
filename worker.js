// served from public/ via the assets binding, not GitHub Pages
const ICON_BASE = "";

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// server-rendered fallback for the /stats "Last Viewed" cell, shown until the
// client-side script (which knows the visitor's actual timezone) replaces it.
// Uses UTC explicitly rather than the Worker's local time, since that's not
// guaranteed to match the visitor's; the label makes the offset honest.
function formatLastViewedFallback(iso) {
	const d = new Date(iso);
	if (!iso || isNaN(d)) return 'Never';

	const pad = n => String(n).padStart(2, '0');
	const date = `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;
	let hours = d.getUTCHours();
	const ampm = hours >= 12 ? 'PM' : 'AM';
	hours = hours % 12 || 12;
	const time = `${pad(hours)}:${pad(d.getUTCMinutes())} ${ampm} UTC`;

	return `<span class="lv-date">${date}</span><span class="lv-time">${time}</span>`;
}

// shared <head>; extra = page-specific tags
function renderHead(title, extra = "") {
	return `<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title}</title>
	<meta name="theme-color" content="#171a21">
	${extra}
	<link rel="icon" type="image/png" sizes="32x32" href="${ICON_BASE}/images/SteamRedirect-32x32.png">
	<link rel="icon" type="image/png" sizes="16x16" href="${ICON_BASE}/images/SteamRedirect-16x16.png">
	<link rel="stylesheet" href="${ICON_BASE}/styles.css">`;
}

function renderFooter() {
	return `<a href="https://github.com/Nonunon/SteamRedirect" target="_blank" rel="noopener" class="credit">
		<img src="${ICON_BASE}/images/SteamRedirect-32x32.png" alt="">
		<span>SteamRedirect on GitHub</span>
	</a>`;
}

// wraps content in the .rectangle card, with the title floated on top of it
function renderCard(innerHtml, extraClass = "") {
	return `<div class="card">
		<div class="rectangle${extraClass ? ' ' + extraClass : ''}">
			${innerHtml}
		</div>
		<a href="/" class="title" id="title">SteamRedirect</a>
	</div>`;
}

function renderIntro() {
	return `<div class="text">
			This page helps redirect <b><i>Steam Workshop</i></b> links for use in <b><i>Discord</i></b>, where direct linking via <u>steam://</u> is restricted. This should open the <b><i>Steam</i></b> item directly in your Steam client.
		</div>`;
}

// countdownSeconds: pass a number for the live workshop-page countdown, omit for the static landing-page text
function renderInstructions(countdownSeconds = null) {
	const step6 = countdownSeconds !== null
		? `<b><span id='countdown'>${countdownSeconds}</span> seconds</b>`
		: `<b>10 seconds</b>`;

	return `<p><b>How to Use SteamRedirect:</b></p>
			<ol class="steps">
				<li>Go to the <i>Steam Workshop</i> item you want to share.</li>
				<li>Copy the Workshop ID in the URL after <code>?id=</code>.</li>
				<li>Add it to this page's URL as <code>?id=WORKSHOP_ID</code>.</li>
				<li>Open the URL in your browser.</li>
				<li>This page will open the item in your <i>Steam</i> client.</li>
				<li>If <i>Steam</i> is closed, it will redirect to the Workshop page in ${step6}.</li>
			</ol>`;
}

// resolves an app ID to its game name via IStoreBrowseService/GetItems, cached permanently
async function getGameName(appId, env, ctx) {
	if (!appId) return null;
	const cacheKey = `game:${appId}`;

	if (env.WORKSHOP_CACHE) {
		try {
			const cached = await env.WORKSHOP_CACHE.get(cacheKey);
			if (cached) return JSON.parse(cached).name || null;
		} catch (error) {
			console.error("Game name cache read error:", error);
		}
	}

	try {
		const inputJson = JSON.stringify({
			ids: [{ appid: Number(appId) }],
			context: { country_code: "US" }
		});
		const response = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(inputJson)}`);
		if (!response.ok) throw new Error(`GetItems returned ${response.status}`);
		const json = await response.json();
		const name = json?.response?.store_items?.[0]?.name || null;

		if (env.WORKSHOP_CACHE) {
			ctx.waitUntil(
				env.WORKSHOP_CACHE.put(cacheKey, JSON.stringify({ name }), name ? {} : { expirationTtl: 3600 })
			);
		}

		return name;
	} catch (error) {
		console.error("Game name lookup error:", error);
		return null;
	}
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === '/stats') {
			return handleStats(env);
		}

		const workshopId = url.searchParams.get("id");
		const fast = url.searchParams.has("fast");

		if (!workshopId) {
			const landingHTML = generateLandingPage(url.origin);
			return new Response(landingHTML, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "public, max-age=3600"
				}
			});
		}

		if (!/^\d+$/.test(workshopId)) {
			return new Response("Invalid workshop ID format", { status: 400 });
		}

		// rate limit only applies to uncached requests
		const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
		const rateLimitKey = `ratelimit:${clientIP}`;

		let cachedData = null;
		if (env.WORKSHOP_CACHE) {
			try {
				const cached = await env.WORKSHOP_CACHE.get(workshopId);
				if (cached) {
					cachedData = JSON.parse(cached);
				}
			} catch (error) {
				console.error("KV cache read error:", error);
			}
		}

		// negative cache hit: bail before touching Steam or the rate limiter
		if (cachedData && cachedData.notFound) {
			return new Response("Workshop item not found or is private", { status: 404 });
		}

		if (!cachedData && env.WORKSHOP_CACHE) {
			try {
				const rateData = await env.WORKSHOP_CACHE.get(rateLimitKey);
				const { count = 0, resetTime = Date.now() } = rateData ? JSON.parse(rateData) : {};
				const now = Date.now();
				const hourInMs = 3600000;

				if (now > resetTime) {
					ctx.waitUntil(
						env.WORKSHOP_CACHE.put(rateLimitKey, JSON.stringify({ count: 1, resetTime: now + hourInMs }), { expirationTtl: 3600 })
					);
				} else if (count >= 50) {
					return new Response("Rate limit exceeded. Please try again later.", { status: 429 });
				} else {
					ctx.waitUntil(
						env.WORKSHOP_CACHE.put(rateLimitKey, JSON.stringify({ count: count + 1, resetTime }), { expirationTtl: 3600 })
					);
				}
			} catch (error) {
				console.error("Rate limit check error:", error);
			}
		}

		let workshopData;

		if (cachedData) {
			workshopData = cachedData;
		} else {
			const steamApiUrl = `https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/`;

			const formData = new URLSearchParams();
			formData.append("itemcount", "1");
			formData.append("publishedfileids[0]", workshopId);

			let steamData;
			try {
				const response = await fetch(steamApiUrl, {
					method: "POST",
					body: formData,
					headers: {
						"Content-Type": "application/x-www-form-urlencoded"
					}
				});

				if (!response.ok) {
					throw new Error(`Steam API returned ${response.status}`);
				}

				const json = await response.json();

				if (!json.response || !json.response.publishedfiledetails || !json.response.publishedfiledetails[0]) {
					return new Response("Invalid Steam API response", { status: 502 });
				}

				steamData = json.response.publishedfiledetails[0];

				if (steamData.result !== 1) {
					// negative cache so repeat hits on a bad link skip the API
					if (env.WORKSHOP_CACHE) {
						ctx.waitUntil(
							env.WORKSHOP_CACHE.put(
								workshopId,
								JSON.stringify({ notFound: true }),
								{ expirationTtl: 300 }
							)
						);
					}
					return new Response("Workshop item not found or is private", { status: 404 });
				}

			} catch (error) {
				console.error("Steam API fetch error:", error);
				return new Response("Failed to fetch Steam data: " + error.message, { status: 500 });
			}

			const title = steamData.title || "Untitled Workshop Item";
			const previewUrl = steamData.preview_url || "";

			// consumer_app_id = the game this item is used in
			const appId = steamData.consumer_app_id || steamData.creator_app_id || null;
			const gameName = appId ? await getGameName(appId, env, ctx) : null;

			let imageWidth = steamData.preview_width;
			let imageHeight = steamData.preview_height;

			if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
				imageWidth = 1280;
				imageHeight = 720;
			}

			workshopData = {
				title,
				previewUrl,
				imageWidth,
				imageHeight,
				workshopUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`,
				steamClientUrl: `steam://url/CommunityFilePage/${workshopId}`,
				gameId: appId,
				gameName
			};

			if (env.WORKSHOP_CACHE) {
				try {
					ctx.waitUntil(
						env.WORKSHOP_CACHE.put(
							workshopId,
							JSON.stringify(workshopData),
							{ expirationTtl: 604800 } // 7d
						)
					);
				} catch (error) {
					console.error("KV cache write error:", error);
				}
			}
		}

		if (env.WORKSHOP_CACHE) {
			const statsKey = `stats:${workshopId}`;
			ctx.waitUntil(
				env.WORKSHOP_CACHE.get(statsKey).then(data => {
					const currentData = data ? JSON.parse(data) : { count: 0, title: workshopData.title, lastViewed: null };
					currentData.count += 1;
					currentData.title = workshopData.title;
					if (workshopData.gameId) currentData.gameId = workshopData.gameId;
					if (workshopData.gameName) currentData.gameName = workshopData.gameName;
					currentData.lastViewed = new Date().toISOString();
					// no TTL: view totals are permanent
					return env.WORKSHOP_CACHE.put(statsKey, JSON.stringify(currentData));
				}).catch(error => {
					console.error("Analytics tracking error:", error);
				})
			);
		}

		const html = generateWorkshopHTML({ ...workshopData, fast });

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "public, max-age=3600"
			}
		});
	}
};

async function handleStats(env) {
	if (!env.WORKSHOP_CACHE) {
		return new Response("Analytics not available", { status: 503 });
	}

	try {
		const { keys } = await env.WORKSHOP_CACHE.list({ prefix: 'stats:' });

		const statsPromises = keys.map(async key => {
			const data = await env.WORKSHOP_CACHE.get(key.name);
			if (!data) return null;

			const statsData = JSON.parse(data);
			const workshopId = key.name.replace('stats:', '');

			return {
				id: workshopId,
				title: statsData.title || 'Unknown',
				count: statsData.count || 0,
				lastViewed: statsData.lastViewed || 'Never',
				url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`,
				gameName: statsData.gameName || null
			};
		});

		const allStats = (await Promise.all(statsPromises)).filter(s => s !== null);
		allStats.sort((a, b) => b.count - a.count);

		const totalViews = allStats.reduce((sum, item) => sum + item.count, 0);
		const totalItems = allStats.length;
		const uniqueGames = [...new Set(allStats.map(s => s.gameName).filter(Boolean))].sort();

		// item.title is untrusted, always escape it
		const html = `<!DOCTYPE html>
<html lang="en">
<head>
	${renderHead("SteamRedirect - Statistics", `<link rel="stylesheet" href="${ICON_BASE}/vendor/simplebar.min.css">`)}
	<script src="${ICON_BASE}/vendor/simplebar.min.js" defer></script>
</head>
<body class="stats-body">
	<div class="stats-container">
		<div class="stats-header">
			<a href="/" class="title">SteamRedirect Statistics</a>
		</div>

		<div class="stats-summary">
			<div class="stat-card">
				<div class="stat-number">${totalViews.toLocaleString()}</div>
				<div class="stat-label">Total Views</div>
			</div>
			<div class="stat-card">
				<div class="stat-number">${totalItems.toLocaleString()}</div>
				<div class="stat-label">Unique Items</div>
			</div>
			<div class="stat-card">
				<div class="stat-number">${totalItems > 0 ? Math.round(totalViews / totalItems) : 0}</div>
				<div class="stat-label">Avg Views per Item</div>
			</div>
		</div>

		${allStats.length > 0 ? `
		<div class="stats-filter">
			<select id="game-filter">
				<option value="all">All</option>
				${uniqueGames.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}
			</select>
		</div>
		<div class="table-wrapper">
		<table class="stats-table">
			<thead>
				<tr>
					<th class="col-rank" data-sort="rank">Rank</th>
					<th data-sort="title">Workshop Item</th>
					<th class="col-views" data-sort="views">Views</th>
					<th class="col-lastviewed" data-sort="lastviewed">Last Viewed</th>
				</tr>
			</thead>
			<tbody>
				${allStats.map((item, index) => `
				<tr data-game="${escapeHtml(item.gameName || '')}" data-rank="${index + 1}" data-title="${escapeHtml(item.title)}" data-views="${item.count}">
					<td class="rank col-rank">#${index + 1}</td>
					<td class="item-cell"><a href="${item.url}" target="_blank" class="item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</a></td>
					<td class="col-views">${item.count}</td>
					<td class="last-viewed col-lastviewed" data-iso="${escapeHtml(item.lastViewed)}">${formatLastViewedFallback(item.lastViewed)}</td>
				</tr>
				`).join('')}
			</tbody>
		</table>
		</div>
		` : '<p style="text-align: center; color: #c7d5e0;">No statistics available yet.</p>'}

		<div class="back-link">
			<a href="/" class="nav-button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Back to SteamRedirect</a>
		</div>
	</div>

	${renderFooter()}
	<script>
		document.getElementById('game-filter')?.addEventListener('change', (e) => {
			const selected = e.target.value;
			document.querySelectorAll('.stats-table tbody tr').forEach(row => {
				row.style.display = (selected === 'all' || row.dataset.game === selected) ? '' : 'none';
			});
		});

		// click-to-sort on the table headers. Deliberately understated: no
		// visible sort icons except a tiny arrow on whichever column is
		// currently active, so it's discoverable by clicking around rather
		// than announced up front.
		(() => {
			const tbody = document.querySelector('.stats-table tbody');
			if (!tbody) return;

			// each column's comparator reads directly off the row's data-*
			// attributes (set server-side) rather than re-parsing cell text
			const getters = {
				rank: row => Number(row.dataset.rank),
				title: row => row.dataset.title || '',
				views: row => Number(row.dataset.views),
				// rows with no real timestamp ('Never') sort as the oldest
				// possible date, landing consistently at one end either way
				lastviewed: row => {
					const iso = row.querySelector('.last-viewed')?.dataset.iso;
					const time = iso ? new Date(iso).getTime() : NaN;
					return isNaN(time) ? 0 : time;
				}
			};

			// direction a first click on each column starts with; the
			// "obviously useful" direction for that kind of data
			const defaultDirection = { rank: 'asc', title: 'asc', views: 'desc', lastviewed: 'desc' };

			const applySort = (column, direction) => {
				const getter = getters[column];
				const rows = [...tbody.querySelectorAll('tr')];
				rows.sort((a, b) => {
					const av = getter(a);
					const bv = getter(b);
					const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
					return direction === 'asc' ? cmp : -cmp;
				});
				rows.forEach(row => tbody.appendChild(row));

				// scroll position was meaningful for the old row order, not the new one
				const contentWrapper = document.querySelector('.table-wrapper .simplebar-content-wrapper');
				if (contentWrapper) contentWrapper.scrollTop = 0;
			};

			const setArrow = th => {
				document.querySelectorAll('.stats-table thead th[data-sort] .sort-arrow').forEach(el => el.remove());
				if (!th) return;
				const arrow = document.createElement('span');
				arrow.className = 'sort-arrow';
				arrow.textContent = th.dataset.currentDirection === 'asc' ? ' ▲' : ' ▼';
				th.appendChild(arrow);
			};

			// each column cycles through 3 clicks: its default direction, the
			// opposite direction, then back to the table's plain default
			// (rank ascending, no arrow shown) rather than toggling forever
			let activeColumn = null;
			let clickStep = 0;

			document.querySelectorAll('.stats-table thead th[data-sort]').forEach(th => {
				th.addEventListener('click', () => {
					const column = th.dataset.sort;
					if (column !== activeColumn) clickStep = 0;
					clickStep = (clickStep + 1) % 3;
					activeColumn = column;

					if (clickStep === 0) {
						applySort('rank', 'asc');
						setArrow(null);
						activeColumn = null;
						return;
					}

					const direction = clickStep === 1 ? defaultDirection[column] : (defaultDirection[column] === 'asc' ? 'desc' : 'asc');
					applySort(column, direction);
					th.dataset.currentDirection = direction;
					setArrow(th);
				});
			});
		})();

		// formatted here, not server-side, so it reflects the viewer's own timezone
		document.querySelectorAll('.last-viewed[data-iso]').forEach(cell => {
			const iso = cell.dataset.iso;
			const d = new Date(iso);
			if (!iso || isNaN(d)) {
				cell.textContent = 'Never';
				return;
			}
			const date = d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
			const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
			cell.innerHTML = '<span class="lv-date"></span><span class="lv-time"></span>';
			cell.querySelector('.lv-date').textContent = date;
			cell.querySelector('.lv-time').textContent = time;
		});

		// this script runs immediately during parsing, before the deferred
		// SimpleBar script; DOMContentLoaded always fires after deferred scripts
		// finish, so waiting for it guarantees window.SimpleBar exists. Scoped to
		// just this one element, not the page-wide data-simplebar auto-init.
		document.addEventListener('DOMContentLoaded', () => {
			const wrapper = document.querySelector('.table-wrapper');
			if (!wrapper || !window.SimpleBar) return;

			new SimpleBar(wrapper);

			// the sticky <thead> lives inside SimpleBar's scrolled content, so its
			// track spans the whole thing including the header row; offset the
			// track to start below the header instead, so the thumb only ever
			// covers the body rows it's actually representing
			const thead = wrapper.querySelector('thead');
			const track = wrapper.querySelector('.simplebar-track.simplebar-vertical');
			if (thead && track) {
				const syncTrackOffset = () => {
					track.style.top = thead.offsetHeight + 'px';
				};
				syncTrackOffset();
				new ResizeObserver(syncTrackOffset).observe(thead);
			}
		});
	</script>
</body>
</html>`;

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "public, max-age=300"
			}
		});

	} catch (error) {
		console.error("Stats error:", error);
		return new Response("Failed to load statistics: " + error.message, { status: 500 });
	}
}

function generateLandingPage(origin) {
	const extraHead = `<meta property="og:type" content="website">
	<meta property="og:title" content="SteamRedirect - Steam Workshop Link Helper">
	<meta property="og:description" content="Share Steam Workshop items in Discord with direct client links">
	<meta property="og:image" content="${origin}/images/SteamRedirect-512x512.png">
	<meta name="twitter:card" content="summary">
	<link rel="dns-prefetch" href="//steamcommunity.com">
	<link rel="preconnect" href="https://steamcommunity.com">`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
	${renderHead("SteamRedirect - Steam Workshop Link Helper", extraHead)}
</head>
<body>
	<a href="/stats" class="nav-button stats-corner-link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>Stats</a>
	${renderCard(`
		${renderIntro()}
		<div class="instructions">
			${renderInstructions()}
			<p style="margin-top: 20px;"><b>Example:</b></p>
			<div class="code-row">
				<code>https://steamredirect.hi-nonunon.workers.dev/?id=1923990111</code>
				<button class="copy-btn" data-copy="https://steamredirect.hi-nonunon.workers.dev/?id=1923990111" title="Copy" aria-label="Copy example URL"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
			</div>
			<p style="margin-top: 20px;"><b>Fast mode</b> (skips the 10-second wait):</p>
			<div class="code-row">
				<code>https://steamredirect.hi-nonunon.workers.dev/?id=1923990111&fast</code>
				<button class="copy-btn" data-copy="https://steamredirect.hi-nonunon.workers.dev/?id=1923990111&fast" title="Copy" aria-label="Copy fast mode URL"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
			</div>
			<p class="fast-hint">Fast mode fires the Steam launch immediately, no countdown. The <a href="https://github.com/Nonunon/SteamRedirect" target="_blank">SteamRedirect userscript</a> can also auto-close the tab afterward.</p>
		</div>
	`)}
	<div class="rectangle converter-box">
		<div class="converter-label">Convert a Workshop link</div>
		<div class="converter-input-row">
			<input type="text" id="converter-input" class="converter-input" placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=EXAMPLE" autocomplete="off">
			<button class="copy-btn" id="converter-copy-btn" title="Copy" aria-label="Copy converted URL" hidden><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
		</div>
		<div class="converter-options">
			<label class="fast-toggle">
				<input type="checkbox" id="fast-toggle-input">
				<span class="fast-toggle-track"><span class="fast-toggle-thumb"></span></span>
				Fast mode
			</label>
			<button type="button" id="convert-btn" class="nav-button">Convert</button>
		</div>
		<div id="converter-error" class="converter-error" hidden></div>
	</div>
	${renderFooter()}
	<script>
		document.querySelectorAll('.copy-btn').forEach(btn => {
			btn.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(btn.dataset.copy);
					btn.classList.add('copied');
					setTimeout(() => btn.classList.remove('copied'), 1200);
				} catch (error) {
					console.error('Copy failed:', error);
				}
			});
		});

		function extractWorkshopId(raw) {
			const trimmed = raw.trim();
			if (!trimmed) return null;
			// \\d, not \d: this text is itself inside an outer template literal
			if (/^\\d+$/.test(trimmed)) return trimmed;
			const match = trimmed.match(/[?&]id=(\\d+)/);
			return match ? match[1] : null;
		}

		const converterInput = document.getElementById('converter-input');
		const convertBtn = document.getElementById('convert-btn');
		const converterBox = document.querySelector('.converter-box');
		const converterError = document.getElementById('converter-error');
		const converterCopyBtn = document.getElementById('converter-copy-btn');
		const fastToggle = document.getElementById('fast-toggle-input');

		function runConvert() {
			const id = extractWorkshopId(converterInput.value);
			if (!id) {
				converterError.textContent = "Couldn't find a workshop ID in that. Paste the full Workshop URL or just the numeric ID.";
				converterError.hidden = false;
				return;
			}
			converterError.hidden = true;
			const converted = window.location.origin + '/?id=' + id + (fastToggle.checked ? '&fast' : '');
			converterInput.value = converted;
			converterCopyBtn.dataset.copy = converted;
			converterCopyBtn.hidden = false;
			converterBox.classList.add('expanded');

			// best-effort auto-copy; the visible button is still a manual fallback
			navigator.clipboard.writeText(converted).then(() => {
				converterCopyBtn.classList.add('copied');
				setTimeout(() => converterCopyBtn.classList.remove('copied'), 1200);
			}).catch(error => {
				console.error('Auto-copy failed:', error);
			});
		}

		convertBtn.addEventListener('click', runConvert);
		converterInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') runConvert();
		});
	</script>
</body>
</html>`;
}

function generateWorkshopHTML(data) {
	const { title, previewUrl, imageWidth, imageHeight, workshopUrl, steamClientUrl, fast } = data;

	const safeTitle = escapeHtml(title);
	const safePreviewUrl = escapeHtml(previewUrl);
	const ogWidth = imageWidth;
	const ogHeight = imageHeight;
	const refreshDelay = fast ? 2 : 10;

	const extraHead = `<meta property="og:type" content="website">
	<meta property="og:title" content="SteamRedirect::${safeTitle}">
	<meta property="og:image" content="${safePreviewUrl}">
	<meta property="og:image:width" content="${ogWidth}">
	<meta property="og:image:height" content="${ogHeight}">
	<meta property="og:url" content="${workshopUrl}">
	<meta name="twitter:card" content="summary_large_image">
	<meta http-equiv="refresh" content="${refreshDelay};url=${workshopUrl}">`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
	${renderHead(`SteamRedirect::${safeTitle}`, extraHead)}
</head>
<body>
	${renderCard(`
		${renderIntro()}
		<div class="link-section" id="link-section">
			<p>Opening <a href="${workshopUrl}" target="_blank">
			<strong>${safeTitle}</strong></a> in Steam...</p>
			${previewUrl ? `<img src="${safePreviewUrl}" alt="Preview Image" style="max-width: 100%; margin-top: 10px; height: auto;" />` : ''}
		</div>
		<div class="instructions">
			${renderInstructions(refreshDelay)}
		</div>
	`)}
	${renderFooter()}
	<script>
		const fast = ${fast ? 'true' : 'false'};

		// this delay isn't for Discord's scraper (it reads og: tags from the raw
		// HTML, no JS involved); it gives the browser's async steam:// permission
		// check room to resolve before the fallback navigation below can cancel
		// it mid-flight.
		setTimeout(() => {
			window.location.href = "${steamClientUrl}";
		}, fast ? 0 : 1000);

		setTimeout(() => {
			window.location.href = "${workshopUrl}";
		}, fast ? 300 : 10000);

		if (!fast) {
			let countdown = ${refreshDelay};
			const countdownElement = document.getElementById('countdown');
			const countdownInterval = setInterval(() => {
				countdown--;
				countdownElement.textContent = countdown;
				countdownElement.classList.remove('tick');
				void countdownElement.offsetWidth; // forces reflow so the animation replays
				countdownElement.classList.add('tick');
				if (countdown <= 3) {
					countdownElement.classList.add('urgent');
				}
				if (countdown <= 0) {
					clearInterval(countdownInterval);
				}
			}, 1000);
		}
	</script>
</body>
</html>`;
}
