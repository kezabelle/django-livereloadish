(() => {
    // What follows immediately below is a copy of udomdiff 1.1.0, but adjusted
    // to remove it's own IIFE + exports, and just bind straight to the udomdiff
    // variable, and change the arguments to satisfy TS better.
    // I've inlined it so there's only 1 request for livereloadish client side stuff.
    // See the license below for attribution to Andrea Giammarchi (https://github.com/WebReflection)
    // See https://github.com/WebReflection/udomdiff for the repository itself. It's a cool library.

    /**
     * ISC License
     *
     * Copyright (c) 2020, Andrea Giammarchi, @WebReflection
     *
     * Permission to use, copy, modify, and/or distribute this software for any
     * purpose with or without fee is hereby granted, provided that the above
     * copyright notice and this permission notice appear in all copies.
     *
     * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
     * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
     * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
     * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
     * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
     * OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
     * PERFORMANCE OF THIS SOFTWARE.
     */
    const udomdiff = (function (parentNode: Node, a: Node[], b: Node[], get: (entry: Node, action: number) => Node, before: Node | null): Node[] {
        var bLength = b.length;
        var aEnd = a.length;
        var bEnd = bLength;
        var aStart = 0;
        var bStart = 0;
        var map = null;

        while (aStart < aEnd || bStart < bEnd) {
            // append head, tail, or nodes in between: fast path
            if (aEnd === aStart) {
                // we could be in a situation where the rest of nodes that
                // need to be added are not at the end, and in such case
                // the node to `insertBefore`, if the index is more than 0
                // must be retrieved, otherwise it's gonna be the first item.
                var node = bEnd < bLength ? bStart ? get(b[bStart - 1], -0).nextSibling : get(b[bEnd - bStart], 0) : before;

                while (bStart < bEnd) {
                    parentNode.insertBefore(get(b[bStart++], 1), node);
                }
            } // remove head or tail: fast path
            else if (bEnd === bStart) {
                while (aStart < aEnd) {
                    // remove the node only if it's unknown or not live
                    if (!map || !map.has(a[aStart])) parentNode.removeChild(get(a[aStart], -1));
                    aStart++;
                }
            } // same node: fast path
            else if (a[aStart] === b[bStart]) {
                aStart++;
                bStart++;
            } // same tail: fast path
            else if (a[aEnd - 1] === b[bEnd - 1]) {
                aEnd--;
                bEnd--;
            } // The once here single last swap "fast path" has been removed in v1.1.0
                // https://github.com/WebReflection/udomdiff/blob/single-final-swap/esm/index.js#L69-L85
            // reverse swap: also fast path
            else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
                // this is a "shrink" operation that could happen in these cases:
                // [1, 2, 3, 4, 5]
                // [1, 4, 3, 2, 5]
                // or asymmetric too
                // [1, 2, 3, 4, 5]
                // [1, 2, 3, 5, 6, 4]
                var _node = get(a[--aEnd], -1).nextSibling;
                parentNode.insertBefore(get(b[bStart++], 1), get(a[aStart++], -1).nextSibling);
                parentNode.insertBefore(get(b[--bEnd], 1), _node); // mark the future index as identical (yeah, it's dirty, but cheap 👍)
                // The main reason to do this, is that when a[aEnd] will be reached,
                // the loop will likely be on the fast path, as identical to b[bEnd].
                // In the best case scenario, the next loop will skip the tail,
                // but in the worst one, this node will be considered as already
                // processed, bailing out pretty quickly from the map index check

                a[aEnd] = b[bEnd];
            } // map based fallback, "slow" path
            else {
                // the map requires an O(bEnd - bStart) operation once
                // to store all future nodes indexes for later purposes.
                // In the worst case scenario, this is a full O(N) cost,
                // and such scenario happens at least when all nodes are different,
                // but also if both first and last items of the lists are different
                if (!map) {
                    map = new Map();
                    var i = bStart;

                    while (i < bEnd) {
                        map.set(b[i], i++);
                    }
                } // if it's a future node, hence it needs some handling


                if (map.has(a[aStart])) {
                    // grab the index of such node, 'cause it might have been processed
                    var index = map.get(a[aStart]); // if it's not already processed, look on demand for the next LCS

                    if (bStart < index && index < bEnd) {
                        var _i = aStart; // counts the amount of nodes that are the same in the future

                        var sequence = 1;

                        while (++_i < aEnd && _i < bEnd && map.get(a[_i]) === index + sequence) {
                            sequence++;
                        } // effort decision here: if the sequence is longer than replaces
                        // needed to reach such sequence, which would brings again this loop
                        // to the fast path, prepend the difference before a sequence,
                        // and move only the future list index forward, so that aStart
                        // and bStart will be aligned again, hence on the fast path.
                        // An example considering aStart and bStart are both 0:
                        // a: [1, 2, 3, 4]
                        // b: [7, 1, 2, 3, 6]
                        // this would place 7 before 1 and, from that time on, 1, 2, and 3
                        // will be processed at zero cost


                        if (sequence > index - bStart) {
                            var _node2 = get(a[aStart], 0);

                            while (bStart < index) {
                                parentNode.insertBefore(get(b[bStart++], 1), _node2);
                            }
                        } // if the effort wasn't good enough, fallback to a replace,
                            // moving both source and target indexes forward, hoping that some
                        // similar node will be found later on, to go back to the fast path
                        else {
                            parentNode.replaceChild(get(b[bStart++], 1), get(a[aStart++], -1));
                        }
                    } // otherwise move the source forward, 'cause there's nothing to do
                    else aStart++;
                } // this node has no meaning in the future list, so it's more than safe
                    // to remove it, and check the next live node out instead, meaning
                // that only the live list index should be forwarded
                else parentNode.removeChild(get(a[aStart++], -1));
            }
        }
        return b;
    });
    // Here ends the copy-paste of udomdiff, and the license that's under (ISC)
    // Now we're back into first party stuff, which is FreeBSD 2-clause.

    /**
     * A set of all the common content types likely to be used in a web context
     * which may need to trigger a refresh of some sort.
     */
    type MimeType =
        "text/css" |
        "text/javascript" |
        "application/javascript" |
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
        "text/x-python" |
        "application/x-python-code" |
        "text/markdown" |
        "application/octet-stream";


    interface AssetChange {
        relative_path: string,
        absolute_path: string,
        filename: string,
        mtime: number,
        mtime_iso: string,
        requires_full_reload: boolean
    }

    /**
     * An event from the SSE connection describing the file which changed or
     * was deleted, and the modification timestamps to be used.
     */
    interface AssetChangeData {
        msg: string,
        asset_type: MimeType,
        old_time: number,
        new_time: number,
        info: AssetChange,
    }

    /**
     * A reload strategy is passed a message containing enough data to find matching
     * elements to modify and what to modify them to.
     */
    interface ReloadStrategy {
        (msg: AssetChangeData): void
    }

    /**
     * A replacement is given an object (eg: an HTMLElement subclass
     * or a CSSRule subclass) and a modification time to update to, along with
     * the probably correct source origin. The element should be replaced by
     * an equivalent with the new mtime, or modified in place with the new mtime
     * if that would trigger a reload (eg: for images it can be done in place,
     * for scripts and stylesheets it cannot)
     */
    interface Replacement<T> {
        (element: T, msg: AssetChangeData, origin: string): string
    }

    let evtSource: EventSource | null = null;

    // https://caniuse.com/mdn-api_console_log_substitution_strings
    const logFmt = `color: #666666; padding: 1px 3px; border: 1px solid #bbbbbb; border-radius: 2px; font-size: 90%; display: inline-block`;
    const logPrefix = `%clivereloadish`;
    const logCSS = logPrefix + `: CSS`;
    const logJS = logPrefix + `: JS`;
    const logIMG = logPrefix + `: Image`;
    const logPage = logPrefix + `: Page`;
    const logState = logPrefix + `: State`;
    const logQueue = logPrefix + `: Queue`;

    /**
     * Wraps over a `URL` to provide mutation free adding of our cache-busting
     * querystring parameter AND for serialisation to a string without including
     * the origin prefix in the output, for nicer logging.
     */
    class RelativeUrl {
        private address: URL;

        /**
         * Formats an absolute OR relative URL into a complete (absolute) URL
         * based on the given origin. For URLs like "../asdf.jpg" this requires
         * knowing the right origin to use as the base URL.
         * See eg: replacing relative images in stylesheets for that issue.
         */
        constructor(url: string, origin: string) {
            this.address = new URL(url, origin);
        }

        /**
         * Take off the origin (scheme://hostname:port/) if it's there ... it probably
         * is because we're not using getAttribute, which gives us the raw value rather
         * than the one which has gone through the encoding and whatnot.
         */
        toString(): string {
            //
            let newUrl = this.address.toString();
            const startsWithOrigin = newUrl.indexOf(origin);
            if (startsWithOrigin === 0) {
                newUrl = newUrl.slice(origin.length);
            }
            return newUrl;
        }

        /**
         * Generates a new URL() instance based on the current one, and updates
         * the querystring value `livereloadish` to the new `mtime` argument.
         */
        changeLivereloadishValue(mtime: number): RelativeUrl {
            const newUrl = new RelativeUrl(this.address.toString(), this.address.origin);
            const searchParams = newUrl.address.searchParams;
            searchParams.set("livereloadish", mtime.toString());
            newUrl.address.search = searchParams.toString();
            return newUrl;
        }
    }

    class LivereloadishPageState {
        public dataKey: string;
        public scrollKey: string;
        public focusKey: string;
        constructor(key: string) {
            this.dataKey = `forms_for_${key}`;
            this.scrollKey = `scrolls_for_${key}`;
            this.focusKey = `focus_for_${key}`;
        }

        saveForm() {
            const formElements: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = Array.prototype.slice.call(document.querySelectorAll('input, select, textarea'));
            const formValues: Record<string, ["checked" | "value" | "selected", string | boolean]> = {};
            for (const element of formElements) {
                const tagName = element.tagName.toLowerCase() as  "input" | "select" | "textarea";
                const name = element.name;

                let formSelector = "";
                if (element.form) {
                    formSelector += "form";
                    if (element.form.name) {
                        formSelector += `[name=${element.form.name}]`;
                    }
                }

                switch (tagName) {
                    case "input":
                        const subType = (element as HTMLInputElement).type;
                        if (subType === "checkbox" || subType === "radio") {
                            if ((element as HTMLInputElement).checked === true) {
                                formValues[`${formSelector} input[name="${name}"][value="${element.value}"]`] = ["checked", (element as HTMLInputElement).checked];
                            }
                        } else if (element.value.trim()) {
                            formValues[`${formSelector} input[name="${name}"]`] = ["value", element.value];
                        }
                        break;
                    case "select":
                        const selectedOptions: HTMLOptionElement[] = Array.prototype.slice.call((element as HTMLSelectElement).selectedOptions);
                        for (const selectedOption of selectedOptions) {
                            if (element.value.trim()) {
                                formValues[`${formSelector} select[name="${name}"] option[value="${selectedOption.value}"]`] = ["selected", element.value];
                            }
                        }
                        break;
                    case "textarea":
                        if (element.value.trim()) {
                            formValues[`${formSelector} textarea[name="${name}"]`] = ["value", element.value];
                        }
                        break;
                    default:
                        ((x: never) => {
                            throw new Error(`${x} was unhandled!`);
                        })(tagName);
                }
            }
            const serializedFormState = JSON.stringify(formValues);
            if (Object.keys(formValues).length > 0) {
                sessionStorage.setItem(this.dataKey, serializedFormState);
            } else {
                // There's nothing to persist, let's also make sure we tidy out
                // any stragglers.
                sessionStorage.removeItem(this.dataKey);
            }
            return [formValues, serializedFormState];
        }

        saveScroll() {
            const scrollPos = {"x": window.scrollX, "y" :window.scrollY};
            const serializedScrollState = JSON.stringify(scrollPos);
            if (window.scrollX !== 0 || window.scrollY !== 0) {
                sessionStorage.setItem(this.scrollKey, serializedScrollState);
            } else {
                // There's nothing to persist, let's also make sure we tidy out
                // any stragglers.
                sessionStorage.removeItem(this.scrollKey);
            }
            return [scrollPos, serializedScrollState]
        }

        saveActiveElement() {
            if (document.activeElement) {
                const tagName = document.activeElement.tagName.toLowerCase();
                const id = document.activeElement.id;
                const classes = document.activeElement.className;
                let identifier = document.activeElement.id;
                if (identifier) {
                    identifier = `#${identifier}`;
                } else {
                    identifier = document.activeElement.className.replace(/\s+/g, ' ').trim().replace(/\s/g, '.').trim();
                    if (identifier.length > 1 && identifier.charAt(0) !== '.') {
                        identifier = `.${identifier}`;
                    }
                }
                const selector = `${tagName}${identifier}`;
                if (selector !== tagName) {
                    sessionStorage.setItem(this.focusKey, selector);
                } else {
                    // There's nothing to persist, let's also make sure we tidy out
                    // any stragglers.
                    sessionStorage.removeItem(this.focusKey);
                }
                return [tagName, id, classes, selector]
            }
            return ["", "", "", ""]
        }

        save() {
            const [formValues, serializedFormState] = this.saveForm();
            const [scrollPos, serializedScrollState] = this.saveScroll();
            const [, , , focusSelector] = this.saveActiveElement();
            return [formValues, serializedFormState, scrollPos, serializedScrollState, focusSelector];
        }

        restoreForm() {
            const serializedFormState = sessionStorage.getItem(this.dataKey);
            if (serializedFormState !== null && serializedFormState !== '') {
                const values: Record<string, ["checked" | "value" | "selected", string | boolean]> = JSON.parse(serializedFormState);
                const event = new CustomEvent('change', {
                    detail: null,
                    bubbles: true,
                    cancelable: false,
                    composed: false,
                });
                for (const key in values) {
                    if (values.hasOwnProperty(key)) {
                        const [attrib, value] = values[key];
                        const element: HTMLInputElement | HTMLOptionElement | HTMLTextAreaElement | null = document.querySelector(key);
                        if (element) {
                            console.debug(logState, logFmt, `Restoring value for ${key}`);
                            // This is assuming that the types haven't changed in the reload
                            // though they can do so. e.g: a CheckboxSelectMultiple may become
                            // a SelectMultiple or whatever. I'm not validating it too deeply;
                            // it either works or it doesn't.
                            switch (attrib) {
                                case "checked":
                                    if ("checked" in element && element.checked === false) {
                                        element.checked = true;
                                        element.dispatchEvent(event);
                                    }
                                    break;
                                case "selected":
                                    if ("selected" in element && element.selected === false) {
                                        element.selected = true;
                                        element.dispatchEvent(event);
                                    }
                                    break;
                                case "value":
                                    if (element.value !== value.toString()) {
                                        element.value = value.toString();
                                        element.dispatchEvent(event);
                                    }
                                    break;
                                default:
                                    ((x: never) => {
                                        throw new Error(`${x} was unhandled!`);
                                    })(attrib);
                            }
                        }
                    }
                }
                sessionStorage.removeItem(this.dataKey);
            }
            return serializedFormState !== null;
        }

        restoreScroll() {
            const serializedScrollState = sessionStorage.getItem(this.scrollKey);
            if (serializedScrollState !== null && serializedScrollState !== '') {
                const scrollPos = JSON.parse(serializedScrollState);
                console.debug(logState, logFmt, `Restoring scroll position to vertical: ${scrollPos.y}, horizontal: ${scrollPos.x}`);
                window.scrollTo(scrollPos.x, scrollPos.y);
                sessionStorage.removeItem(this.scrollKey);
            }

            return serializedScrollState !== null;
        }

        restoreActiveElement() {
            const selector = sessionStorage.getItem(this.focusKey);
            if (selector !== null && selector !== '') {
                const elements = document.querySelectorAll(selector);
                const elementCount = elements.length;
                if (elementCount === 1) {
                    (elements[0] as HTMLElement).focus();
                    console.debug(logState, logFmt, `Restoring focus to "${selector}"`);
                } else if (elementCount > 1) {
                    console.debug(logState, logFmt, `Cannot restore focus to "${selector}", multiple elements match`);
                } else {
                    console.debug(logState, logFmt, `Cannot restore focus to "${selector}", no elements match`);
                }
                sessionStorage.removeItem(this.focusKey);
            }
            return selector !== null;
        }

        restore() {
            const restoredForm = this.restoreForm();
            const restoredScroll = this.restoreScroll();
            const restoredFocus = this.restoreActiveElement();
            return restoredForm || restoredScroll || restoredFocus;
        }

        static bindForRefresh() {
            if (/^(loaded|complete|interactive)$/.test(document.readyState)) {
                LivereloadishPageState.restoreAfterRefresh.call(document);
            } else {
                document.addEventListener('DOMContentLoaded', LivereloadishPageState.restoreAfterRefresh);
                document.addEventListener('load', LivereloadishPageState.restoreAfterRefresh);
            }
        }

        /**
         * Essentially, .once(). If a page has to do a full reload, still try and restore
         * the values and then unbind.
         */
        static restoreAfterRefresh() {
            const instance = new LivereloadishPageState(window.location.toString());
            instance.restore();
            document.removeEventListener('load', LivereloadishPageState.restoreAfterRefresh);
            document.removeEventListener('DOMContentLoaded', LivereloadishPageState.restoreAfterRefresh);
        }
    }

    /**
     * Replace an included CSS file (<link rel="stylesheet" href="...">).
     * Creates a new file with all the same attributes and a new querystring to
     * bust any cache/force a load.
     * Destroys the previous CSS file Node when the new one loads or errors.
     * We add a new one and destroy the old one to avoid a classic
     * Flash-of-Unstyled-Content between removal and loading, both of which may
     * be happening in tandem.
     */
    const replaceCSSFile: Replacement<HTMLLinkElement> = function (link, msg: AssetChangeData, origin: string): string {
        if (link.href) {
            const mtime = msg.new_time;
            const originalHref = new RelativeUrl(link.href, origin);
            const newLink = document.createElement("link");
            for (let i = 0; i < link.attributes.length; i++) {
                const {name, value} = link.attributes[i];
                newLink.setAttribute(name, value)
            }
            const newHref = originalHref.changeLivereloadishValue(mtime).toString();
            newLink.href = newHref;
            const onComplete = function (_event: Event): void {
                console.debug(logCSS, logFmt, `Removing ${originalHref} in favour of ${newHref}`);
                link.parentNode?.removeChild(link);
            };
            newLink.addEventListener('error', onComplete);
            newLink.addEventListener('load', onComplete);
            console.debug(logCSS, logFmt, `Adding ${newHref} to replace ${originalHref}`);
            link.setAttribute('data-pending-removal', '');
            link.parentNode?.insertBefore(newLink, link.nextSibling)
            return newHref;
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
    const replaceJSFile: Replacement<HTMLScriptElement> = function (script, msg: AssetChangeData, origin: string): string {
        // Like with CSS, we replace the element rather than adjust the src="..."
        // because that doesn't trigger re-running?
        if (script.src) {
            const mtime = msg.new_time;
            const originalHref = new RelativeUrl(script.src, origin);
            const newScript = document.createElement("script");
            for (let i = 0; i < script.attributes.length; i++) {
                const {name, value} = script.attributes[i];
                newScript.setAttribute(name, value)
            }
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
            script.parentNode?.insertBefore(newScript, script.nextSibling)
            return newHref;
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
    const replaceImageFile: Replacement<HTMLImageElement | HTMLSourceElement> = function (img, msg: AssetChangeData): string {
        const mtime = msg.new_time;
        if (img.src) {
            const originalHref = new RelativeUrl(img.src, origin);
            const newHref = originalHref.changeLivereloadishValue(mtime).toString();
            console.debug(logIMG, logFmt, `Replacing src ${originalHref} with ${newHref} in-place`);
            img.setAttribute('src', newHref);
            return newHref;
        }
        if (img.srcset) {
            // https://github.com/sindresorhus/srcset/blob/9549e25ca7919a08f2fb519e84784658e4009c9a/index.js#L18
            const urlExtractor = /\s*([^,]\S*[^,](?:\s+[^,]+)?)\s*(?:,|$)/g;
            img.srcset = img.srcset.replace(urlExtractor, function (_fullText, candidateHref: string, _matchStartPos: number, _input: string): string {
                const candidateParts = candidateHref.split(/\s+/);
                if (candidateParts.length > 2) {
                    console.error(logIMG, logFmt, `Expected "/path/to/file.ext 000w" format, got more spaces than that. Leaving as-is.`)
                    return candidateHref;
                } else {
                    const [actualHref, descriptor] = candidateParts;
                    const replacementUrl = new RelativeUrl(actualHref, origin).changeLivereloadishValue(mtime).toString();
                    console.debug(logIMG, logFmt, `Replacing srcset[${descriptor}] ${actualHref} with ${replacementUrl} in-place`);
                    return `${replacementUrl} ${descriptor}`;
                }
            });
        }
        return "";
    }
    /**
     * Replaces an image which is either given via <div style="background-image: url(...)"></div>
     * or is present in a stylesheet rule as background: url(...) or background-image: url(...) etc.
     */
    const replaceImageInStyle: Replacement<HTMLElement | CSSStyleRule> = function (element, msg: AssetChangeData) {
        const originalHref = element.style.backgroundImage;
        if (originalHref) {
            const mtime = msg.new_time;
            const urlExtractor = /url\((['"]{0,1})\s*(.*?)(["']{0,1})\)/g;
            const newHref = originalHref.replace(urlExtractor, function (_fullText, leftQuote: string, actualHref: string, rightQuote: string, _matchStartPos: number, _inputValue: string): string {
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
            console.debug(logIMG, logFmt, `Replacing CSS background ${originalHref}" with ${newHref} in-place`);
            element.style.backgroundImage = newHref;
            return newHref;
        }
        return '';
    }
    /**
     * Replaces each <link rel="stylesheet" href="..."> where the href matches an update
     * notification. To avoid having a Flash-of-Unstyled-Content (how retro), it does
     * so by adding a _new_ link element and deleting the old one when the new one
     * has loaded or errored.
     */
    const cssStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const file = msg.info.relative_path;
        const filename = msg.info.filename;
        const documentSaysReload: HTMLMetaElement | null = document.querySelector("meta[name='livereloadish-css-strategy'][content='reload']")
        if (documentSaysReload) {
            console.debug(logCSS, logFmt, `Meta tag suggested that this must do a full reload, because ${file} changed`);
            return refreshStrategy(msg);
        }
        // On the off-chance files are linked relatively rather than root-relative
        // using {% static %} we look at the file NAME and potentially replace
        // more files than necessary, instead of fewer than hoped.
        const reloadableLinkElements = document.querySelectorAll(`link[rel=stylesheet][href*="${filename}"]:not([data-no-reload]):not([data-pending-removal]):not([up-keep])`);
        const linkElements: HTMLLinkElement[] = Array.prototype.slice.call(reloadableLinkElements);
        for (const linkElement of linkElements) {
            replaceCSSFile(linkElement, msg, origin);
        }
    }
    /**
     * Forces the current URL to be reloaded in the browser. Used as a fallback elsewhere,
     * and is used if a "root" template (as decided by my Django monkeypatches) changes,
     * because the root template is more likely to contain non-visible changes to <head> etc.
     */
    const refreshStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const file = msg.info.relative_path;
        console.debug(logPage, logFmt, `Reloading the page, because ${file} changed`);
        livereloadishTeardown();
        return document.location.reload();
    }
    /**
     * Used for content types which aren't recognised. Just throws an error to the console.
     */
    const noopStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        console.error(logPrefix, logFmt, "Don't know how to process this", msg);
    }
    /**
     * Essentially a dictionary of paths and the change messages they've received.
     * If a user browses away from the tab and comes back, this should get drained,
     * but even if a file is changed multiple times whilst the page isn't visible,
     * only the most recent file change will be replayed.
     */
    const queuedUp: { [key: string]: AssetChangeData } = {};

    /**
     * Logs change messages to the `queuedUp` object, for replaying later.
     * This strategy is used when the user navigates away from the tab but the
     * event source is still listening and needing to register changes.
     */
    const queuedUpStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const file = msg.info.relative_path;
        const mtime = msg.new_time;
        console.debug(logQueue, logFmt, `Deferring ${file} (modified at: ${mtime}) until page is visible`);
        queuedUp[file] = msg;
    }

    const promptedUnrelatedPagePreviously: string[] = [];
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
    const pageStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const file = msg.info.relative_path;
        // Check the list of Django template files seen during this request, hopefully.
        const seenTemplatesExists: HTMLTemplateElement | null = document.querySelector(`template[id="livereloadish-page-templates"]`);
        let seenTemplates = {};

        // Capture when the <template id="livereloadish-page-templates"></template> element
        // was injected into the response, and then after playing a body mutation,
        // check if it has changed.
        // If it hasn't changed, it's probably because swup/unpoly or whatever are mounted
        // on something other than body by intent, and the user needs to insert the
        // special marker I made for this kind of scenario.
        const seenTemplatesAt = +(seenTemplatesExists?.dataset.loadTime ?? "0");
        const checkSeenTemplatesUpdated = (old: number) => {
            const refreshedSeenTemplates: HTMLTemplateElement | null = document.querySelector(`template[id="livereloadish-page-templates"]`);
            const newSeenTemplatesAt = +(refreshedSeenTemplates?.dataset.loadTime ?? "0");
            if (newSeenTemplatesAt === old || newSeenTemplatesAt < old) {
                console.warn(logPage, logFmt, `Injected template #livereloadish-page-templates has not been updated, you may need to use the <!--livereloadish-page-templates--> marker to fix it.`);
            }
        }

        if (seenTemplatesExists) {
            seenTemplates = JSON.parse(seenTemplatesExists.content.textContent ?? "{}");
        }
        if (!(file in seenTemplates)) {
            // If it doesn't look related to this page, prompt the user to reload
            // and if they choose not to, ignore subsequent changes to the file.
            if (promptedUnrelatedPagePreviously.indexOf(file) > -1) {
                console.debug(logPage, logFmt, `${file} is probably unrelated, and the user has already been notified`);
                return;
            }

            let goneAway = '';
            if (evtSource?.readyState !== 1) {
                goneAway = ' and runserver may be restarting,';
            }

            const confirmReload = window.confirm(`Possibly unrelated file "${file}" has been changed,${goneAway} reload anyway?`);
            if (!confirmReload) {
                promptedUnrelatedPagePreviously.push(file);
                console.error(logPage, logFmt, `${file} is probably unrelated, page may need manually reloading`);
                return;
            }
        }

        // @ts-ignore
        const {up: unpoly, Turbolinks: turbolinks, Swup: Swup, swup: swupInstance, location: url} = window;
        const pageState = new LivereloadishPageState(url.toString());
        pageState.save();

        const definitelyRequiresReload = msg.info.requires_full_reload;
        if (definitelyRequiresReload) {
            console.debug(logPage, logFmt, `Server suggested that this must do a full reload, because ${file} changed`);
            return refreshStrategy(msg);
        }

        const documentReloadTag: HTMLMetaElement | null = document.querySelector("meta[name='livereloadish-page-strategy'][content]");
        const documentReloadValue = documentReloadTag?.content.toLowerCase() || "auto";
        const knownReloadOptions = ['auto', 'reload', 'diff', 'unpoly', 'turbolinks', 'swup'];
        let documentReloadStyle: 'auto' | 'reload' | 'diff' | 'unpoly' | 'turbolinks' | 'swup';
        if (knownReloadOptions.indexOf(documentReloadValue) === -1) {
            documentReloadStyle = "auto";
        } else {
            documentReloadStyle = documentReloadValue as 'auto' | 'reload' | 'diff' | 'unpoly' | 'turbolinks' | 'swup';
        }
        if (documentReloadStyle === "reload") {
            console.debug(logPage, logFmt, `Meta tag value "${documentReloadValue}" suggested that this must do a full reload, because ${file} changed`);
            return refreshStrategy(msg);
        }
        if ((documentReloadStyle === "unpoly" || documentReloadStyle === "auto") && (unpoly && unpoly?.version && unpoly?.reload)) {
            console.debug(logPage, logFmt, `I think this is an Unpoly (https://unpoly.com/) page`);
            console.debug(logPage, logFmt, `Reloading the root fragment vis up.reload(...), because ${file} changed`);
            unpoly.reload({navigate: true, cache: false})
                .then((_renderResult: any) => {
                    pageState.restore();
                    checkSeenTemplatesUpdated(seenTemplatesAt);
                })
                .catch((_renderResult: any) => {
                    // Intentionally do a double-request to get any styles necessary for
                    // an error page. The error page itself will have a SSE connection (hmmm)
                    // that will resolve and reload it if it's due to a template error etc.
                    console.debug(logPage, logFmt, `An error occurred doing a partial reload because ${file} changed`);
                    return refreshStrategy(msg);
                });
        } else if ((documentReloadStyle === "turbolinks" || documentReloadStyle === "auto") && (turbolinks && turbolinks?.supported && turbolinks?.visit)) {
            console.debug(logPage, logFmt, `I think this is a Turbolinks (https://github.com/turbolinks/turbolinks) page`);
            console.debug(logPage, logFmt, `Reloading the content via Turbolinks.visit(), because ${file} changed`);
            turbolinks.visit(url.toString());
            pageState.restore();
            checkSeenTemplatesUpdated(seenTemplatesAt);
        } else if (Swup) {
            console.debug(logPage, logFmt, `I think this is a Swup (https://swup.js.org/) page`);
            if ((documentReloadStyle === "swup" || documentReloadStyle === "auto") && (swupInstance && swupInstance?.loadPage)) {
                console.debug(logPage, logFmt, `Reloading the content via swup.reloadPage(...), because ${file} changed`);
                swupInstance.loadPage({
                    'url': url.pathname + url.search,
                })
                swupInstance.on("pageView", () => {
                    pageState.restore();
                    checkSeenTemplatesUpdated(seenTemplatesAt);
                });
            } else {
                console.debug(logPage, logFmt, `Cannot find the swup instance as 'window.swup' (possibly defined as a non global const/var`);
                return refreshStrategy(msg);
            }
        } else if (documentReloadStyle === "diff" || documentReloadStyle === "auto") {
            console.debug(logPage, logFmt, `Reloading the body content via udomdiff, because ${file} changed`);
            const fetchResponse = window.fetch(url.toString(), {
                'mode': 'same-origin',
                'credentials': 'same-origin',
                'cache': 'reload',
                'redirect': 'error',
            })
            fetchResponse.then((response) => {
                if (!response.ok) {
                    throw new TypeError(`Stop due to ${response.status} (${response.statusText})`);
                }
                return response.text();
            }).then((body) => {
                console.debug(logPage, logFmt, `Received the body content, replacing via udomdiff, because ${file} changed`);
                const fragment = new DOMParser().parseFromString(body, 'text/html');
                const fragmentSaysReload: HTMLMetaElement | null = fragment.querySelector("meta[name='livereloadish-page-strategy'][content='reload']")
                if (fragmentSaysReload) {
                    console.debug(logPage, logFmt, `Meta tag on the incoming page suggested that this must be a full reload, because ${file} changed`);
                    return refreshStrategy(msg);
                }
                // noinspection XHTMLIncompatabilitiesJS
                udomdiff(document.body, Array.prototype.slice.call(document.body.children), Array.prototype.slice.call(fragment.body.children), (o: any) => o, null);
                if (fragment.title != document.title) {
                    console.debug(logPage, logFmt, `Updated the document title, because ${file} changed`);
                    document.title = fragment.title;
                }

                // udomdiff(document.head, Array.prototype.slice.call(document.head.children), Array.prototype.slice.call(fragment.head.children), (o: any) => o, null);

                // Update any <style> elements in the head, in case they've changed.
                // May cause a FOUC. May need to be hoisted to a separate function to
                // allow swup/unpoly/turbolinks support, if possible?
                const newHeadStyles: HTMLStyleElement[] = Array.prototype.slice.call(fragment.querySelectorAll("head style"));
                const previousHeadStyles: HTMLStyleElement[] = Array.prototype.slice.call(document.querySelectorAll("head style"));
                if (previousHeadStyles.length > 0 || newHeadStyles.length > 0) {
                    for (const headStyle of newHeadStyles) {
                        document.head.appendChild(headStyle);
                    }
                    for (const headStyle of previousHeadStyles) {
                        document.head.removeChild(headStyle);
                    }
                }

                pageState.restore();
                checkSeenTemplatesUpdated(seenTemplatesAt);
            }).catch(function (_err: Error) {
                console.debug(logPage, logFmt, `An error occurred doing a partial reload because ${file} changed`);
                return refreshStrategy(msg);
            })
        } else {
            // In theory this should never occur, but declaring the value as e.g. unpoly
            // and then being unable to find unpoly on window/globalThis could happen
            // so we fallback.
            console.debug(logPage, logFmt, `Couldn't find a library to use (using meta tag value "${documentReloadValue}"); must do a full reload, because ${file} changed`);
            return refreshStrategy(msg);
        }
    }

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
    const jsStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        const origin = document.location.origin;
        const file = msg.info.relative_path;
        const filename = msg.info.filename;
        const documentSaysReload: HTMLMetaElement | null = document.querySelector("meta[name='livereloadish-js-strategy'][content='reload']")
        if (documentSaysReload) {
            console.debug(logJS, logFmt, `Meta tag suggested that this must do a full reload, because ${file} changed`);
            return refreshStrategy(msg);
        }
        // Reload anything matching the file NAME rather than the file PATH
        // in case items are referenced relatively rather than using {% static %}
        // or whatever. This shouldn't happen often, but can.
        const possiblyReloadableScriptElements = document.querySelectorAll(`script[src*="${filename}"]:not([data-no-reload]):not([data-pending-removal]):not([data-turbolinks-eval="false"]):not([up-keep])`);
        const scriptElements: HTMLScriptElement[] = Array.prototype.slice.call(possiblyReloadableScriptElements);
        for (const scriptElement of scriptElements) {
            const reloadable = scriptElement.dataset.reloadable;
            const src = scriptElement.src;
            if (reloadable === "" || reloadable === "true") {
                console.debug(logJS, logFmt, `${src} is marked as reloadable`);
                replaceJSFile(scriptElement, msg, origin);
            } else {
                // Now we have to reload, so we can stop immediately in case there were multiple
                // replacements to deal with.
                console.debug(logJS, logFmt, `${src} is not reloadable`);
                return refreshStrategy(msg);
            }
        }
    }

    /**
     * Replace all occurances of an image which matches the updated file.
     * Attempts to account for responsive images (<img srcset=...>, <picture><source srcset=...>)
     * by forcing a new modified-time on each part, regardless of if they're the one in question.
     * Attempts to account for images used via stylesheets, eg: "background: url(...)" in
     * both inline styles and external stylesheets (same origin policy notwithstanding).
     */
    const imageStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        // https://github.com/livereload/livereload-js/blob/12cff7df9dcb36a14c00c5c092fef86efd201910/src/reloader.js#L238
        const origin = document.location.origin;
        const file = msg.info.relative_path;
        const filename = msg.info.filename;
        const documentSaysReload: HTMLMetaElement | null = document.querySelector("meta[name='livereloadish-image-strategy'][content='reload']")
        if (documentSaysReload) {
            console.debug(logIMG, logFmt, `Meta tag suggested that this must do a full reload, because ${file} changed`);
            return refreshStrategy(msg);
        }
        // We look at the file NAME rather than PATH because it may be referenced
        // relatively (though unlikely) and it's easier to reload MORE images
        // than to accidentally skip one which SHOULD be caught.
        const possiblyReloadableImageElements = document.querySelectorAll(`img[src*="${filename}"], img[srcset*="${filename}"], picture > source[srcset*="${filename}"]`);
        const imageElements: (HTMLImageElement | HTMLSourceElement)[] = Array.prototype.slice.call(possiblyReloadableImageElements);
        const totalReplacements: string[] = [];
        for (const imageElement of imageElements) {
            const newHref = replaceImageFile(imageElement, msg, origin);
            if (newHref !== "") {
                totalReplacements.push(newHref);
            }
        }
        // Can't say I care about border images, so we'll only look for backgrounds...
        // Note that we could see items from document.images in here, because they could
        // have placeholder backgrounds...
        const inlineStyles = document.querySelectorAll(`[style*="background"][style*="${filename}"]`);
        const imageStyleElements: HTMLElement[] = Array.prototype.slice.call(inlineStyles);
        for (const imageElement of imageStyleElements) {
            // We use the file NAME rather than the file PATH because the  text
            // value may be relative to the page or whatever, and thus not
            // contain /the/full/path.jpg
            if (imageElement.style.backgroundImage && imageElement.style.backgroundImage.indexOf(filename) > -1) {
                const newHref = replaceImageInStyle(imageElement, msg, origin);
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
                // Obnoxiously, the .type attribute seems to be deprecated
                // https://developer.mozilla.org/en-US/docs/Web/API/CSSRule/type
                // but I don't see any replacement for it? How else do I know
                // if it's technically an instanceof CSSStyleRule
                if (rule.type == rule.STYLE_RULE) {
                    // We use the file NAME rather than the file PATH because the
                    // text value may be relative to the page or whatever, and
                    // thus not contain /the/full/path.jpg
                    if (rule.cssText.indexOf("background") > -1 && rule instanceof CSSStyleRule && rule.style.backgroundImage.indexOf(filename) > -1) {
                        const newHref = replaceImageInStyle(rule as CSSStyleRule, msg, origin);
                        if (newHref !== "") {
                            totalReplacements.push(newHref);
                        }
                    }
                }
            }
        }
        if (totalReplacements.length === 0) {
            console.debug(logIMG, logFmt, `Failed to find any images or CSS styles referencing ${file}`);
        }
    }

    /**
     * A mapping of mimetypes to the real reload/replace/refresh strategies for
     * that file type. For CSS/JS/HTML/Images that includes attempting to do the
     * change in-place. For others (eg: fonts) it's always a full page reload.
     */
    const reloadStrategies: { [key in MimeType]: ReloadStrategy } = {
        "text/css": cssStrategy,
        "text/javascript": jsStrategy,
        "application/javascript": jsStrategy,
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
        "text/x-python": pageStrategy,
        "application/x-python-code": pageStrategy,
        "text/markdown": refreshStrategy,
        "application/octet-stream": noopStrategy,
    }
    /**
     * When this is being used, all file updates regardless of media type are
     * redirect to a queue for replaying later.
     * This set of strategies is used when the user has navigated away from the tab.
     */
    const queuedUpReloadStrategies: { [key in MimeType]: ReloadStrategy } = {
        "text/css": queuedUpStrategy,
        "text/javascript": queuedUpStrategy,
        "application/javascript": queuedUpStrategy,
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
        "text/x-python": queuedUpStrategy,
        "application/x-python-code": queuedUpStrategy,
        "text/markdown": queuedUpStrategy,
        "application/octet-stream": queuedUpStrategy,
    }

    /**
     * A toggle-able set of reload strategies by mime type. When the
     * user navigates away from the tab, these will swap to the queue based ones
     * and back when/if they come back.
     */
    let activeReloadStrategies = reloadStrategies;

    /**
     * Listen for visibilitychange events on the document, and swap the
     * reload strategies being used. When a user navigates to a different tab,
     * swap to using the background queue to replay when they come back.
     * When they come back to the tab, replay each unique file and drain the queue.
     */
    const switchStrategies = (_event: Event) => {
        if (document.visibilityState === "hidden") {
            activeReloadStrategies = queuedUpReloadStrategies;
            console.debug(logQueue, logFmt, "Switched reloaders until page is visible again");
        } else {
            activeReloadStrategies = reloadStrategies;
            console.debug(logQueue, logFmt, "Switched reloaders back to defaults because page became visible");
            const replayCount = Object.keys(queuedUp).length;
            if (evtSource === null) {
                if (errorCount >= maxErrors) {
                    console.debug(logQueue, logFmt, "It looks like the server may have gone away for too long, so you'll probably need to refresh");
                } else if (replayCount > 0) {
                    console.debug(logQueue, logFmt, "It looks like the server may have gone away temporarily, so these may fail and you'll have to refresh");
                }
            } else if (replayCount > 0) {
                console.debug(logQueue, logFmt, `There are a total of ${replayCount} changes to apply`);
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
    const maxErrors = 10;
    /**
     * When a successful connection to the SSE URL has been established, reset
     * the error count and reconnection timers so that failures start anew later.
     */
    const connectionOpened = (_event: Event) => {
        console.debug(logPrefix, logFmt, `SSE connection opened`);
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
    }

    /**
     * If the server goes away temporarily (ie: during autoreload restart), try
     * and pick up a new connection again a few times at random intervals between
     * 1 and 3 seconds.
     * After a number of failed attempts, stop trying completely.
     *
     * Based on https://github.com/fanout/reconnecting-eventsource ... ish.
     */
    const connectionErrored = (_event: Event): void => {
        errorCount++;
        if (evtSource !== null) {
            evtSource.close();
            evtSource = null;
            if (errorCount < maxErrors) {
                // Wait between 1-3 seconds before retrying.
                const timeout = Math.max(1000, Math.round(3000 * Math.random()));
                console.debug(logPrefix, logFmt, `Waiting for ${timeout}ms to restart SSE connection`);
                errorTimer = setTimeout(livereloadishSetup, timeout);
            } else {
                console.error(logPrefix, logFmt, `Cancelling SSE connection attempts after ${errorCount} retries. Manually reload the page...`)
            }
        }
    }
    /**
     * The server has the opportunity to ask the client to reconnect, though I've
     * not currently implemented any such thing.
     */
    const reconnectRequested = (_event: Event): void => {
        console.debug(logPrefix, logFmt, `Server asked for a reconnect`);
        return connectionErrored(_event);
    }
    /**
     * The server has the opportunity to ask the client to go away permanently,
     * this just sets the number of times it has attempted to reconnect to a
     * stupidly high number and then lets it try to reconnect (and it'll choose
     * not to, effectively cancelling/disconnecting by choice)
     */
    const disconnectRequested = (_event: Event): void => {
        errorCount = 999;
        console.debug(logPrefix, logFmt, `Server asked for a disconnect`);
        return connectionErrored(_event);
    }

    /**
     * When the server sends an "asset_change" event, it will include a JSON
     * payload in "data" which which details what file + strategy to update.
     */
    const assetHasChanged = (event: Event): void => {
        const msg = JSON.parse((event as MessageEvent).data) as AssetChangeData;
        const selectedReloadStrategy = activeReloadStrategies[msg.asset_type] || activeReloadStrategies["application/octet-stream"];
        return selectedReloadStrategy(msg);
    }

    const promptedAssetDeletedPreviously: string[] = [];
    /**
     * If a file is deleted (ie: getting the mtime of it no longer succeeds) then
     * notify the user that they'll need to refresh the page, via a modal confirm dialog.
     * If they reject the modal, they'll have to refresh manually.
     * If the file deletion notification comes through multiple times for the same file,
     * avoid ending up in a loop by tracking the ones seen already.
     */
    const assetHasDeleted = (event: Event): void => {
        const msg = JSON.parse((event as MessageEvent).data) as AssetChangeData;
        const fileName = msg.info.relative_path;
        if (promptedAssetDeletedPreviously.indexOf(fileName) > -1) {
            console.debug(logPrefix, logFmt, `${fileName} has been moved or deleted, and the user has already been notified`);
            return;
        }
        const confirmReload = window.confirm(`File "${fileName}" has been moved or deleted, reload the page?`)
        if (confirmReload) {
            return refreshStrategy(msg);
        } else {
            promptedAssetDeletedPreviously.push(fileName);
            console.error(logPrefix, logFmt, `${fileName} has been moved or deleted, page may need manually reloading`);
        }
    }

    /**
     * Your basic setup of event source + various event listeners.
     */
    const livereloadishSetup = (): void => {
        const includer: NodeListOf<HTMLElement> = document.querySelectorAll("script[data-livereloadish-url]");
        if (includer.length === 1) {
            const livereloadishUrl = includer[0].dataset.livereloadishUrl ?? "";
            if (livereloadishUrl) {
                const jsLoad = new Date().getTime() / 1000;
                evtSource = new EventSource(livereloadishUrl.replace('js_load=0', `js_load=${jsLoad}`));
                evtSource.addEventListener('open', connectionOpened);
                evtSource.addEventListener('error', connectionErrored);
                evtSource.addEventListener('assets_change', assetHasChanged);
                evtSource.addEventListener('assets_delete', assetHasDeleted);
                evtSource.addEventListener('disconnect', disconnectRequested);
                evtSource.addEventListener('reconnect', reconnectRequested);
                window.addEventListener('pagehide', livereloadishTeardown);
                document.addEventListener('visibilitychange', switchStrategies);
            } else {
                console.error(logPrefix, logFmt, `Included with an empty value in the data-livereloadish-url="" attribute, cannot continue`);
            }
        } else if (includer.length > 1) {
            console.error(logPrefix, logFmt, `Multiple data-livereloadish-url="..." elements found, possible middleware order issue; you maybe have UpdateCacheMiddleware (or an equivalent) listed before the LivereloadishMiddleware`);
        } else {
            console.error(logPrefix, logFmt, `Included without a data-livereloadish-url="..." attribute, cannot continue`);
        }
    }
    /**
     * Destroy everything because the page is unloading or whatever.
     * Drain any queues, reset any tracking variables etc.
     */
    const livereloadishTeardown = (): void => {
        // destroy these values ASAP
        if (errorTimer !== null) {
            clearTimeout(errorTimer);
        }
        errorCount = 0;
        for (const key in queuedUp) {
            delete queuedUp[key];
        }
        // drain these consts.
        while (promptedUnrelatedPagePreviously.length) {
            promptedUnrelatedPagePreviously.pop();
        }
        while (promptedAssetDeletedPreviously.length) {
            promptedAssetDeletedPreviously.pop();
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
    LivereloadishPageState.bindForRefresh();
})();
