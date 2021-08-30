(() => {
    type MimeType = 
        "text/css" | 
        "text/javascript" | 
        "text/html" | 
        "application/xhtml+xml" | 
        "image/png" | 
        "image/jpeg" | 
        "image/svg+xml" | 
        "image/webp" | 
        "image/gif" | 
        "font/ttf" | 
        "font/woff" | 
        "font/woff2" | 
        "application/octet-stream";

    interface AssetChangeData {
        msg: string,
        asset_type: MimeType,
        old_time: number,
        new_time: number,
        filename: [string, string, number, boolean],
    }

    interface ReloadStrategy { (msg: AssetChangeData): void }
    interface Replacement<T> { (element: T, mtime: number, origin: string): string}

    let evtSource: EventSource | null = null;

    // https://caniuse.com/mdn-api_console_log_substitution_strings
    const logFmt = `color: #666666; padding: 1px 3px; border: 1px solid #bbbbbb; border-radius: 2px; font-size: 90%; display: inline-block`;
    const logPrefix = `%clivereloadish`;
    const logCSS = logPrefix + `: CSS`;
    const logJS = logPrefix + `: JS`;
    const logIMG = logPrefix + `: Image`;
    const logPage = logPrefix + `: Page`;
    const logQueue = logPrefix + `: Queue`;

    class RelativeUrl {
        private address: URL;
        constructor(url: string, origin: string) {
            this.address = new URL(url, origin);
        }
        toString(): string {
            // Take off the origin (scheme://hostname:port/) if it's there ... it probably
            // is because we're not using getAttribute, which gives us the raw valu rather
            // than the one which has gone through the encoding and whatnot.
            let newUrl = this.address.toString();
            const startsWithOrigin = newUrl.indexOf(origin);
            if (startsWithOrigin === 0) {
                newUrl = newUrl.slice(origin.length);
            }
            return newUrl;
        }
        changeLivereloadishValue(mtime: number): RelativeUrl {
            const newUrl = new RelativeUrl(this.address.toString(), this.address.origin);
            const searchParams = newUrl.address.searchParams;
            searchParams.set("livereloadish", mtime.toString());
            newUrl.address.search = searchParams.toString();
            return newUrl;
        }
    }
    //
    // const ensureFreshUrl = (url: string, mtime: number, origin: string): string => {
    //     const fullUrl = new URL(url, origin);
    //     const searchParams = fullUrl.searchParams;
    //     searchParams.set("livereloadish", mtime.toString());
    //     fullUrl.search = searchParams.toString();
    //     let newUrl = fullUrl.toString();
    //     // Take off the origin (scheme://hostname:port/) if it's there ... it probably
    //     // is because we're not using getAttribute, which gives us the raw valu rather
    //     // than the one which has gone through the encoding and whatnot.
    //     const startsWithOrigin = newUrl.indexOf(origin);
    //     if (startsWithOrigin === 0) {
    //         newUrl = newUrl.slice(origin.length);
    //     }
    //     return newUrl;
    // }

    const replaceCSSFile: Replacement<HTMLLinkElement> = function (link, mtime: number, origin: string): string {
        // Doing it this way, by creating a new link Node and deleting the old one
        // afterwards avoids the classic FOUC (flash-of-unstyled-content)
        // compared to just changing the URL, which depending on the browser (hi Firefox)
        // may unload the styles and repaint them.
        const originalHref = new RelativeUrl(link.href, origin);
        if (originalHref) {
            const newLink = document.createElement("link");
            for (let i = 0; i < link.attributes.length; i++) {
                const {name, value} = link.attributes[i];
                newLink.setAttribute(name, value)
            }
            // uuid regex: [0-9a-fA-F\-]{36}
            // const newHref = originalHref.replace(/(&|\\?)livereloadish=([0-9]+.[0-9]+)/, `$1livereloadish=${mtime}`);
            const newHref = originalHref.changeLivereloadishValue(mtime).toString();
            newLink.href = newHref;
            const onComplete = function (_event: Event) {
                console.debug(logCSS, logFmt, `Removing ${originalHref} in favour of ${newHref}`);
                link.parentNode?.removeChild(link);
            };
            newLink.addEventListener('error', onComplete);
            newLink.addEventListener('load', onComplete);
            console.debug(logCSS, logFmt, `Adding ${newHref} to replace ${originalHref}`);
            link.setAttribute('data-pending-removal', '');
            // link.parentNode?.appendChild(newLink);
            link.parentNode?.insertBefore(newLink, link.nextSibling)
            return newHref;
        }
        return "";
    };

    const replaceJSFile: Replacement<HTMLScriptElement> = function (script, mtime: number, origin: string): string {
        // Like with CSS, we replace the element rather than adjust the src="..."
        // because that doesn't trigger re-running?
        const originalHref = new RelativeUrl(script.src, origin);
        if (originalHref) {
            const newScript = document.createElement("script");
            for (let i = 0; i < script.attributes.length; i++) {
                const {name, value} = script.attributes[i];
                newScript.setAttribute(name, value)
            }
            // const newHref = originalHref.replace(/(&|\\?)livereloadish=([0-9]+.[0-9]+)/, `$1livereloadish=${mtime}`);
            // const newHref = ensureFreshUrl(originalHref, mtime, origin);
            const newHref = originalHref.changeLivereloadishValue(mtime).toString();
            newScript.src = newHref;
            newScript.defer = false;
            newScript.async = false;
            const onComplete = function (_event: Event) {
                console.debug(logJS, logFmt, `Removing ${originalHref} in favour of ${newHref}`);
                script.parentNode?.removeChild(script);
            };
            newScript.addEventListener('error', onComplete);
            newScript.addEventListener('load', onComplete);
            console.debug(logJS, logFmt, `Adding ${newHref} to replace ${originalHref}`);
            script.setAttribute('data-pending-removal', '');
            // script.parentNode?.appendChild(newScript);
            script.parentNode?.insertBefore(newScript, script.nextSibling)
            return newHref;
        }
        return '';
    };

    const replaceImageFile: Replacement<HTMLImageElement> = function (img, mtime: number): string {
        // If used in a <picture> element, the <img src=""> will be wrong, but the
        // actual <img> being displayed is using the currentSrc attr regardless.
        // but currentSrc isn't available via getAttribute(...) and so returns the
        // whole URL...hmmm.
        // Unfortunately updating the .src on an <picture><source><img></picture>
        // doesn't trigger a repaint in Firefox, but it does in Chrome?
        let originalHref = new RelativeUrl(img.currentSrc, origin);
        if (originalHref) {
            // const newHref = originalHref.replace(/(&|\\?)livereloadish=([0-9]+.[0-9]+)/, `$1livereloadish=${mtime}`);
            // const newHref = ensureFreshUrl(originalHref, mtime, origin);
            const newHref = originalHref.changeLivereloadishValue(mtime).toString();
            console.debug(logIMG, logFmt, `Replacing ${originalHref} with ${newHref} in-place`);
            img.setAttribute('src', newHref);
            return newHref;
        }
        return "";
    }
    const replaceImageInStyle: Replacement<HTMLElement | CSSStyleRule> = function(element, mtime: number) {
        const originalHref = element.style.backgroundImage;
        if (originalHref) {
            const urlExtractor = /url\((['"]{0,1})\s*(.*?)(["']{0,1})\)/g;
            const newHref = originalHref.replace(urlExtractor, function(_fullText, leftQuote, actualHref, rightQuote, _matchStartPos, _inputValue) {
                let usingOrigin = origin;
                // relative URLs inside CSS files need special construction,
                // and changing the origin to the full path to the CSS file seems
                // to fix it.
                if (actualHref.indexOf("..") > -1 && "parentStyleSheet" in element && element.parentStyleSheet?.href) {
                    usingOrigin = element.parentStyleSheet.href;
                }
                const replacementUrl = new RelativeUrl(actualHref, usingOrigin).changeLivereloadishValue(mtime).toString();
                return `url(${leftQuote}${replacementUrl}${rightQuote})`;
            })
            console.debug(logIMG, logFmt, `Replacing inline style ${originalHref}" with ${newHref} in-place`);
            element.style.backgroundImage = newHref;
            return newHref;
        }
        return '';
    }
    const cssStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const file = msg.filename[0];
        const reloadableLinkElements = document.querySelectorAll(`link[rel=stylesheet][href*="${file}"]:not([data-no-reload]):not([data-pending-removal]):not([up-keep])`);
        const linkElements: HTMLLinkElement[] = Array.prototype.slice.call(reloadableLinkElements);
        for (const linkElement of linkElements) {
            replaceCSSFile(linkElement, msg.new_time, origin);
        }
    }
    const refreshStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const file = msg.filename[0];
        console.debug(logPage, logFmt, `Reloading the page, because ${file} changed`);
        livereloadishTeardown();
        return document.location.reload();
    }
    const noopStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        console.error(logPrefix, logFmt, "Don't know how to process this", msg);
    }
    const queuedUp: { [key: string]: AssetChangeData } = {};
    const queuedUpStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const file = msg.filename[0];
        const mtime = msg.new_time;
        console.debug(logQueue, logFmt, `Deferring ${file} (modified at: ${mtime}) until page is visible`);
        queuedUp[file] = msg;
    }

    const pageStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        // TODO: Maybe work with Sennajs, Barbajs, SmoothStatejs?
        // eg:
        // For smoothstate, we'd do smoothstate.load('url.html', false, false) (no push, no cache)
        // For barba we'd do barba.go('url.html', ...) I think?
        // For Sennajs it'd be app.navigate('url.html') by the look of it;
        const file = msg.filename[0];
        const definitelyRequiresReload = msg.filename[3];
        if (definitelyRequiresReload) {
            console.debug(logPage, logFmt, `Server suggested that this must do a full reload, because ${file} changed`);
            return refreshStrategy(msg);
        }
        // @ts-ignore
        const { up: unpoly, Turbolinks: turbolinks, Swup: Swup, swup: swupInstance, location: url} = window;
        if (unpoly && unpoly?.version && unpoly?.reload) {
            console.debug(logPage, logFmt, `I think this is an Unpoly (https://unpoly.com/) page`);
            console.debug(logPage, logFmt, `Reloading the root fragment vis up.reload(...), because ${file} changed`);
            unpoly.reload({navigate: true, cache: false}).catch((_renderResult: any) => {
                // Intentionally do a double-request to get any styles necessary for
                // an error page. The error page itself will have a SSE connection (hmmm)
                // that will resolve and reload it if it's due to a template error etc.
                console.debug(logPage, logFmt, `An error occurred doing a partial reload because ${file} changed`);
                return refreshStrategy(msg);
            });
        } else if (turbolinks && turbolinks?.supported && turbolinks?.visit) {
            console.debug(logPage, logFmt, `I think this is a Turbolinks (https://github.com/turbolinks/turbolinks) page`);
            console.debug(logPage, logFmt, `Reloading the content via Turbolinks.visit(), because ${file} changed`);
            turbolinks.visit(url.toString());
        } else if (Swup) {
            console.debug(logPage, logFmt, `I think this is a Swup (https://swup.js.org/) page`);
            if (swupInstance && swupInstance?.loadPage) {
                console.debug(logPage, logFmt, `Reloading the content via swup.reloadPage(...), because ${file} changed`);
                swupInstance.loadPage({
                    'url': url.toString(),
                })
            } else {
                console.debug(logPage, logFmt, `Cannot find the swup instance as 'window.swup' (possibly defined as a non global const/var`);
                return refreshStrategy(msg);
            }
        } else {
            return refreshStrategy(msg);
        }
    }

    const jsStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const origin = document.location.origin;
        const file = msg.filename[0];
        const possiblyReloadableScriptElements = document.querySelectorAll(`script[src*="${file}"]:not([data-no-reload]):not([data-pending-removal]):not([data-turbolinks-eval="false"]):not([up-keep])`);
        const scriptElements: HTMLScriptElement[] = Array.prototype.slice.call(possiblyReloadableScriptElements);
        for (const scriptElement of scriptElements) {
            const reloadable = scriptElement.dataset.reloadable;
            const src = scriptElement.src;
            if (reloadable === "" || reloadable === "true") {
                console.debug(logJS, logFmt, `${src} is marked as reloadable`);
                replaceJSFile(scriptElement, msg.new_time, origin);
            } else {
                // Now we have to reload, so we can stop immediately in case there were multiple
                // replacements to deal with.
                console.debug(logJS, logFmt, `${src} is not reloadable`);
                return refreshStrategy(msg);
            }
        }
    }

    const imageStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        // TODO: https://github.com/livereload/livereload-js/blob/12cff7df9dcb36a14c00c5c092fef86efd201910/src/reloader.js#L238
        // Ideally handle <img> <picture>, stylesheet url(...) images, probably favicons etc...
        const origin = document.location.origin;
        const file = msg.filename[0];
        const possiblyReloadableScriptElements = document.images;
        const imageElements: HTMLImageElement[] = Array.prototype.slice.call(possiblyReloadableScriptElements);
        const totalReplacements: string[] = [];
        for (const imageElement of imageElements) {
            if (imageElement.currentSrc.indexOf(file) > -1) {
                if (imageElement.src.indexOf(file) === -1) {
                    console.debug(logIMG, logFmt, `Currently using a separate img (via responsive srcset="..." or picture element) ... replacement may not work everywhere (Hi Firefox!)`);
                }
                const newHref = replaceImageFile(imageElement, msg.new_time, origin);
                if (newHref !== "") {
                    totalReplacements.push(newHref);
                }
            }
        }
        // Can't say I care about border images, so we'll only look for backgrounds...
        // Note that we could see items from document.images in here, because they could
        // have placeholder backgrounds...
        const inlineStyles = document.querySelectorAll(`[style*="background"][style*="${file}"]`);
        const imageStyleElements: HTMLElement[] = Array.prototype.slice.call(inlineStyles);
        for (const imageElement of imageStyleElements) {
            if (imageElement.style.backgroundImage) {
                const newHref = replaceImageInStyle(imageElement, msg.new_time, origin);
                if (newHref !== "") {
                    totalReplacements.push(newHref);
                }
            }
        }
        const styleSheets: CSSStyleSheet[] = Array.prototype.slice.call(document.styleSheets);
        for (const styleSheet of styleSheets) {
            let rules: CSSRule[];
            try {
                rules = Array.prototype.slice.call(styleSheet.cssRules);
            } catch (e) {
                console.warn(logIMG, logFmt, `Failed to read get CSSRuleList from ${styleSheet.href}, probably it's remote and uneditable?`);
                continue;
            }
            for (const rule of rules) {
                if (rule.cssText.indexOf("background") > -1) {
                    const newHref = replaceImageInStyle(rule as CSSStyleRule, msg.new_time, origin);
                    if (newHref !== "") {
                        totalReplacements.push(newHref);
                    }
                }
            }
        }
        if (totalReplacements.length === 0) {
            console.debug(logIMG, logFmt, `Failed to find any images or CSS styles referencing ${file}`);
        }
    }

    const reloadStrategies: { [key in MimeType]: ReloadStrategy } = {
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
    }
    const queudeUpReloadStrategies: { [key in MimeType]: ReloadStrategy } = {
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
    }

    let activeReloadStrategies = reloadStrategies;

    const switchStrategies = (_event: Event) => {
        if (document.visibilityState === "hidden") {
            activeReloadStrategies = queudeUpReloadStrategies;
            console.debug(logQueue, logFmt, "Switched reloaders until page is visible again");
        } else {
            activeReloadStrategies = reloadStrategies;
            console.debug(logQueue, logFmt, "Switched reloaders back to defaults because page became visible");
            if (evtSource === null && Object.keys(queuedUp).length) {
                console.debug(logQueue, logFmt, "It looks like the server may have gone away though, so these will probably fail...");
            }
            // What happens if multiple trigger and want to do a full reload?
            // Will the queuedUp list have drained fully because unload has
            // fired and livereloadishTeardown deleted them? Not sure...
            for (const key in queuedUp) {
                const msg = queuedUp[key];
                const selectedReloadStrategy = activeReloadStrategies[msg.asset_type];
                selectedReloadStrategy(msg);
                delete queuedUp[key];
            }
        }
    }

    let errorTimer: null | number = null;
    let errorCount = 0;
    const connectionOpened = (_event: Event) => {
        console.debug(logPrefix, logFmt, `SSE connection opened`);
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
    }

    // Based on https://github.com/fanout/reconnecting-eventsource ... ish.
    const connectionErrored = (_event: Event): void => {
        errorCount++;
        if (evtSource !== null) {
            evtSource.close();
            evtSource = null;
            if (errorCount < 10) {
                // Wait between 1-3 seconds before retrying.
                const timeout = Math.max(1000, Math.round(3000 * Math.random()));
                console.debug(logPrefix, logFmt, `Waiting for ${timeout}ms to restart SSE connection`);
                errorTimer = setTimeout(livereloadishSetup, timeout);
            } else {
                console.error(logPrefix, logFmt, `Cancelling SSE connection attempts after ${errorCount} retries. Manually reload the page...`)
            }
        }
    }
    const reconnectRequested = (_event: Event): void => {
        console.debug(logPrefix, logFmt, `Server asked for a reconnect`);
        return connectionErrored(_event);
    }
    const disconnectRequested = (_event: Event): void => {
        errorCount = 999;
        console.debug(logPrefix, logFmt, `Server asked for a disconnect`);
        return connectionErrored(_event);
    }

    const assetHasChanged = (event: Event): void => {
        const msg = JSON.parse((event as MessageEvent).data) as AssetChangeData;
        const selectedReloadStrategy = activeReloadStrategies[msg.asset_type] || activeReloadStrategies["application/octet-stream"];
        return selectedReloadStrategy(msg);
    }

    const promptedPreviously: string[] = [];
    const assetHasDeleted = (event: Event): void => {
        const msg = JSON.parse((event as MessageEvent).data) as AssetChangeData;
        const fileName = msg.filename[0];
        if (promptedPreviously.indexOf(fileName) > -1) {
            console.debug(logPrefix, logFmt, `${fileName} has been moved or deleted, and the user has already been notified`);
            return;
        }
        promptedPreviously.push(fileName);
        const confirmReload = window.confirm(`File "${fileName}" has been moved or deleted, reload the page?`)
        if (confirmReload) {
            return refreshStrategy(msg);
        } else {
            console.error(logPrefix, logFmt, `${fileName} has been moved or deleted, page may need manually reloading`);
        }
    }

    const livereloadishSetup = (): void => {
        const includer: HTMLScriptElement | null = document.querySelector("script[data-livereloadish-url]");
        if (includer !== null) {
            const livereloadishUrl = includer.dataset.livereloadishUrl;
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
            } else {
                console.error(logPrefix, logFmt, `Included without an empty value in the data-livereloadish-url="" attribute, cannot continue`);
            }
        } else {
            console.error(logPrefix, logFmt, `Included without a data-livereloadish-url="..." attribute, cannot continue`);
        }
    }
    const livereloadishTeardown = (): void => {
        // destroy these values ASAP
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
        for (const key in queuedUp) {
            delete queuedUp[key];
        }
        // Don't know that I can remove ... myself.
        // window.removeEventListener('pagehide', unload);
        document.removeEventListener('visibilitychange', switchStrategies);
        if (evtSource !== null) {
            evtSource.close();
            console.debug(logPrefix, logFmt, `SSE connection closed, not reconnecting`);
            evtSource.removeEventListener('open', connectionOpened);
            evtSource.removeEventListener('error', connectionErrored);
            evtSource.removeEventListener('assets_change', assetHasChanged);
            evtSource.removeEventListener('assets_delete', assetHasDeleted);
            evtSource.removeEventListener('disconnect', disconnectRequested);
            evtSource.removeEventListener('reconnect', reconnectRequested);
            console.debug(logPrefix, logFmt, `Event listeners unbound`);
            evtSource = null;
        }
    }

    // https://cwestblog.com/2020/02/19/javascript-snippet-domready-function/
    if (/^(loaded|complete|interactive)$/.test(document.readyState)) {
        console.debug(logPrefix, logFmt, `DOM is ready, executing immediately`);
        livereloadishSetup.call(document);
    } else {
        console.debug(logPrefix, logFmt, `Awaiting DOM-Ready event`);
        document.addEventListener('DOMContentLoaded', livereloadishSetup);
    }
})();
