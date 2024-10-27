
# SteamRedirect

SteamRedirect is a straightforward GitHub Pages-based project designed to redirect specific links seamlessly, especially for sharing on Discord. By appending a Steam Workshop ID to the URL, users are directed to the corresponding Steam Workshop page, making link management easy and efficient.

## Features

- **URL Redirection**: Redirects links based on Steam Workshop IDs.
- **Optimized for Discord**: Tailored for cleaner link handling in Discord channels.
- **Lightweight & Simple**: Minimal and easy to use

## How to Use

To redirect, use the following format:

```
https://nonunon.github.io/SteamRedirect/?id=[WORKSHOP_ID]
```

Replace `[WORKSHOP_ID]` with the relevant Steam Workshop ID to generate the link.


### Create Your SteamRedirect Bookmarklet

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

## License

This project is licensed under the GPL-3.0 License.
