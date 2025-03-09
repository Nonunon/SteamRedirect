(function() {
    const url = window.location.href;
    const match = url.match(/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=(\d+)/);
	    if (match && match[1]) {
        const workshopId = match[1];
        const redirectUrl = `https://steamredirect.hi-nonunon.workers.dev/?id=${workshopId}`;
        window.location.href = redirectUrl;
    } else {
        alert("This is not a valid Steam Workshop link.");
    }
})();