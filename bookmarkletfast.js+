(function() {
    const url = window.location.href;
    const match = url.match(/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=(\d+)/);
    if (match && match[1]) {
        window.location.href = `https://steamredirect.hi-nonunon.workers.dev/?id=${match[1]}&fast`;
    } else {
        alert("This is not a valid Steam Workshop link.");
    }
})();
