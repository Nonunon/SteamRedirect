const ICON_BASE = "https://nonunon.github.io/SteamRedirect";

// Escape HTML to prevent XSS. Hoisted to module scope since both the
// workshop-redirect page AND the stats page render untrusted Steam titles.
function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Shared <head> boilerplate (favicons + stylesheet) that every page uses.
// `extra` is page-specific head content (og tags, refresh meta, preconnects, etc).
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

// Shared footer/icon block that every page ends with.
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

// Steam's per-game "small capsule" image lives at a predictable CDN URL
// derived purely from the app ID, so the icon itself never needs a request.
function gameIconUrl(appId) {
	return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`;
}

// Resolve an app ID to a game name via the Steam Store API, with a permanent
// KV cache (game names don't change, so no TTL on success). Only the NAME
// needs a network call here — the icon URL above is derived from the ID alone.
async function getGameName(appId, env, ctx) {
	if (!appId) return null;
	const cacheKey = `game:${appId}`;

	if (env.WORKSHOP_CACHE) {
		try {
			const cached = await env.WORKSHOP_CACHE.get(cacheKey);
			if (cached) {
				return JSON.parse(cached).name || null;
			}
		} catch (error) {
			console.error("Game name cache read error:", error);
		}
	}

	try {
		const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`);
		if (!response.ok) throw new Error(`Store API returned ${response.status}`);
		const json = await response.json();
		const entry = json[appId];
		const name = entry && entry.success && entry.data ? entry.data.name : null;

		if (env.WORKSHOP_CACHE) {
			ctx.waitUntil(
				env.WORKSHOP_CACHE.put(
					cacheKey,
					JSON.stringify({ name }),
					// Failed lookups (delisted/region-locked apps) get a short TTL so
					// we retry later. Successful lookups are permanent.
					name ? {} : { expirationTtl: 3600 }
				)
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

		// Handle /stats endpoint
		if (url.pathname === '/stats') {
			return handleStats(env);
		}

		const workshopId = url.searchParams.get("id");

		// Read the ?fast flag
		const fast = url.searchParams.has("fast");

		// If no ID provided, show the landing page with instructions
		if (!workshopId) {
			const landingHTML = generateLandingPage();
			return new Response(landingHTML, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "public, max-age=3600"
				}
			});
		}

		// Validate workshop ID format
		if (!/^\d+$/.test(workshopId)) {
			return new Response("Invalid workshop ID format", { status: 400 });
		}

		// Simple rate limiting (only for uncached requests to save KV writes)
		const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
		const rateLimitKey = `ratelimit:${clientIP}`;

		// Check cache first to avoid rate limiting cached requests
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

		// If we've already recorded this ID as not-found/private recently,
		// short-circuit without touching the Steam API or the rate limiter.
		if (cachedData && cachedData.notFound) {
			return new Response("Workshop item not found or is private", { status: 404 });
		}

		// Only rate limit if we need to hit Steam API (not cached)
		if (!cachedData && env.WORKSHOP_CACHE) {
			try {
				const rateData = await env.WORKSHOP_CACHE.get(rateLimitKey);
				const { count = 0, resetTime = Date.now() } = rateData ? JSON.parse(rateData) : {};

				// Reset counter every hour
				const now = Date.now();
				const hourInMs = 3600000;

				if (now > resetTime) {
					// Hour passed, reset counter
					ctx.waitUntil(
						env.WORKSHOP_CACHE.put(rateLimitKey, JSON.stringify({ count: 1, resetTime: now + hourInMs }), { expirationTtl: 3600 })
					);
				} else if (count >= 50) {
					// Limit: 50 uncached requests per hour per IP
					return new Response("Rate limit exceeded. Please try again later.", { status: 429 });
				} else {
					// Increment counter
					ctx.waitUntil(
						env.WORKSHOP_CACHE.put(rateLimitKey, JSON.stringify({ count: count + 1, resetTime }), { expirationTtl: 3600 })
					);
				}
			} catch (error) {
				console.error("Rate limit check error:", error);
				// Continue on error - don't block legitimate requests
			}
		}

		let workshopData;

		if (cachedData) {
			workshopData = cachedData;
		} else {
			// Fetch from Steam API
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

				// Validate response structure
				if (!json.response || !json.response.publishedfiledetails || !json.response.publishedfiledetails[0]) {
					return new Response("Invalid Steam API response", { status: 502 });
				}

				steamData = json.response.publishedfiledetails[0];

				// Check if the item exists (result = 1 means success)
				if (steamData.result !== 1) {
					// Negative-cache this ID briefly so repeated hits on a bad/private
					// link don't keep burning Steam API calls (and don't count toward
					// the requester's rate limit either, matching cached-hit behavior).
					if (env.WORKSHOP_CACHE) {
						ctx.waitUntil(
							env.WORKSHOP_CACHE.put(
								workshopId,
								JSON.stringify({ notFound: true }),
								{ expirationTtl: 300 } // 5 minutes
							)
						);
					}
					return new Response("Workshop item not found or is private", { status: 404 });
				}

			} catch (error) {
				console.error("Steam API fetch error:", error);
				return new Response("Failed to fetch Steam data: " + error.message, { status: 500 });
			}

			// Extract and validate data
			const title = steamData.title || "Untitled Workshop Item";
			const previewUrl = steamData.preview_url || "";

			// Which game this item belongs to. consumer_app_id is the game it's
			// used IN (creator_app_id is nearly always identical, but consumer is
			// the more semantically correct one — e.g. it's the field that would
			// diverge for editor/tool-published content).
			const appId = steamData.consumer_app_id || steamData.creator_app_id || null;
			const gameName = appId ? await getGameName(appId, env, ctx) : null;

			// Steam Workshop uses 16:9 aspect ratio for thumbnails
			// Use actual dimensions if provided, otherwise default to 16:9
			let imageWidth = steamData.preview_width;
			let imageHeight = steamData.preview_height;

			// If dimensions aren't provided or are invalid, use 16:9 defaults
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
				gameIconUrl: appId ? gameIconUrl(appId) : null,
				gameStoreUrl: appId ? `https://store.steampowered.com/app/${appId}` : null
			};

			// Store in KV cache with 7-day TTL
			if (env.WORKSHOP_CACHE) {
				try {
					ctx.waitUntil(
						env.WORKSHOP_CACHE.put(
							workshopId,
							JSON.stringify(workshopData),
							{ expirationTtl: 604800 } // 7 days
						)
					);
				} catch (error) {
					console.error("KV cache write error:", error);
				}
			}
		}

		// Track analytics: increment view counter for this workshop item
		if (env.WORKSHOP_CACHE) {
			const statsKey = `stats:${workshopId}`;
			ctx.waitUntil(
				env.WORKSHOP_CACHE.get(statsKey).then(data => {
					const currentData = data ? JSON.parse(data) : { count: 0, title: workshopData.title, lastViewed: null };
					currentData.count += 1;
					currentData.title = workshopData.title; // Update title in case it changed
					currentData.gameId = workshopData.gameId;
					currentData.gameName = workshopData.gameName;
					currentData.gameIconUrl = workshopData.gameIconUrl;
					currentData.gameStoreUrl = workshopData.gameStoreUrl;
					currentData.lastViewed = new Date().toISOString();
					// No expirationTtl: this is the permanent lifetime-total record.
					// (Previously had a 30-day TTL that reset on every view — meaning
					// only rarely-viewed items would ever silently vanish, and when
					// they did their whole history went with them, not just a reset
					// to zero. Dropping it makes every item's total permanent.)
					return env.WORKSHOP_CACHE.put(statsKey, JSON.stringify(currentData));
				}).catch(error => {
					console.error("Analytics tracking error:", error);
				})
			);
		}

		// Pass the fast flag into the HTML generator
		const html = generateWorkshopHTML({ ...workshopData, fast });

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "public, max-age=3600" // Browser cache for 1 hour
			}
		});
	}
};

