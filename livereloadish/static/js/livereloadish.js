"use strict";
(function () {
    var evtSource = null;
    // https://caniuse.com/mdn-api_console_log_substitution_strings
    var logFmt = "color: #666666; padding: 1px 3px; border: 1px solid #bbbbbb; border-radius: 2px; font-size: 90%; display: inline-block";
    var logPrefix = "%clivereloadish";
    var logCSS = logPrefix + ": CSS";
    var logJS = logPrefix + ": JS";
    var logPage = logPrefix + ": Page";
    var logQueue = logPrefix + ": Queue";
    var replaceCSSFile = function (link, mtime) {
        var _a;
        // Doing it this way, by creating a new link Node and deleting the old one
        // afterwards avoids the classic FOUC (flash-of-unstyled-content)
        // compared to just changing the URL, which depending on the browser (hi Firefox)
        // may unload the styles and repaint them.
        // using .href causes Chrome, at least, to give you the _whole_ URL, scheme + hostname etc
        // which could be problematic using *= instead of ^=
        var originalHref = link.getAttribute('href');
        if (originalHref !== null) {
            var newLink = document.createElement("link");
            for (var i = 0; i < link.attributes.length; i++) {
                var _b = link.attributes[i], name_1 = _b.name, value = _b.value;
                newLink.setAttribute(name_1, value);
            }
            // uuid regex: [0-9a-fA-F\-]{36}
            var newHref_1 = originalHref.replace(/(&|\\?)livereloadish=([0-9]+.[0-9]+)/, "$1livereloadish=" + mtime);
            newLink.setAttribute('href', newHref_1);
            var onComplete = function (_event) {
                var _a;
                console.debug(logCSS, logFmt, "Removing " + originalHref + " in favour of " + newHref_1);
                (_a = link.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(link);
            };
            newLink.addEventListener('error', onComplete);
            newLink.addEventListener('load', onComplete);
            console.debug(logCSS, logFmt, "Adding " + newHref_1 + " to replace " + originalHref);
            link.setAttribute('data-pending-removal', '');
            // link.parentNode?.appendChild(newLink);
            (_a = link.parentNode) === null || _a === void 0 ? void 0 : _a.insertBefore(newLink, link.nextSibling);
            return newHref_1;
        }
        return '';
    };
    var replaceJSFile = function (script, mtime) {
        var _a;
        // Like with CSS, we replace the element rather than adjust the src="..."
        // because that doesn't trigger re-running?
        var originalHref = script.getAttribute('src');
        if (originalHref !== null) {
            var newScript = document.createElement("script");
            for (var i = 0; i < script.attributes.length; i++) {
                var _b = script.attributes[i], name_2 = _b.name, value = _b.value;
                newScript.setAttribute(name_2, value);
            }
            var newHref_2 = originalHref.replace(/(&|\\?)livereloadish=([0-9]+.[0-9]+)/, "$1livereloadish=" + mtime);
            newScript.setAttribute('src', newHref_2);
            newScript.defer = false;
            newScript.async = false;
            var onComplete = function (_event) {
                var _a;
                console.debug(logJS, logFmt, "Removing " + originalHref + " in favour of " + newHref_2);
                (_a = script.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(script);
            };
            newScript.addEventListener('error', onComplete);
            newScript.addEventListener('load', onComplete);
            console.debug(logJS, logFmt, "Adding " + newHref_2 + " to replace " + originalHref);
            script.setAttribute('data-pending-removal', '');
            // script.parentNode?.appendChild(newScript);
            (_a = script.parentNode) === null || _a === void 0 ? void 0 : _a.insertBefore(newScript, script.nextSibling);
            return newHref_2;
        }
        return '';
    };
    var cssStrategy = function (msg) {
        var file = msg.filename[0];
        var reloadableLinkElements = document.querySelectorAll("link[rel=stylesheet][href*=\"" + file + "\"]:not([data-no-reload]):not([data-pending-removal]):not([up-keep])");
        var linkElements = Array.prototype.slice.call(reloadableLinkElements);
        for (var _i = 0, linkElements_1 = linkElements; _i < linkElements_1.length; _i++) {
            var linkElement = linkElements_1[_i];
            replaceCSSFile(linkElement, msg.new_time);
        }
    };
    var refreshStrategy = function (msg) {
        var file = msg.filename[0];
        console.debug(logPage, logFmt, "Reloading the page, because " + file + " changed");
        livereloadishTeardown();
        return document.location.reload();
    };
    var noopStrategy = function (msg) {
        console.error(logPrefix, logFmt, "Don't know how to process this", msg);
    };
    var queuedUp = {};
    var queuedUpStrategy = function (msg) {
        var file = msg.filename[0];
        var mtime = msg.new_time;
        console.debug(logQueue, logFmt, "Deferring " + file + " (modified at: " + mtime + ") until page is visible");
        queuedUp[file] = msg;
    };
    var pageStrategy = function (msg) {
        // TODO: Maybe work with Sennajs, Barbajs, SmoothStatejs?
        // eg:
        // For smoothstate, we'd do smoothstate.load('url.html', false, false) (no push, no cache)
        // For barba we'd do barba.go('url.html', ...) I think?
        // For Sennajs it'd be app.navigate('url.html') by the look of it;
        var file = msg.filename[0];
        // @ts-ignore
        var unpoly = window.up, turbolinks = window.Turbolinks, Swup = window.Swup, swupInstance = window.swup, url = window.location;
        if (unpoly && (unpoly === null || unpoly === void 0 ? void 0 : unpoly.version) && (unpoly === null || unpoly === void 0 ? void 0 : unpoly.reload)) {
            console.debug(logPage, logFmt, "I think this is an Unpoly (https://unpoly.com/) page");
            console.debug(logPage, logFmt, "Reloading the root fragment vis up.reload(...), because " + file + " changed");
            unpoly.reload({ navigate: true, cache: false }).catch(function (_renderResult) {
                // Intentionally do a double-request to get any styles necessary for
                // an error page. The error page itself will have a SSE connection (hmmm)
                // that will resolve and reload it if it's due to a template error etc.
                console.debug(logPage, logFmt, "An error occurred doing a partial reload because " + file + " changed");
                return refreshStrategy(msg);
            });
        }
        else if (turbolinks && (turbolinks === null || turbolinks === void 0 ? void 0 : turbolinks.supported) && (turbolinks === null || turbolinks === void 0 ? void 0 : turbolinks.visit)) {
            console.debug(logPage, logFmt, "I think this is a Turbolinks (https://github.com/turbolinks/turbolinks) page");
            console.debug(logPage, logFmt, "Reloading the content via Turbolinks.visit(), because " + file + " changed");
            turbolinks.visit(url.toString());
        }
        else if (Swup) {
            console.debug(logPage, logFmt, "I think this is a Swup (https://swup.js.org/) page");
            if (swupInstance && (swupInstance === null || swupInstance === void 0 ? void 0 : swupInstance.loadPage)) {
                console.debug(logPage, logFmt, "Reloading the content via swup.reloadPage(...), because " + file + " changed");
                swupInstance.loadPage({
                    'url': url.toString(),
                });
            }
            else {
                console.debug(logPage, logFmt, "Cannot find the swup instance as 'window.swup' (possibly defined as a non global const/var");
                return refreshStrategy(msg);
            }
        }
        else {
            return refreshStrategy(msg);
        }
    };
    var jsStrategy = function (msg) {
        var file = msg.filename[0];
        var possiblyReloadableScriptElements = document.querySelectorAll("script[src*=\"" + file + "\"]:not([data-no-reload]):not([data-pending-removal]):not([data-turbolinks-eval=\"false\"]):not([up-keep])");
        var scriptElements = Array.prototype.slice.call(possiblyReloadableScriptElements);
        for (var _i = 0, scriptElements_1 = scriptElements; _i < scriptElements_1.length; _i++) {
            var scriptElement = scriptElements_1[_i];
            var reloadable = scriptElement.dataset.reloadable;
            var src = scriptElement.getAttribute('src');
            if (reloadable === "" || reloadable === "true") {
                console.debug(logJS, logFmt, src + " is marked as reloadable");
                replaceJSFile(scriptElement, msg.new_time);
            }
            else {
                // Now we have to reload, so we can stop immediately in case there were multiple
                // replacements to deal with.
                console.debug(logJS, logFmt, src + " is not reloadable");
                return refreshStrategy(msg);
            }
        }
    };
    var reloadStrategies = {
        "text/css": cssStrategy,
        "text/javascript": jsStrategy,
        "text/html": pageStrategy,
        "application/xhtml+xml": pageStrategy,
        "image/png": refreshStrategy,
        "image/jpeg": refreshStrategy,
        "image/svg+xml": refreshStrategy,
        "image/webp": refreshStrategy,
        "image/gif": refreshStrategy,
        "font/ttf": refreshStrategy,
        "font/woff": refreshStrategy,
        "font/woff2": refreshStrategy,
        "application/octet-stream": noopStrategy,
    };
    var queudeUpReloadStrategies = {
        "text/css": queuedUpStrategy,
        "text/javascript": queuedUpStrategy,
        "text/html": queuedUpStrategy,
        "application/xhtml+xml": queuedUpStrategy,
        "image/png": queuedUpStrategy,
        "image/jpeg": queuedUpStrategy,
        "image/svg+xml": queuedUpStrategy,
        "image/webp": queuedUpStrategy,
        "image/gif": queuedUpStrategy,
        "font/ttf": queuedUpStrategy,
        "font/woff": queuedUpStrategy,
        "font/woff2": queuedUpStrategy,
        "application/octet-stream": queuedUpStrategy,
    };
    var activeReloadStrategies = reloadStrategies;
    var switchStrategies = function (_event) {
        if (document.visibilityState === "hidden") {
            activeReloadStrategies = queudeUpReloadStrategies;
            console.debug(logQueue, logFmt, "Switched reloaders until page is visible again");
        }
        else {
            activeReloadStrategies = reloadStrategies;
            console.debug(logQueue, logFmt, "Switched reloaders back to defaults because page became visible");
            if (evtSource === null) {
                console.debug(logQueue, logFmt, "It looks like the server may have gone away though, so these will probably fail...");
            }
            for (var key in queuedUp) {
                var msg = queuedUp[key];
                var selectedReloadStrategy = activeReloadStrategies[msg.asset_type];
                selectedReloadStrategy(msg);
                delete queuedUp[key];
            }
        }
    };
    var errorTimer = null;
    var errorCount = 0;
    var connectionOpened = function (_event) {
        console.debug(logPrefix, logFmt, "SSE connection opened");
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
    };
    // Based on https://github.com/fanout/reconnecting-eventsource ... ish.
    var connectionErrored = function (_event) {
        errorCount++;
        if (evtSource !== null) {
            evtSource.close();
            evtSource = null;
            if (errorCount < 10) {
                // Wait between 1-3 seconds before retrying.
                var timeout = Math.max(1000, Math.round(3000 * Math.random()));
                console.debug(logPrefix, logFmt, "Waiting for " + timeout + "ms to restart SSE connection");
                errorTimer = setTimeout(livereloadishSetup, timeout);
            }
            else {
                console.error(logPrefix, logFmt, "Cancelling SSE connection attempts after " + errorCount + " retries. Manually reload the page...");
            }
        }
    };
    var reconnectRequested = function (_event) {
        console.debug(logPrefix, logFmt, "Server asked for a reconnect");
        return connectionErrored(_event);
    };
    var disconnectRequested = function (_event) {
        errorCount = 999;
        console.debug(logPrefix, logFmt, "Server asked for a disconnect");
        return connectionErrored(_event);
    };
    var assetHasChanged = function (event) {
        var msg = JSON.parse(event.data);
        var selectedReloadStrategy = activeReloadStrategies[msg.asset_type] || activeReloadStrategies["application/octet-stream"];
        return selectedReloadStrategy(msg);
    };
    var promptedPreviously = [];
    var assetHasDeleted = function (event) {
        var msg = JSON.parse(event.data);
        var fileName = msg.filename[0];
        if (promptedPreviously.indexOf(fileName) > -1) {
            console.debug(logPrefix, logFmt, fileName + " has been moved or deleted, and the user has already been notified");
            return;
        }
        promptedPreviously.push(fileName);
        var confirmReload = window.confirm("File \"" + fileName + "\" has been moved or deleted, reload the page?");
        if (confirmReload) {
            return refreshStrategy(msg);
        }
        else {
            console.error(logPrefix, logFmt, fileName + " has been moved or deleted, page may need manually reloading");
        }
    };
    var livereloadishSetup = function () {
        var includer = document.querySelector("script[data-livereloadish-url]");
        if (includer !== null) {
            var livereloadishUrl = includer.dataset.livereloadishUrl;
            if (livereloadishUrl) {
                evtSource = new EventSource(livereloadishUrl);
                evtSource.addEventListener('open', connectionOpened);
                evtSource.addEventListener('error', connectionErrored);
                evtSource.addEventListener('assets_change', assetHasChanged);
                evtSource.addEventListener('assets_delete', assetHasDeleted);
                evtSource.addEventListener('disconnect', disconnectRequested);
                evtSource.addEventListener('reconnect', reconnectRequested);
                window.addEventListener('pagehide', livereloadishTeardown);
                document.addEventListener('visibilitychange', switchStrategies);
            }
            else {
                console.error(logPrefix, logFmt, "Included without an empty value in the data-livereloadish-url=\"\" attribute, cannot continue");
            }
        }
        else {
            console.error(logPrefix, logFmt, "Included without a data-livereloadish-url=\"...\" attribute, cannot continue");
        }
    };
    var livereloadishTeardown = function () {
        // Don't know that I can remove ... myself.
        // window.removeEventListener('pagehide', unload);
        document.removeEventListener('visibilitychange', switchStrategies);
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
        for (var key in queuedUp) {
            delete queuedUp[key];
        }
        if (evtSource !== null) {
            evtSource.close();
            console.debug(logPrefix, logFmt, "SSE connection closed, not reconnecting");
            evtSource.removeEventListener('open', connectionOpened);
            evtSource.removeEventListener('error', connectionErrored);
            evtSource.removeEventListener('assets_change', assetHasChanged);
            evtSource.removeEventListener('assets_delete', assetHasDeleted);
            evtSource.removeEventListener('disconnect', disconnectRequested);
            evtSource.removeEventListener('reconnect', reconnectRequested);
            console.debug(logPrefix, logFmt, "Event listeners unbound");
            evtSource = null;
        }
    };
    // https://cwestblog.com/2020/02/19/javascript-snippet-domready-function/
    if (/^(loaded|complete|interactive)$/.test(document.readyState)) {
        console.debug(logPrefix, logFmt, "DOM is ready, executing immediately");
        livereloadishSetup.call(document);
    }
    else {
        console.debug(logPrefix, logFmt, "Awaiting DOM-Ready event");
        document.addEventListener('DOMContentLoaded', livereloadishSetup);
    }
})();
//# sourceMappingURL=livereloadish.js.map