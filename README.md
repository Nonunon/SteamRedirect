
# SteamRelink

SteamRelink is a project designed to redirect specific links seamlessly, especially for sharing on Discord. By appending a Steam Workshop ID to the URL, users are directed to the corresponding Steam Workshop page, making link management easy and efficient.

## Repository Purpose

This repository is the source for the SteamRelink Cloudflare Worker. Redirect logic, styling, and static assets deploy together as one unit via [Wrangler](https://developers.cloudflare.com/workers/wrangler/). It previously used GitHub Pages for the stylesheet and images; that's no longer the case.

To deploy your own copy, copy [`wrangler.toml.example`](wrangler.toml.example) to `wrangler.toml` and fill in your own KV namespace ID.

## Features

- **URL Redirection**: Redirects links based on Steam Workshop IDs.
- **Optimized for Discord**: Tailored for cleaner link handling in Discord channels.
- **Lightweight & Simple**: Minimal and easy to use.
- **Supports Unlisted Workshop Files**: Allows sharing of unlisted Steam Workshop files, as long as they are not private or restricted to friends-only visibility.
- **Link Converter**: Paste a full Steam Workshop URL, or just the numeric ID, into the built-in converter on the homepage and get a ready-to-share SteamRelink link, copied to your clipboard automatically.
- **Usage Stats**: Visit [/stats](https://steamre.link/stats) to see total views, per-item view counts, and which game each linked item belongs to, with a filter to narrow the list down to one game.

## How to Use

To redirect, use the following format:
```
https://steamre.link/?id=[WORKSHOP_ID]
```

<details>
<summary>Fast URL</summary>
	
```
https://steamre.link/?id=[WORKSHOP_ID]&fast
```

No countdown, no delay, just an **instant** launch. Pair it with the [SteamRelink userscript](#install-the-steamrelink-button-for-steam-workshop-pages) and it can even auto-close the tab once Steam picks it up (Tampermonkey and Violentmonkey only, Greasemonkey doesn't support it yet). On by default, but there's a menu toggle if you'd rather it just behave normally.

</details>


- Replace `[WORKSHOP_ID]` with the relevant Steam Workshop ID to generate the link.

Want it quicker? *Fast mode* skips the countdown and fires Steam right away, no waiting around.

Prefer not to build the link by hand? [The homepage](https://steamre.link/) has a built-in converter. Paste your Workshop link, hit Convert, and it's copied for you.

## Create Your SteamRelink Bookmarklet

To easily redirect Steam Workshop links, you can create a bookmarklet by following these steps:

1. **Copy the code below**:
```javascript
    (function() {
        const url = window.location.href;
        const match = url.match(/steamcommunity\.com\/(?:sharedfiles|workshop)\/filedetails\/\?id=(\d+)/);
        if (match && match[1]) {
            const workshopId = match[1];
            const redirectUrl = `https://steamre.link/?id=${workshopId}`;
            window.location.href = redirectUrl;
        } else {
            alert("This is not a valid Steam Workshop link.");
        }
    })();
```

<details>
<summary>Fast URL Bookmarklet</summary>

```javascript
(function() {
    const url = window.location.href;
    const match = url.match(/steamcommunity\.com\/(?:sharedfiles|workshop)\/filedetails\/\?id=(\d+)/);
    if (match && match[1]) {
        window.location.href = `https://steamre.link/?id=${match[1]}&fast`;
    } else {
        alert("This is not a valid Steam Workshop link.");
    }
})();
```

Same fast mode, just as a bookmarklet instead of a link.

</details>

2. **Open your browser’s bookmarks bar**.
3. **Create a new bookmark** and paste the code into the **URL** field of the bookmark.
4. **Name the bookmark** something memorable, like "SteamRelink".
5. **Use the Bookmarklet**: Whenever you're on a Steam Workshop page, click this bookmark to automatically redirect to SteamRelink with the correct Workshop ID.

Now you’re ready to quickly and easily convert Workshop links!

## Install the SteamRelink Button for Steam Workshop Pages

To add a convenient "SteamRelink" button directly to Steam Workshop pages, follow these steps:

### Requirements

To use this project, you’ll need one of the following user script managers installed in your browser:

- [Violentmonkey](https://violentmonkey.github.io/get-it/)
- [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/)
- [Tampermonkey](https://www.tampermonkey.net/)

### Instructions
1. Click the **Install User Script** button below.
2. Tampermonkey, Greasemonkey, or Violentmonkey will open with an option to install the script.
3. Confirm the installation, and the script will be ready to use on Steam Workshop pages.

Once installed, visiting a Steam Workshop item page adds a **SteamRelink** button in the top-right corner. Hover it to open a dropdown with:
- **Fast Redirect**: jumps straight to fast mode, no countdown.
- **Copy Redirect Link**: copies the normal SteamRelink URL to your clipboard.
- **Copy Fast Redirect Link**: copies the fast-mode URL to your clipboard.

The script also auto-closes fast-mode SteamRelink tabs shortly after Steam picks up the link (Tampermonkey and Violentmonkey only, same as the Fast URL note above). This is on by default; right-click the script manager's icon to find a menu option to turn it off.

[![Install this script](https://img.shields.io/badge/Install%20User%20Script-green?style=for-the-badge)](https://raw.githubusercontent.com/Nonunon/SteamRelink/refs/heads/main/SteamRelink.user.js)

## Credits

The `/stats` page's scrollbar uses [SimpleBar](https://github.com/Grsmto/simplebar) (MIT License), vendored locally under [`public/vendor/`](public/vendor/) rather than pulled from a CDN.

## License

This project is licensed under the GPL-3.0 License.
