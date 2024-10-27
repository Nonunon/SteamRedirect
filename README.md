
# SteamRedirect

SteamRedirect is a straightforward GitHub Pages-based project designed to redirect specific links seamlessly, especially for sharing on Discord. By appending a Steam Workshop ID to the URL, users are directed to the corresponding Steam Workshop page, making link management easy and efficient.

## Features

- **URL Redirection**: Redirects links based on Steam Workshop IDs.
- **Optimized for Discord**: Tailored for cleaner link handling in Discord channels.
- **Lightweight & Simple**: Minimal and easy to use

## How to Use / What It Does

To redirect, use the following format:

```
https://nonunon.github.io/SteamRedirect/?id=[WORKSHOP_ID]
```

Replace `[WORKSHOP_ID]` with the relevant Steam Workshop ID to generate the link.

## Create A SteamRedirect Bookmarklet

To easily redirect Steam Workshop links, you can create a bookmarklet by following these steps:

1. **Copy the code below**:
    ```javascript
    javascript:(function() {
        const url = window.location.href;
        const match = url.match(/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=(\d+)/);
        if (match && match[1]) {
            const workshopId = match[1];
            const redirectUrl = `https://nonunon.github.io/SteamRedirect/?id=${workshopId}`;
            window.location.href = redirectUrl;
        } else {
            alert("This is not a valid Steam Workshop link.");
        }
    })();
    ```
2. **Open your browser’s bookmarks bar**.
3. **Create a new bookmark** and paste the code into the **URL** field of the bookmark.
4. **Name the bookmark** something memorable, like "SteamRedirect".
5. **Use the Bookmarklet**: Whenever you're on a Steam Workshop page, click this bookmark to automatically redirect to SteamRedirect with the correct Workshop ID.

Now you’re ready to quickly and easily convert Workshop links!

## Install the SteamRedirect Button for Steam Workshop Pages

To add a convenient "SteamRedirect" button directly to Steam Workshop pages, follow these steps:

[![Install this script](https://img.shields.io/badge/Install%20User%20Script-green?style=for-the-badge)](https://github.com/Nonunon/SteamRedirect/raw/main/SteamRedirect.user.js)

### Instructions
1. Click the **Install User Script** button above.
2. Tampermonkey or Greasemonkey will open with an option to install the script.
3. Confirm the installation, and the script will be ready to use on Steam Workshop pages.


## License

This project is licensed under the GPL-3.0 License.
