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
    
    // enum MimeType {
    //     CSS = "text/css",
    //     JS = "text/javascript",
    //     HTML = "text/html",
    //     UNKNOWN = "application/octet-stream",
    // }
    interface AssetChangeData {
        msg: string,
        asset_type: MimeType,
        old_time: number,
        new_time: number,
        filename: [string, string, number],
    }

    interface ReloadStrategy { (msg: AssetChangeData): void }


    // interface ContentType { "text/css" | "text/javascript"}

    //
    // interface ReloadStrategy {
    //     reload: (msg: AssetChangeData) => void
    // }
    //
    // interface ReplaceStrategy<T> {
    //     replace: (element: T, mtime: number) => string
    // }
    //
    // class CSSReloadStrategy implements ReloadStrategy, ReplaceStrategy<HTMLLinkElement> {
    //     constructor() {
    //     }
    //     reload(msg: AssetChangeData) {
    //         const file = msg.filename[0];
    //         const reloadableLinkElements = document.querySelectorAll(`link[rel=stylesheet][href*="${file}"]:not([data-no-reload]):not([data-pending-removal])`);
    //         const linkElements: HTMLLinkElement[] = Array.prototype.slice.call(reloadableLinkElements);
    //         for (const linkElement of linkElements) {
    //             this.replace(linkElement, msg.new_time);
    //         }
    //     }
    //
    //     replace(element: HTMLLinkElement, mtime: number): string {
    //         // Doing it this way, by creating a new link Node and deleting the old one
    //         // afterwards avoids the classic FOUC (flash-of-unstyled-content)
    //         // compared to just changing the URL, which depending on the browser (hi Firefox)
    //         // may unload the styles and repaint them.
    //         // using .href causes Chrome, at least, to give you the _whole_ URL, scheme + hostname etc
    //         // which could be problematic using *= instead of ^=
    //         const originalHref = element.getAttribute('href');
    //         if (originalHref !== null) {
    //             const newelement = document.createElement("element");
    //             for (let i = 0; i < element.attributes.length; i++) {
    //                 const {name, value} = element.attributes[i];
    //                 newelement.setAttribute(name, value)
    //             }
    //             // uuid regex: [0-9a-fA-F\-]{36}
    //             const newHref = originalHref.replace(/(&|\\?)livereloadish=([0-9]+.[0-9]+)/, `$1livereloadish=${mtime}`);
    //             newelement.setAttribute('href', newHref);
    //             const onComplete = function (_event: Event) {
    //                 console.debug(logPrefix, logFmt, `Removing ${originalHref} in favour of ${newHref}`);
    //                 element.parentNode?.removeChild(element);
    //             };
    //             newelement.addEventListener('error', onComplete);
    //             newelement.addEventListener('load', onComplete);
    //             console.debug(logPrefix, logFmt, `Adding ${newHref} to replace ${originalHref}`);
    //             element.setAttribute('data-pending-removal', '');
    //             // element.parentNode?.appendChild(newelement);
    //             element.parentNode?.insertBefore(newelement, element.nextSibling)
    //             return newHref;
    //         }
    //         return '';
    //     }
    // }
    //
    // class ForceRefreshStrategy implements ReloadStrategy {
    //     reload(msg: AssetChangeData) {
    //         const file = msg.filename[0];
    //         console.debug(logPrefix, logFmt, `Reloading the page, because ${file} changed`);
    //         connectionClose(fakeEvent);
    //         return document.location.reload();
    //     }
    // }
    //
    // class DoNothingStrategy implements ReloadStrategy {
    //     reload(msg: AssetChangeData) {
    //         console.error(logPrefix, logFmt, "Don't know how to process this", msg);
    //     }
    // }
    //
    // class PageStrategy extends ForceRefreshStrategy implements ReloadStrategy {
    //     reload(msg: AssetChangeData) {
    //         super.reload(msg);
    //     }
    // }

    let evtSource: EventSource | null = null;
    // const fakeEvent: Event = new Event('livreloadish.ignored');

    // https://caniuse.com/mdn-api_console_log_substitution_strings
    const logFmt = `color: #666666; padding: 1px 3px; border: 1px solid #bbbbbb; border-radius: 2px; font-size: 90%; display: inline-block`;
    const logPrefix = `%clivereloadish`;
    const logCSS = logPrefix + `: CSS`;
    const logJS = logPrefix + `: JS`;
    const logPage = logPrefix + `: Page`;
    const logQueue = logPrefix + `: Queue`;

    const replaceCSSFile = function (link: HTMLLinkElement, mtime: number): string {
        // Doing it this way, by creating a new link Node and deleting the old one
        // afterwards avoids the classic FOUC (flash-of-unstyled-content)
        // compared to just changing the URL, which depending on the browser (hi Firefox)
        // may unload the styles and repaint them.
        // using .href causes Chrome, at least, to give you the _whole_ URL, scheme + hostname etc
        // which could be problematic using *= instead of ^=
        const originalHref = link.getAttribute('href');
        if (originalHref !== null) {
            const newLink = document.createElement("link");
            for (let i = 0; i < link.attributes.length; i++) {
                const {name, value} = link.attributes[i];
                newLink.setAttribute(name, value)
            }
            // uuid regex: [0-9a-fA-F\-]{36}
            const newHref = originalHref.replace(/(&|\\?)livereloadish=([0-9]+.[0-9]+)/, `$1livereloadish=${mtime}`);
            newLink.setAttribute('href', newHref);
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
        return '';
    };

    const replaceJSFile = function (script: HTMLScriptElement, mtime: number): string {
        // Like with CSS, we replace the element rather than adjust the src="..."
        // because that doesn't trigger re-running?
        const originalHref = script.getAttribute('src');
        if (originalHref !== null) {
            const newScript = document.createElement("script");
            for (let i = 0; i < script.attributes.length; i++) {
                const {name, value} = script.attributes[i];
                newScript.setAttribute(name, value)
            }
            const newHref = originalHref.replace(/(&|\\?)livereloadish=([0-9]+.[0-9]+)/, `$1livereloadish=${mtime}`);
            newScript.setAttribute('src', newHref);
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

    const cssStrategy = (msg: AssetChangeData): void => {
        const file = msg.filename[0];
        const reloadableLinkElements = document.querySelectorAll(`link[rel=stylesheet][href*="${file}"]:not([data-no-reload]):not([data-pending-removal]):not([up-keep])`);
        const linkElements: HTMLLinkElement[] = Array.prototype.slice.call(reloadableLinkElements);
        for (const linkElement of linkElements) {
            replaceCSSFile(linkElement, msg.new_time);
        }
    }
    const reloadStrategy = (msg: AssetChangeData) => {
        const file = msg.filename[0];
        console.debug(logPage, logFmt, `Reloading the page, because ${file} changed`);
        livereloadishTeardown();
        return document.location.reload();
    }
    const noopStrategy = (msg: AssetChangeData) => {
        console.error(logPrefix, logFmt, "Don't know how to process this", msg);
    }
    const queuedUp: { [key: string]: AssetChangeData } = {};
    const queuedUpStrategy = (msg: AssetChangeData) => {
        const file = msg.filename[0];
        const mtime = msg.new_time;
        console.debug(logQueue, logFmt, `Deferring ${file} (modified at: ${mtime}) until page is visible`);
        queuedUp[file] = msg;
    }

    const pageStrategy = (msg: AssetChangeData) => {
        // TODO: Maybe work with Sennajs, Barbajs, SmoothStatejs?
        // eg:
        // For smoothstate, we'd do smoothstate.load('url.html', false, false) (no push, no cache)
        // For barba we'd do barba.go('url.html', ...) I think?
        // For Sennajs it'd be app.navigate('url.html') by the look of it;
        const file = msg.filename[0];
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
                reloadStrategy(msg);
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
                reloadStrategy(msg);
            }
        } else {
            reloadStrategy(msg);
        }
    };
    const jsStrategy = (msg: AssetChangeData) => {
        const file = msg.filename[0];
        const possiblyReloadableScriptElements = document.querySelectorAll(`script[src*="${file}"]:not([data-no-reload]):not([data-pending-removal]):not([data-turbolinks-eval="false"]):not([up-keep])`);
        const scriptElements: HTMLScriptElement[] = Array.prototype.slice.call(possiblyReloadableScriptElements);
        for (const scriptElement of scriptElements) {
            const reloadable = scriptElement.dataset.reloadable;
            const src = scriptElement.getAttribute('src');
            if (reloadable === "" || reloadable === "true") {
                console.debug(logJS, logFmt, `${src} is marked as reloadable`);
                replaceJSFile(scriptElement, msg.new_time);
            } else {
                // Now we have to reload, so we can stop immediately in case there were multiple
                // replacements to deal with.
                console.debug(logJS, logFmt, `${src} is not reloadable`);
                return reloadStrategy(msg);
            }
        }
    }

    const reloadStrategies: { [key in MimeType]: ReloadStrategy } = {
        "text/css": cssStrategy,
        "text/javascript": jsStrategy,
        "text/html": pageStrategy,
        "application/xhtml+xml": pageStrategy,
        "image/png": reloadStrategy,
        "image/jpeg": reloadStrategy,
        "image/svg+xml": reloadStrategy,
        "image/webp": reloadStrategy,
        "image/gif": reloadStrategy,
        "font/ttf": reloadStrategy,
        "font/woff": reloadStrategy,
        "font/woff2": reloadStrategy,
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
            if (evtSource === null) {
                console.debug(logQueue, logFmt, "It looks like the server may have gone away though, so these will probably fail...");
            }
            for (const key in queuedUp) {
                const msg = queuedUp[key];
                const reloadStrategy = activeReloadStrategies[msg.asset_type];
                reloadStrategy(msg);
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

    // Based on https://github.com/fanout/reconnecting-eventsource
    const connectionErrored = (_event: Event) => {
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
    const reconnectRequested = (_event: Event) => {
        console.debug(logPrefix, logFmt, `Server asked for a reconnect`);
        return connectionErrored(_event);
    }
    const disconnectRequested = (_event: Event) => {
        errorCount = 999;
        console.debug(logPrefix, logFmt, `Server asked for a disconnect`);
        return connectionErrored(_event);
    }

    const assetHasChanged = (event: Event) => {
        const msg = JSON.parse((event as MessageEvent).data) as AssetChangeData;
        const reloadStrategy = activeReloadStrategies[msg.asset_type] || activeReloadStrategies["application/octet-stream"];
        return reloadStrategy(msg);
    }

    const promptedPreviously: string[] = [];
    const assetHasDeleted = (event: Event) => {
        const msg = JSON.parse((event as MessageEvent).data) as AssetChangeData;
        const fileName = msg.filename[0];
        if (promptedPreviously.indexOf(fileName) > -1) {
            console.debug(logPrefix, logFmt, `${fileName} has been moved or deleted, and the user has already been notified`);
            return;
        }
        promptedPreviously.push(fileName);
        const confirmReload = window.confirm(`File "${fileName}" has been moved or deleted, reload the page?`)
        if (confirmReload) {
            return reloadStrategy(msg);
        } else {
            console.error(logPrefix, logFmt, `${fileName} has been moved or deleted, page may need manually reloading`);
        }
    }

    const livereloadishSetup = () => {
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
    const livereloadishTeardown = () => {
        // Don't know that I can remove ... myself.
        // window.removeEventListener('pagehide', unload);
        document.removeEventListener('visibilitychange', switchStrategies);
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
        for (const key in queuedUp) {
            delete queuedUp[key];
        }
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
