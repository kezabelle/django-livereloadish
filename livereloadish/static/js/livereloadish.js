"use strict";
(function () {
    var evtSource = null;
    // https://caniuse.com/mdn-api_console_log_substitution_strings
    var logFmt = "color: #666666; padding: 1px 3px; border: 1px solid #bbbbbb; border-radius: 2px; font-size: 90%; display: inline-block";
    var logPrefix = "%clivereloadish";
    var logCSS = logPrefix + ": CSS";
    var logJS = logPrefix + ": JS";
    var logIMG = logPrefix + ": Image";
    var logPage = logPrefix + ": Page";
    var logQueue = logPrefix + ": Queue";
    /**
     * Wraps over a `URL` to provide mutation free adding of our cache-busting
     * querystring parameter AND for serialisation to a string without including
     * the origin prefix in the output, for nicer logging.
     */
    var RelativeUrl = /** @class */ (function () {
        /**
         * Formats an absolute OR relative URL into a complete (absolute) URL
         * based on the given origin. For URLs like "../asdf.jpg" this requires
         * knowing the right origin to use as the base URL.
         * See eg: replacing relative images in stylesheets for that issue.
         */
        function RelativeUrl(url, origin) {
            this.address = new URL(url, origin);
        }
        /**
         * Take off the origin (scheme://hostname:port/) if it's there ... it probably
         * is because we're not using getAttribute, which gives us the raw valu rather
         * than the one which has gone through the encoding and whatnot.
         */
        RelativeUrl.prototype.toString = function () {
            //
            var newUrl = this.address.toString();
            var startsWithOrigin = newUrl.indexOf(origin);
            if (startsWithOrigin === 0) {
                newUrl = newUrl.slice(origin.length);
            }
            return newUrl;
        };
        /**
         * Generates a new URL() instance based on the current one, and updates
         * the querystring value `livereloadish` to the new `mtime` argument.
         */
        RelativeUrl.prototype.changeLivereloadishValue = function (mtime) {
            var newUrl = new RelativeUrl(this.address.toString(), this.address.origin);
            var searchParams = newUrl.address.searchParams;
            searchParams.set("livereloadish", mtime.toString());
            newUrl.address.search = searchParams.toString();
            return newUrl;
        };
        return RelativeUrl;
    }());
    /**
     * Replace an included CSS file (<link rel="stylesheet" href="...">).
     * Creates a new file with all the same attributes and a new querystring to
     * bust any cache/force a load.
     * Destroys the previous CSS file Node when the new one loads or errors.
     * We add a new one and destroy the old one to avoid a classic
     * Flash-of-Unstyled-Content between removal and loading, both of which may
     * be happening in tandem.
     */
    var replaceCSSFile = function (link, mtime, origin) {
        var _a;
        if (link.href) {
            var originalHref_1 = new RelativeUrl(link.href, origin);
            var newLink = document.createElement("link");
            for (var i = 0; i < link.attributes.length; i++) {
                var _b = link.attributes[i], name_1 = _b.name, value = _b.value;
                newLink.setAttribute(name_1, value);
            }
            var newHref_1 = originalHref_1.changeLivereloadishValue(mtime).toString();
            newLink.href = newHref_1;
            var onComplete = function (_event) {
                var _a;
                console.debug(logCSS, logFmt, "Removing " + originalHref_1 + " in favour of " + newHref_1);
                (_a = link.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(link);
            };
            newLink.addEventListener('error', onComplete);
            newLink.addEventListener('load', onComplete);
            console.debug(logCSS, logFmt, "Adding " + newHref_1 + " to replace " + originalHref_1);
            link.setAttribute('data-pending-removal', '');
            (_a = link.parentNode) === null || _a === void 0 ? void 0 : _a.insertBefore(newLink, link.nextSibling);
            return newHref_1;
        }
        return "";
    };
    /**
     * Replace an included JS file (<script src=...></script>).
     * Creates a new file with all the same attributes and a new querystring to
     * bust any cache/force a src test & load.
     * Destroys the previous JS file Node when the new one loads or errors.
     * Should only fire for scripts which are idempotent or know how to unbind
     * and rebind existing state.
     */
    var replaceJSFile = function (script, mtime, origin) {
        var _a;
        // Like with CSS, we replace the element rather than adjust the src="..."
        // because that doesn't trigger re-running?
        if (script.src) {
            var originalHref_2 = new RelativeUrl(script.src, origin);
            var newScript = document.createElement("script");
            for (var i = 0; i < script.attributes.length; i++) {
                var _b = script.attributes[i], name_2 = _b.name, value = _b.value;
                newScript.setAttribute(name_2, value);
            }
            var newHref_2 = originalHref_2.changeLivereloadishValue(mtime).toString();
            newScript.src = newHref_2;
            newScript.defer = false;
            newScript.async = false;
            var onComplete = function (_event) {
                var _a;
                console.debug(logJS, logFmt, "Removing " + originalHref_2 + " in favour of " + newHref_2);
                (_a = script.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(script);
            };
            newScript.addEventListener('error', onComplete);
            newScript.addEventListener('load', onComplete);
            console.debug(logJS, logFmt, "Adding " + newHref_2 + " to replace " + originalHref_2);
            script.setAttribute('data-pending-removal', '');
            (_a = script.parentNode) === null || _a === void 0 ? void 0 : _a.insertBefore(newScript, script.nextSibling);
            return newHref_2;
        }
        return '';
    };
    /**
     * If an <img> or <picture><source> has a srcset, we want to refresh both the
     * src attr AND the srcset attr, because Chrome and Safari will update the
     * currentSrc being used for the responsive <img> when the src changes, but
     * Firefox doesn't. Instead you have to update the srcset, which appears
     * to trigger the reflow.
     * Note that this is currently refreshing ALL the images in a given responsive
     * image, regardless of if they represent the recently changed path, because
     * this function doesn't receive the path (it's checked by the caller), only
     * the modification time to update to.
     */
    var replaceImageFile = function (img, mtime) {
        if (img.src) {
            var originalHref = new RelativeUrl(img.src, origin);
            var newHref = originalHref.changeLivereloadishValue(mtime).toString();
            console.debug(logIMG, logFmt, "Replacing src " + originalHref + " with " + newHref + " in-place");
            img.setAttribute('src', newHref);
            return newHref;
        }
        if (img.srcset) {
            // https://github.com/sindresorhus/srcset/blob/9549e25ca7919a08f2fb519e84784658e4009c9a/index.js#L18
            var urlExtractor = /\s*([^,]\S*[^,](?:\s+[^,]+)?)\s*(?:,|$)/g;
            img.srcset = img.srcset.replace(urlExtractor, function (_fullText, candidateHref, _matchStartPos, _input) {
                var candidateParts = candidateHref.split(/\s+/);
                if (candidateParts.length > 2) {
                    console.error(logIMG, logFmt, "Expected \"/path/to/file.ext 000w\" format, got more spaces than that. Leaving as-is.");
                    return candidateHref;
                }
                else {
                    var actualHref = candidateParts[0], descriptor = candidateParts[1];
                    var replacementUrl = new RelativeUrl(actualHref, origin).changeLivereloadishValue(mtime).toString();
                    console.debug(logIMG, logFmt, "Replacing srcset[" + descriptor + "] " + actualHref + " with " + replacementUrl + " in-place");
                    return replacementUrl + " " + descriptor;
                }
            });
        }
        return "";
    };
    /**
     * Replaces an image which is either given via <div style="background-image: url(...)"></div>
     * or is present in a stylesheet rule as background: url(...) or background-image: url(...) etc.
     */
    var replaceImageInStyle = function (element, mtime) {
        var originalHref = element.style.backgroundImage;
        if (originalHref) {
            var urlExtractor = /url\((['"]{0,1})\s*(.*?)(["']{0,1})\)/g;
            var newHref = originalHref.replace(urlExtractor, function (_fullText, leftQuote, actualHref, rightQuote, _matchStartPos, _inputValue) {
                var _a;
                var usingOrigin = origin;
                // relative URLs inside CSS files need special construction,
                // and changing the origin to the full path to the CSS file seems
                // to fix it.
                if (actualHref.indexOf("..") > -1 && "parentStyleSheet" in element && ((_a = element.parentStyleSheet) === null || _a === void 0 ? void 0 : _a.href)) {
                    usingOrigin = element.parentStyleSheet.href;
                }
                var replacementUrl = new RelativeUrl(actualHref, usingOrigin).changeLivereloadishValue(mtime).toString();
                return "url(" + leftQuote + replacementUrl + rightQuote + ")";
            });
            console.debug(logIMG, logFmt, "Replacing CSS background " + originalHref + "\" with " + newHref + " in-place");
            element.style.backgroundImage = newHref;
            return newHref;
        }
        return '';
    };
    /**
     * Replaces each <link rel="stylesheet" href="..."> where the href matches an update
     * notification. To avoid having a Flash-of-Unstyled-Content (how retro), it does
     * so by adding a _new_ link element and deleting the old one when the new one
     * has loaded or errored.
     */
    var cssStrategy = function (msg) {
        var file = msg.filename[0];
        var reloadableLinkElements = document.querySelectorAll("link[rel=stylesheet][href*=\"" + file + "\"]:not([data-no-reload]):not([data-pending-removal]):not([up-keep])");
        var linkElements = Array.prototype.slice.call(reloadableLinkElements);
        for (var _i = 0, linkElements_1 = linkElements; _i < linkElements_1.length; _i++) {
            var linkElement = linkElements_1[_i];
            replaceCSSFile(linkElement, msg.new_time, origin);
        }
    };
    /**
     * Forces the current URL to be reloaded in the browser. Used as a fallback elsewhere,
     * and is used if a "root" template (as decided by my Django monkeypatches) changes,
     * because the root template is more likely to contain non-visible changes to <head> etc.
     */
    var refreshStrategy = function (msg) {
        var file = msg.filename[0];
        console.debug(logPage, logFmt, "Reloading the page, because " + file + " changed");
        livereloadishTeardown();
        return document.location.reload();
    };
    /**
     * Used for content types which aren't recognised. Just throws an error to the console.
     */
    var noopStrategy = function (msg) {
        console.error(logPrefix, logFmt, "Don't know how to process this", msg);
    };
    /**
     * Essentially a dictionary of paths and the change messages they've received.
     * If a user browses away from the tab and comes back, this should get drained,
     * but even if a file is changed multiple times whilst the page isn't visible,
     * only the most recent file change will be replayed.
     */
    var queuedUp = {};
    /**
     * Logs change messages to the `queuedUp` object, for replaying later.
     * This strategy is used when the user navigates away from the tab but the
     * event source is still listening and needing to register changes.
     */
    var queuedUpStrategy = function (msg) {
        var file = msg.filename[0];
        var mtime = msg.new_time;
        console.debug(logQueue, logFmt, "Deferring " + file + " (modified at: " + mtime + ") until page is visible");
        queuedUp[file] = msg;
    };
    /**
     * Refresh the page because a Django template was noticed as changing.
     * If the Django monkeypatches say that it was a _root_ template which changed,
     * always go through `refreshStrategy` to get a full page reload.
     * If it's a non-root, and the user (me!) is using an SPA-ish package like:
     * unpoly, turbolinks, swup, etc.
     * then try and do a partial refresh using whatever mechanism they provide.
     *
     * @todo Maybe work with Sennajs, Barbajs, SmoothStatejs?
     * @todo For smoothstate, we'd do smoothstate.load('url.html', false, false) (no push, no cache)
     * @todo For barba we'd do barba.go('url.html', ...) I think?
     * @todo For Sennajs it'd be app.navigate('url.html') by the look of it;
     */
    var pageStrategy = function (msg) {
        var file = msg.filename[0];
        var definitelyRequiresReload = msg.filename[3];
        if (definitelyRequiresReload) {
            console.debug(logPage, logFmt, "Server suggested that this must do a full reload, because " + file + " changed");
            return refreshStrategy(msg);
        }
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
    /**
     * Replaces any matching <script src=...> for the file change notification.
     * Only applies if the script is decorated with data-reloadable="true" or data-reloadable.
     * Otherwise it'll do a full page refresh because JS often carries state and
     * needs unmounting/remounting, for which I don't have a module.hot style mechanism.
     * If the script has any of the following attributes, it won't be refreshed at all:
     *  - data-no-reload
     *  - data-pending-removal (internal)
     *  - data-turbolinks-eval="false"
     *  - up-keep
     */
    var jsStrategy = function (msg) {
        var origin = document.location.origin;
        var file = msg.filename[0];
        var possiblyReloadableScriptElements = document.querySelectorAll("script[src*=\"" + file + "\"]:not([data-no-reload]):not([data-pending-removal]):not([data-turbolinks-eval=\"false\"]):not([up-keep])");
        var scriptElements = Array.prototype.slice.call(possiblyReloadableScriptElements);
        for (var _i = 0, scriptElements_1 = scriptElements; _i < scriptElements_1.length; _i++) {
            var scriptElement = scriptElements_1[_i];
            var reloadable = scriptElement.dataset.reloadable;
            var src = scriptElement.src;
            if (reloadable === "" || reloadable === "true") {
                console.debug(logJS, logFmt, src + " is marked as reloadable");
                replaceJSFile(scriptElement, msg.new_time, origin);
            }
            else {
                // Now we have to reload, so we can stop immediately in case there were multiple
                // replacements to deal with.
                console.debug(logJS, logFmt, src + " is not reloadable");
                return refreshStrategy(msg);
            }
        }
    };
    /**
     * Replace all occurances of an image which matches the updated file.
     * Attempts to account for responsive images (<img srcset=...>, <picture><source srcset=...>)
     * by forcing a new modified-time on each part, regardless of if they're the one in question.
     * Attempts to account for images used via stylesheets, eg: "background: url(...)" in
     * both inline styles and external stylesheets (same origin policy notwithstanding).
     */
    var imageStrategy = function (msg) {
        // https://github.com/livereload/livereload-js/blob/12cff7df9dcb36a14c00c5c092fef86efd201910/src/reloader.js#L238
        var origin = document.location.origin;
        var file = msg.filename[0];
        var possiblyReloadableScriptElements = document.querySelectorAll("img[src*=\"" + file + "\"], img[srcset*=\"" + file + "\"], picture>source[srcset*=\"" + file + "\"]");
        var imageElements = Array.prototype.slice.call(possiblyReloadableScriptElements);
        var totalReplacements = [];
        for (var _i = 0, imageElements_1 = imageElements; _i < imageElements_1.length; _i++) {
            var imageElement = imageElements_1[_i];
            var newHref = replaceImageFile(imageElement, msg.new_time, origin);
            if (newHref !== "") {
                totalReplacements.push(newHref);
            }
        }
        // Can't say I care about border images, so we'll only look for backgrounds...
        // Note that we could see items from document.images in here, because they could
        // have placeholder backgrounds...
        var inlineStyles = document.querySelectorAll("[style*=\"background\"][style*=\"" + file + "\"]");
        var imageStyleElements = Array.prototype.slice.call(inlineStyles);
        for (var _a = 0, imageStyleElements_1 = imageStyleElements; _a < imageStyleElements_1.length; _a++) {
            var imageElement = imageStyleElements_1[_a];
            if (imageElement.style.backgroundImage) {
                var newHref = replaceImageInStyle(imageElement, msg.new_time, origin);
                if (newHref !== "") {
                    totalReplacements.push(newHref);
                }
            }
        }
        var styleSheets = Array.prototype.slice.call(document.styleSheets);
        for (var _b = 0, styleSheets_1 = styleSheets; _b < styleSheets_1.length; _b++) {
            var styleSheet = styleSheets_1[_b];
            var rules = void 0;
            try {
                rules = Array.prototype.slice.call(styleSheet.cssRules);
            }
            catch (e) {
                console.warn(logIMG, logFmt, "Failed to read get CSSRuleList from " + styleSheet.href + ", probably it's remote and uneditable?");
                continue;
            }
            for (var _c = 0, rules_1 = rules; _c < rules_1.length; _c++) {
                var rule = rules_1[_c];
                if (rule instanceof CSSStyleRule) {
                    if (rule.cssText.indexOf("background") > -1) {
                        var newHref = replaceImageInStyle(rule, msg.new_time, origin);
                        if (newHref !== "") {
                            totalReplacements.push(newHref);
                        }
                    }
                }
            }
        }
        if (totalReplacements.length === 0) {
            console.debug(logIMG, logFmt, "Failed to find any images or CSS styles referencing " + file);
        }
    };
    /**
     * A mapping of mimetypes to the real reload/replace/refresh strategies for
     * that file type. For CSS/JS/HTML/Images that includes attempting to do the
     * change in-place. For others (eg: fonts) it's always a full page reload.
     */
    var reloadStrategies = {
        "text/css": cssStrategy,
        "text/javascript": jsStrategy,
        "text/html": pageStrategy,
        "application/xhtml+xml": pageStrategy,
        "image/png": imageStrategy,
        "image/jpeg": imageStrategy,
        "image/svg+xml": imageStrategy,
        "image/webp": imageStrategy,
        "image/gif": imageStrategy,
        "font/ttf": refreshStrategy,
        "font/woff": refreshStrategy,
        "font/woff2": refreshStrategy,
        "application/octet-stream": noopStrategy,
    };
    /**
     * When this is being used, all file updates regardless of media type are
     * redirect to a queue for replaying later.
     * This set of strategies is used when the user has navigated away from the tab.
     */
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
    /**
     * A toggle-able set of reload strategies by mime type. When the
     * user navigates away from the tab, these will swap to the queue based ones
     * and back when/if they come back.
     */
    var activeReloadStrategies = reloadStrategies;
    /**
     * Listen for visibilitychange events on the document, and swap the
     * reload strategies being used. When a user navigates to a different tab,
     * swap to using the background queue to replay when they come back.
     * When they come back to the tab, replay each unique file and drain the queue.
     */
    var switchStrategies = function (_event) {
        if (document.visibilityState === "hidden") {
            activeReloadStrategies = queudeUpReloadStrategies;
            console.debug(logQueue, logFmt, "Switched reloaders until page is visible again");
        }
        else {
            activeReloadStrategies = reloadStrategies;
            console.debug(logQueue, logFmt, "Switched reloaders back to defaults because page became visible");
            if (evtSource === null && Object.keys(queuedUp).length) {
                console.debug(logQueue, logFmt, "It looks like the server may have gone away though, so these will probably fail...");
            }
            // What happens if multiple trigger and want to do a full reload?
            // Will the queuedUp list have drained fully because unload has
            // fired and livereloadishTeardown deleted them? Not sure...
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
    /**
     * When a successful connection to the SSE URL has been established, reset
     * the error count and reconnection timers so that failures start anew later.
     */
    var connectionOpened = function (_event) {
        console.debug(logPrefix, logFmt, "SSE connection opened");
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
    };
    /**
     * If the server goes away temporarily (ie: during autoreload restart), try
     * and pick up a new connection again a few times at random intervals between
     * 1 and 3 seconds.
     * After a number of failed attempts, stop trying completely.
     *
     * Based on https://github.com/fanout/reconnecting-eventsource ... ish.
     */
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
    /**
     * The server has the opportunity to ask the client to reconnect, though I've
     * not currently implemented any such thing.
     */
    var reconnectRequested = function (_event) {
        console.debug(logPrefix, logFmt, "Server asked for a reconnect");
        return connectionErrored(_event);
    };
    /**
     * The server has the opportunity to ask the client to go away permanently,
     * this just sets the number of times it has attempted to reconnect to a
     * stupidly high number and then lets it try to reconnect (and it'll choose
     * not to, effectively cancelling/disconnecting by choice)
     */
    var disconnectRequested = function (_event) {
        errorCount = 999;
        console.debug(logPrefix, logFmt, "Server asked for a disconnect");
        return connectionErrored(_event);
    };
    /**
     * When the server sends an "asset_change" event, it will include a JSON
     * payload in "data" which which details what file + strategy to update.
     */
    var assetHasChanged = function (event) {
        var msg = JSON.parse(event.data);
        var selectedReloadStrategy = activeReloadStrategies[msg.asset_type] || activeReloadStrategies["application/octet-stream"];
        return selectedReloadStrategy(msg);
    };
    /**
     * If a file is deleted (ie: getting the mtime of it no longer succeeds) then
     * notify the user that they'll need to refresh the page, via a modal confirm dialog.
     * If they reject the modal, they'll have to refresh manually.
     * If the file deletion notification comes through multiple times for the same file,
     * avoid ending up in a loop by tracking the ones seen already.
     */
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
    /**
     * Your basic setup of event source + various event listeners.
     */
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
    /**
     * Destroy everything because the page is unloading or whatever.
     * Drain any queues, reset any tracking variables etc.
     */
    var livereloadishTeardown = function () {
        // destroy these values ASAP
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
        for (var key in queuedUp) {
            delete queuedUp[key];
        }
        // Don't know that I can remove ... myself.
        // window.removeEventListener('pagehide', unload);
        document.removeEventListener('visibilitychange', switchStrategies);
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