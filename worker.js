const cache = new Map(); // Stores the last 1000 workshop requests

export default {
	async fetch(request, env) {
	  const url = new URL(request.url);
	  const workshopId = url.searchParams.get("id");

	  if (!workshopId) {
		return new Response("Missing workshop ID", { status: 400 });
	  }

	  // Check if data is in cache
	  if (cache.has(workshopId)) {
		console.log("Serving from cache:", workshopId);
	  } else {
		// Fetch workshop item data from Steam API
		const steamApiUrl = `https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/`;
		const steamApiKey = env.STEAM_API_KEY; // Use environment variable
		
		const formData = new URLSearchParams();
		formData.append("itemcount", "1");
		formData.append("publishedfileids[0]", workshopId);
		
		let steamData;
		try {
		  const response = await fetch(steamApiUrl, {
			method: "POST",
			body: formData,
		  });
		  const json = await response.json();
		  steamData = json.response.publishedfiledetails[0];
		} catch (error) {
		  return new Response("Failed to fetch Steam data", { status: 500 });
		}

		if (!steamData) {
		  return new Response("Invalid workshop ID", { status: 404 });
		}

		// Extract relevant data
		const title = steamData.title;
		const previewUrl = steamData.preview_url;
		const workshopUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`;
		const steamClientUrl = `steam://url/CommunityFilePage/${workshopId}`;

		// Store in cache
		if (cache.size >= 1000) {
		  // Remove the oldest entry if cache exceeds 1000 entries
		  const oldestKey = cache.keys().next().value;
		  cache.delete(oldestKey);
		}
		cache.set(workshopId, { title, previewUrl, workshopUrl });
	  }

	  // Get data (from cache or fresh API call)
	  const { title, previewUrl, workshopUrl } = cache.get(workshopId);
	  const steamClientUrl = `steam://url/CommunityFilePage/${workshopId}`;

	  // Dynamically generate HTML with Open Graph metadata and styles
	  const html = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>SteamRedirect::${title}</title>
			<meta property="og:type" content="website">
			<meta property="og:title" content="SteamRedirect::${title}">
			<meta property="og:image" content="${previewUrl}">
			<meta property="og:image:width" content="800">
			<meta property="og:image:height" content="600">
			<meta property="og:url" content="${workshopUrl}">
			<meta name="twitter:card" content="summary_large_image">
			<meta name="theme-color" content="#171a21">
			<link rel="icon" type="image/png" sizes="32x32" href="https://nonunon.github.io/SteamRedirect/images/SteamRedirect-32x32.png">
			<link rel="icon" type="image/png" sizes="16x16" href="https://nonunon.github.io/SteamRedirect/images/SteamRedirect-16x16.png">
			<meta http-equiv="refresh" content="10;url=${workshopUrl}">
			<link rel="stylesheet" href="https://nonunon.github.io/SteamRedirect/styles.css">
		</head>
		<body>
			<div class="rectangle">
				<div class="title" id="title">SteamRedirect</div>
				<div class="text">
					This page helps redirect <b><i>Steam Workshop</i></b> links for use in <b><i>Discord</i></b>, where direct linking via <u>steam://</u> is restricted. This should open the <b><i>Steam</i></b> item directly in your Steam client.
				</div>
				<div class="link-section" id="link-section">
					<p>Opening <a href="${workshopUrl}" target="_blank">
					<strong>${title || "Workshop Item"}</strong></a> in Steam...</p>
					<img src="${previewUrl}" alt="Preview Image" style="max-width: 100%; margin-top: 10px;" />
				</div>
				<div class="instructions">
					<p><b>How to Use SteamRedirect:</b></p>
					<p>
						1. Go to the <i>Steam Workshop</i> item you want to share. <br>
						2. Copy the Workshop ID in the URL after <code>?id=</code>. <br>
						3. Add it to this page’s URL as <code>?id=WORKSHOP_ID</code>. <br>
						4. Open the URL in your browser. <br>
						5. This page will open the item in your <i>Steam</i> client. <br>
						6. If <i>Steam</i> is closed, it will redirect to the Workshop page in <b><span id='countdown'>10</span> seconds</b>.
					</p>
				</div>
			</div>
			<div class="image-section">
				<a href="https://github.com/Nonunon/SteamRedirect" target="_blank">
					<img src="https://nonunon.github.io/SteamRedirect/images/SteamRedirect-512x512.png" alt="SteamRedirect Icon">
				</a>
			</div>
			<div class="footer">
				Created by <a href="https://github.com/Nonunon" target="_blank"><span>Nonunon</span></a>
			</div>
			<script>
				setTimeout(() => {
					window.location.href = "${steamClientUrl}";
				}, 1000);
				history.pushState(null, '', window.location.href); // Ensure page is in history
				setTimeout(() => {
	window.location.href = "${workshopUrl}";
				}, 10000);
			</script>
					<script>
				let countdown = 10;
				const countdownElement = document.getElementById('countdown');
				const countdownInterval = setInterval(() => {
					countdown--;
					countdownElement.textContent = countdown;
					if (countdown <= 0) {
						clearInterval(countdownInterval);
					}
				}, 1000);
			</script>
		</body>
		</html>
	  `;

	  return new Response(html, {
		headers: { "Content-Type": "text/html" },
	  });
	},
};
