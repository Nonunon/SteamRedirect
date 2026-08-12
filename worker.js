const ICON_BASE = "https://nonunon.github.io/SteamRedirect";

// escape untrusted Steam text before dropping it into HTML
function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
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
	return `<div class="image-section">
		<a href="https://github.com/Nonunon/SteamRedirect" target="_blank">
			<img src="${ICON_BASE}/images/SteamRedirect-512x512.png" alt="SteamRedirect Icon">
		</a>
	</div>
	<div class="footer">
		Created by <a href="https://github.com/Nonunon" target="_blank"><span>Nonunon</span></a>
	</div>`;
}

// hand-tuned icon overrides for games whose default crop looks bad
// 105600 = Terraria, library capsule was mostly logo text
const GAME_ICON_OVERRIDES = {
	105600: `https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg`
};

// base for Steam's content-hashed asset paths (see getGameInfo)
const STORE_ASSET_BASE = "https://shared.akamai.steamstatic.com/store_item_assets/";

// resolves name + current icon art via IStoreBrowseService/GetItems.
// can't guess the icon URL from appId alone anymore — Steam hashes asset
// paths and the hash changes when art updates, so this has to ask.
// cache gets a TTL (not permanent) so an art refresh heals itself.
async function getGameInfo(appId, env, ctx) {
	if (!appId) return { name: null, iconUrl: null };
	const cacheKey = `game:${appId}`;

	if (env.WORKSHOP_CACHE) {
		try {
			const cached = await env.WORKSHOP_CACHE.get(cacheKey);
			if (cached) {
				const parsed = JSON.parse(cached);
				// old cache entries only had {name} — treat as a miss
				if ("iconUrl" in parsed) {
					return { name: parsed.name || null, iconUrl: GAME_ICON_OVERRIDES[appId] || parsed.iconUrl || null };
				}
			}
		} catch (error) {
			console.error("Game info cache read error:", error);
		}
	}

	try {
		const inputJson = JSON.stringify({
			ids: [{ appid: Number(appId) }],
			context: { country_code: "US" },
			data_request: { include_assets: true }
		});
		const response = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(inputJson)}`);
		if (!response.ok) throw new Error(`GetItems returned ${response.status}`);
		const json = await response.json();
		const item = json?.response?.store_items?.[0];

		const name = item?.name || null;
		let iconUrl = null;
		if (item?.assets?.asset_url_format) {
			// prefer portrait capsule, fall back to header
			const filename = item.assets.library_capsule_2x || item.assets.library_capsule || item.assets.header;
			if (filename) {
				iconUrl = STORE_ASSET_BASE + item.assets.asset_url_format.replace("${FILENAME}", filename);
			}
		}

		if (env.WORKSHOP_CACHE) {
			ctx.waitUntil(
				env.WORKSHOP_CACHE.put(
					cacheKey,
					JSON.stringify({ name, iconUrl }),
					{ expirationTtl: 604800 } // 7d
				)
			);
		}

		return { name, iconUrl: GAME_ICON_OVERRIDES[appId] || iconUrl };
	} catch (error) {
		console.error("Game info lookup error:", error);
		return { name: null, iconUrl: null };
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
			const landingHTML = generateLandingPage();
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
					console.log("Serving from KV cache:", workshopId);
				}
			} catch (error) {
				console.error("KV cache read error:", error);
			}
		}

		// negative cache hit — bail before touching Steam or the rate limiter
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
			const { name: gameName, iconUrl: resolvedGameIconUrl } = appId
				? await getGameInfo(appId, env, ctx)
				: { name: null, iconUrl: null };

			let imageWidth = steamData.preview_width;
			let imageHeight = steamData.preview_height;

			// default to 16:9 if Steam didn't provide real dimensions
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
				gameName,
				gameIconUrl: resolvedGameIconUrl,
				gameStoreUrl: appId ? `https://store.steampowered.com/app/${appId}` : null
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
					currentData.gameId = workshopData.gameId;
					currentData.gameName = workshopData.gameName;
					currentData.gameIconUrl = workshopData.gameIconUrl;
					currentData.gameStoreUrl = workshopData.gameStoreUrl;
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
				gameName: statsData.gameName || null,
				gameIconUrl: statsData.gameIconUrl || null,
				gameStoreUrl: statsData.gameStoreUrl || null
			};
		});

		const allStats = (await Promise.all(statsPromises)).filter(s => s !== null);
		allStats.sort((a, b) => b.count - a.count);

		const totalViews = allStats.reduce((sum, item) => sum + item.count, 0);
		const totalItems = allStats.length;

		// item.title is untrusted, always escape it
		const html = `<!DOCTYPE html>
<html lang="en">
<head>
	${renderHead("SteamRedirect - Statistics")}
</head>
<body class="stats-body">
	<div class="stats-container">
		<div class="stats-header">
			<div class="title">SteamRedirect Statistics</div>
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
		<div class="table-wrapper">
		<table class="stats-table">
			<thead>
				<tr>
					<th class="game-icon-header" aria-label="Game"></th>
					<th style="width: 60px;">Rank</th>
					<th>Workshop Item</th>
					<th style="width: 100px; text-align: center;">Views</th>
					<th style="width: 180px;">Last Viewed</th>
				</tr>
			</thead>
			<tbody>
				${allStats.map((item, index) => `
				<tr>
					<td class="game-icon-cell">${item.gameIconUrl ? `<a href="${item.gameStoreUrl}" target="_blank" title="${escapeHtml(item.gameName || 'View game on Steam')}"><img src="${item.gameIconUrl}" alt="${escapeHtml(item.gameName || 'Game icon')}" class="game-icon" loading="lazy" data-full="${item.gameIconUrl}" data-name="${escapeHtml(item.gameName || '')}" onerror="this.parentElement.style.display='none'"></a>` : ''}</td>
					<td class="rank">#${index + 1}</td>
					<td><a href="${item.url}" target="_blank">${escapeHtml(item.title)}</a></td>
					<td style="text-align: center;">${item.count}</td>
					<td class="last-viewed">${new Date(item.lastViewed).toLocaleString()}</td>
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

	<div id="game-icon-backdrop" class="game-icon-backdrop"></div>
	<div id="game-icon-preview" class="game-icon-preview">
		<img id="game-icon-preview-img" src="" alt="">
		<div id="game-icon-preview-name" class="game-icon-preview-name"></div>
	</div>

	${renderFooter()}
	<script>
		(function() {
			const backdrop = document.getElementById('game-icon-backdrop');
			const preview = document.getElementById('game-icon-preview');
			const previewImg = document.getElementById('game-icon-preview-img');
			const previewName = document.getElementById('game-icon-preview-name');

			document.querySelectorAll('.game-icon').forEach(icon => {
				icon.addEventListener('mouseenter', () => {
					const full = icon.dataset.full;
					if (!full) return;
					previewImg.src = full;
					previewName.textContent = icon.dataset.name || '';

					// mirrors the CSS size so we don't measure mid-animation
					const previewWidth = Math.min(360, window.innerWidth * 0.22);
					const previewHeight = (previewWidth * 1.5) + 60;

					const rect = icon.getBoundingClientRect();
					const flipLeft = rect.right + 20 + previewWidth > window.innerWidth;
					let left = flipLeft ? rect.left - previewWidth - 20 : rect.right + 20;
					let top = Math.max(10, Math.min(rect.top - previewHeight / 3, window.innerHeight - previewHeight - 10));

					// grow from whichever side it's anchored to
					preview.style.transformOrigin = flipLeft ? 'right center' : 'left center';
					preview.style.left = left + 'px';
					preview.style.top = top + 'px';

					// force animation restart on rapid re-hover
					preview.classList.remove('visible');
					void preview.offsetWidth;
					preview.classList.add('visible');
					backdrop.classList.add('visible');
				});
				icon.addEventListener('mouseleave', () => {
					preview.classList.remove('visible');
					backdrop.classList.remove('visible');
				});
			});
		})();
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