async function handleStats(env) {
	if (!env.WORKSHOP_CACHE) {
		return new Response("Analytics not available", { status: 503 });
	}

	try {
		// List all keys with stats: prefix
		const { keys } = await env.WORKSHOP_CACHE.list({ prefix: 'stats:' });

		// Fetch all stats data
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

		// Sort by view count descending
		allStats.sort((a, b) => b.count - a.count);

		// Calculate totals
		const totalViews = allStats.reduce((sum, item) => sum + item.count, 0);
		const totalItems = allStats.length;

		// Generate HTML
		// NOTE: item.title comes from Steam and is untrusted — always escape it.
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
					<td class="game-icon-cell">${item.gameIconUrl ? `<a href="${item.gameStoreUrl}" target="_blank" title="${escapeHtml(item.gameName || 'View game on Steam')}"><img src="${item.gameIconUrl}" alt="${escapeHtml(item.gameName || 'Game icon')}" class="game-icon" loading="lazy" onerror="this.parentElement.style.display='none'"></a>` : ''}</td>
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
			<a href="/">← Back to SteamRedirect</a>
		</div>
	</div>

	${renderFooter()}
</body>
</html>`;

		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "public, max-age=300" // Cache for 5 minutes
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
	// Destructure fast along with the rest
	const { title, previewUrl, imageWidth, imageHeight, workshopUrl, steamClientUrl, fast } = data;

	const safeTitle = escapeHtml(title);
	const safePreviewUrl = escapeHtml(previewUrl);

	// Use dimensions from Steam API (with 16:9 fallback already applied)
	const ogWidth = imageWidth;
	const ogHeight = imageHeight;

	// Meta refresh obeys fast mode too
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

		// Fire the Steam client URI.
		// In fast mode: immediately. Normal mode: after 1 second (gives Discord's
		// embed scraper time to read the og: tags before we navigate away).
		setTimeout(() => {
			window.location.href = "${steamClientUrl}";
		}, fast ? 0 : 1000);

		// Fallback: if Steam didn't catch the URI, land on the workshop page.
		// Fast mode gives a 1.5-second window; normal mode gives 10 seconds.
		setTimeout(() => {
			window.location.href = "${workshopUrl}";
		}, fast ? 1500 : 10000);

		// Countdown display (skipped entirely in fast mode — it would flash by too
		// quickly to be useful anyway).
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