function generateLandingPage() {
	const extraHead = `<meta property="og:type" content="website">
	<meta property="og:title" content="SteamRedirect - Steam Workshop Link Helper">
	<meta property="og:description" content="Share Steam Workshop items in Discord with direct client links">
	<meta property="og:image" content="${ICON_BASE}/images/SteamRedirect-512x512.png">
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
	<div class="rectangle">
		<div class="title" id="title">SteamRedirect</div>
		<div class="text">
			This page helps redirect <b><i>Steam Workshop</i></b> links for use in <b><i>Discord</i></b>, where direct linking via <u>steam://</u> is restricted. This should open the <b><i>Steam</i></b> item directly in your Steam client.
		</div>
		<div class="instructions">
			<p><b>How to Use SteamRedirect:</b></p>
			<p>
				1. Go to the <i>Steam Workshop</i> item you want to share. <br>
				2. Copy the Workshop ID in the URL after <code>?id=</code>. <br>
				3. Add it to this page's URL as <code>?id=WORKSHOP_ID</code>. <br>
				4. Open the URL in your browser. <br>
				5. This page will open the item in your <i>Steam</i> client. <br>
				6. If <i>Steam</i> is closed, it will redirect to the Workshop page in <b>10 seconds</b>.
			</p>
			<p style="margin-top: 20px;"><b>Example:</b></p>
			<p>
				<code>https://steamredirect.hi-nonunon.workers.dev/?id=123456789</code>
			</p>
			<p style="margin-top: 20px;"><b>Fast mode</b> (skips the 10-second wait):</p>
			<p>
				<code>https://steamredirect.hi-nonunon.workers.dev/?id=123456789&fast</code>
			</p>
		</div>
	</div>
	${renderFooter()}
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
	<div class="rectangle">
		<div class="title" id="title">SteamRedirect</div>
		<div class="text">
			This page helps redirect <b><i>Steam Workshop</i></b> links for use in <b><i>Discord</i></b>, where direct linking via <u>steam://</u> is restricted. This should open the <b><i>Steam</i></b> item directly in your Steam client.
		</div>
		<div class="link-section" id="link-section">
			<p>Opening <a href="${workshopUrl}" target="_blank">
			<strong>${safeTitle}</strong></a> in Steam...</p>
			${previewUrl ? `<img src="${safePreviewUrl}" alt="Preview Image" style="max-width: 100%; margin-top: 10px; height: auto;" />` : ''}
		</div>
		<div class="instructions">
			<p><b>How to Use SteamRedirect:</b></p>
			<p>
				1. Go to the <i>Steam Workshop</i> item you want to share. <br>
				2. Copy the Workshop ID in the URL after <code>?id=</code>. <br>
				3. Add it to this page's URL as <code>?id=WORKSHOP_ID</code>. <br>
				4. Open the URL in your browser. <br>
				5. This page will open the item in your <i>Steam</i> client. <br>
				6. If <i>Steam</i> is closed, it will redirect to the Workshop page in <b><span id='countdown'>${refreshDelay}</span> seconds</b>.
			</p>
		</div>
	</div>
	${renderFooter()}
	<script>
		const fast = ${fast ? 'true' : 'false'};

		// wait 1s in normal mode so Discord can scrape og: tags first
		setTimeout(() => {
			window.location.href = "${steamClientUrl}";
		}, fast ? 0 : 1000);

		// fallback to workshop page if Steam didn't catch the URI
		setTimeout(() => {
			window.location.href = "${workshopUrl}";
		}, fast ? 1500 : 10000);

		if (!fast) {
			let countdown = 10;
			const countdownElement = document.getElementById('countdown');
			const countdownInterval = setInterval(() => {
				countdown--;
				countdownElement.textContent = countdown;
				if (countdown <= 0) {
					clearInterval(countdownInterval);
				}
			}, 1000);
		}
	</script>
</body>
</html>`;
}
