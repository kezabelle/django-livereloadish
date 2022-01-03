(() => {
    // What follows immediately below is a copy of morphdom 2.6.1, but adjusted
    // to remove it's own exports, and just bind straight to the udomdiff
    // variable, and change the arguments to satisfy TS better.
    // I've inlined it so there's only 1 request for livereloadish client side stuff.
    // See the license below for attribution to Patrick Steele-Idem (https://github.com/patrick-steele-idem)
    // See https://github.com/patrick-steele-idem/morphdom for the repository itself. It's a cool library.

    /**
     * The MIT License (MIT)
     *
     *  Copyright (c) Patrick Steele-Idem <pnidem@gmail.com> (psteeleidem.com)
     *
     *  Permission is hereby granted, free of charge, to any person obtaining a copy
     *  of this software and associated documentation files (the "Software"), to deal
     *  in the Software without restriction, including without limitation the rights
     *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     *  copies of the Software, and to permit persons to whom the Software is
     *  furnished to do so, subject to the following conditions:
     *
     *  The above copyright notice and this permission notice shall be included in
     *  all copies or substantial portions of the Software.
     *
     *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     *  THE SOFTWARE.
     */
    const morphdom = (() => {
        'use strict';

        var DOCUMENT_FRAGMENT_NODE = 11;

        function morphAttrs(fromNode, toNode) {
            var toNodeAttrs = toNode.attributes;
            var attr;
            var attrName;
            var attrNamespaceURI;
            var attrValue;
            var fromValue;

            // document-fragments dont have attributes so lets not do anything
            if (toNode.nodeType === DOCUMENT_FRAGMENT_NODE || fromNode.nodeType === DOCUMENT_FRAGMENT_NODE) {
              return;
            }

            // update attributes on original DOM element
            for (var i = toNodeAttrs.length - 1; i >= 0; i--) {
                attr = toNodeAttrs[i];
                attrName = attr.name;
                attrNamespaceURI = attr.namespaceURI;
                attrValue = attr.value;

                if (attrNamespaceURI) {
                    attrName = attr.localName || attrName;
                    fromValue = fromNode.getAttributeNS(attrNamespaceURI, attrName);

                    if (fromValue !== attrValue) {
                        if (attr.prefix === 'xmlns'){
                            attrName = attr.name; // It's not allowed to set an attribute with the XMLNS namespace without specifying the `xmlns` prefix
                        }
                        fromNode.setAttributeNS(attrNamespaceURI, attrName, attrValue);
                    }
                } else {
                    fromValue = fromNode.getAttribute(attrName);

                    if (fromValue !== attrValue) {
                        fromNode.setAttribute(attrName, attrValue);
                    }
                }
            }

            // Remove any extra attributes found on the original DOM element that
            // weren't found on the target element.
            var fromNodeAttrs = fromNode.attributes;

            for (var d = fromNodeAttrs.length - 1; d >= 0; d--) {
                attr = fromNodeAttrs[d];
                attrName = attr.name;
                attrNamespaceURI = attr.namespaceURI;

                if (attrNamespaceURI) {
                    attrName = attr.localName || attrName;

                    if (!toNode.hasAttributeNS(attrNamespaceURI, attrName)) {
                        fromNode.removeAttributeNS(attrNamespaceURI, attrName);
                    }
                } else {
                    if (!toNode.hasAttribute(attrName)) {
                        fromNode.removeAttribute(attrName);
                    }
                }
            }
        }

        var range; // Create a range object for efficently rendering strings to elements.
        var NS_XHTML = 'http://www.w3.org/1999/xhtml';

        var doc = typeof document === 'undefined' ? undefined : document;
        var HAS_TEMPLATE_SUPPORT = !!doc && 'content' in doc.createElement('template');
        var HAS_RANGE_SUPPORT = !!doc && doc.createRange && 'createContextualFragment' in doc.createRange();

        function createFragmentFromTemplate(str) {
            var template = doc.createElement('template');
            template.innerHTML = str;
            return template.content.childNodes[0];
        }

        function createFragmentFromRange(str) {
            if (!range) {
                range = doc.createRange();
                range.selectNode(doc.body);
            }

            var fragment = range.createContextualFragment(str);
            return fragment.childNodes[0];
        }

        function createFragmentFromWrap(str) {
            var fragment = doc.createElement('body');
            fragment.innerHTML = str;
            return fragment.childNodes[0];
        }

        /**
         * This is about the same
         * var html = new DOMParser().parseFromString(str, 'text/html');
         * return html.body.firstChild;
         *
         * @method toElement
         * @param {String} str
         */
        function toElement(str) {
            str = str.trim();
            if (HAS_TEMPLATE_SUPPORT) {
              // avoid restrictions on content for things like `<tr><th>Hi</th></tr>` which
              // createContextualFragment doesn't support
              // <template> support not available in IE
              return createFragmentFromTemplate(str);
            } else if (HAS_RANGE_SUPPORT) {
              return createFragmentFromRange(str);
            }

            return createFragmentFromWrap(str);
        }

        /**
         * Returns true if two node's names are the same.
         *
         * NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
         *       nodeName and different namespace URIs.
         *
         * @param {Element} a
         * @param {Element} b The target element
         * @return {boolean}
         */
        function compareNodeNames(fromEl, toEl) {
            var fromNodeName = fromEl.nodeName;
            var toNodeName = toEl.nodeName;
            var fromCodeStart, toCodeStart;

            if (fromNodeName === toNodeName) {
                return true;
            }

            fromCodeStart = fromNodeName.charCodeAt(0);
            toCodeStart = toNodeName.charCodeAt(0);

            // If the target element is a virtual DOM node or SVG node then we may
            // need to normalize the tag name before comparing. Normal HTML elements that are
            // in the "http://www.w3.org/1999/xhtml"
            // are converted to upper case
            if (fromCodeStart <= 90 && toCodeStart >= 97) { // from is upper and to is lower
                return fromNodeName === toNodeName.toUpperCase();
            } else if (toCodeStart <= 90 && fromCodeStart >= 97) { // to is upper and from is lower
                return toNodeName === fromNodeName.toUpperCase();
            } else {
                return false;
            }
        }

        /**
         * Create an element, optionally with a known namespace URI.
         *
         * @param {string} name the element name, e.g. 'div' or 'svg'
         * @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
         * its `xmlns` attribute or its inferred namespace.
         *
         * @return {Element}
         */
        function createElementNS(name, namespaceURI) {
            return !namespaceURI || namespaceURI === NS_XHTML ?
                doc.createElement(name) :
                doc.createElementNS(namespaceURI, name);
        }

        /**
         * Copies the children of one DOM element to another DOM element
         */
        function moveChildren(fromEl, toEl) {
            var curChild = fromEl.firstChild;
            while (curChild) {
                var nextChild = curChild.nextSibling;
                toEl.appendChild(curChild);
                curChild = nextChild;
            }
            return toEl;
        }

        function syncBooleanAttrProp(fromEl, toEl, name) {
            if (fromEl[name] !== toEl[name]) {
                fromEl[name] = toEl[name];
                if (fromEl[name]) {
                    fromEl.setAttribute(name, '');
                } else {
                    fromEl.removeAttribute(name);
                }
            }
        }

        var specialElHandlers = {
            OPTION: function(fromEl, toEl) {
                var parentNode = fromEl.parentNode;
                if (parentNode) {
                    var parentName = parentNode.nodeName.toUpperCase();
                    if (parentName === 'OPTGROUP') {
                        parentNode = parentNode.parentNode;
                        parentName = parentNode && parentNode.nodeName.toUpperCase();
                    }
                    if (parentName === 'SELECT' && !parentNode.hasAttribute('multiple')) {
                        if (fromEl.hasAttribute('selected') && !toEl.selected) {
                            // Workaround for MS Edge bug where the 'selected' attribute can only be
                            // removed if set to a non-empty value:
                            // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/12087679/
                            fromEl.setAttribute('selected', 'selected');
                            fromEl.removeAttribute('selected');
                        }
                        // We have to reset select element's selectedIndex to -1, otherwise setting
                        // fromEl.selected using the syncBooleanAttrProp below has no effect.
                        // The correct selectedIndex will be set in the SELECT special handler below.
                        parentNode.selectedIndex = -1;
                    }
                }
                syncBooleanAttrProp(fromEl, toEl, 'selected');
            },
            /**
             * The "value" attribute is special for the <input> element since it sets
             * the initial value. Changing the "value" attribute without changing the
             * "value" property will have no effect since it is only used to the set the
             * initial value.  Similar for the "checked" attribute, and "disabled".
             */
            INPUT: function(fromEl, toEl) {
                syncBooleanAttrProp(fromEl, toEl, 'checked');
                syncBooleanAttrProp(fromEl, toEl, 'disabled');

                if (fromEl.value !== toEl.value) {
                    fromEl.value = toEl.value;
                }

                if (!toEl.hasAttribute('value')) {
                    fromEl.removeAttribute('value');
                }
            },

            TEXTAREA: function(fromEl, toEl) {
                var newValue = toEl.value;
                if (fromEl.value !== newValue) {
                    fromEl.value = newValue;
                }

                var firstChild = fromEl.firstChild;
                if (firstChild) {
                    // Needed for IE. Apparently IE sets the placeholder as the
                    // node value and vise versa. This ignores an empty update.
                    var oldValue = firstChild.nodeValue;

                    if (oldValue == newValue || (!newValue && oldValue == fromEl.placeholder)) {
                        return;
                    }

                    firstChild.nodeValue = newValue;
                }
            },
            SELECT: function(fromEl, toEl) {
                if (!toEl.hasAttribute('multiple')) {
                    var selectedIndex = -1;
                    var i = 0;
                    // We have to loop through children of fromEl, not toEl since nodes can be moved
                    // from toEl to fromEl directly when morphing.
                    // At the time this special handler is invoked, all children have already been morphed
                    // and appended to / removed from fromEl, so using fromEl here is safe and correct.
                    var curChild = fromEl.firstChild;
                    var optgroup;
                    var nodeName;
                    while(curChild) {
                        nodeName = curChild.nodeName && curChild.nodeName.toUpperCase();
                        if (nodeName === 'OPTGROUP') {
                            optgroup = curChild;
                            curChild = optgroup.firstChild;
                        } else {
                            if (nodeName === 'OPTION') {
                                if (curChild.hasAttribute('selected')) {
                                    selectedIndex = i;
                                    break;
                                }
                                i++;
                            }
                            curChild = curChild.nextSibling;
                            if (!curChild && optgroup) {
                                curChild = optgroup.nextSibling;
                                optgroup = null;
                            }
                        }
                    }

                    fromEl.selectedIndex = selectedIndex;
                }
            }
        };

        var ELEMENT_NODE = 1;
        var DOCUMENT_FRAGMENT_NODE$1 = 11;
        var TEXT_NODE = 3;
        var COMMENT_NODE = 8;

        function noop() {}

        function defaultGetNodeKey(node) {
          if (node) {
              return (node.getAttribute && node.getAttribute('id')) || node.id;
          }
        }

        function morphdomFactory(morphAttrs) {

            return function morphdom(fromNode, toNode, options) {
                if (!options) {
                    options = {};
                }

                if (typeof toNode === 'string') {
                    if (fromNode.nodeName === '#document' || fromNode.nodeName === 'HTML' || fromNode.nodeName === 'BODY') {
                        var toNodeHtml = toNode;
                        toNode = doc.createElement('html');
                        toNode.innerHTML = toNodeHtml;
                    } else {
                        toNode = toElement(toNode);
                    }
                } else if (toNode.nodeType === DOCUMENT_FRAGMENT_NODE$1) {
                  toNode = toNode.firstElementChild;
                }

                var getNodeKey = options.getNodeKey || defaultGetNodeKey;
                var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
                var onNodeAdded = options.onNodeAdded || noop;
                var onBeforeElUpdated = options.onBeforeElUpdated || noop;
                var onElUpdated = options.onElUpdated || noop;
                var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
                var onNodeDiscarded = options.onNodeDiscarded || noop;
                var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
                var childrenOnly = options.childrenOnly === true;

                // This object is used as a lookup to quickly find all keyed elements in the original DOM tree.
                var fromNodesLookup = Object.create(null);
                var keyedRemovalList = [];

                function addKeyedRemoval(key) {
                    keyedRemovalList.push(key);
                }

                function walkDiscardedChildNodes(node, skipKeyedNodes) {
                    if (node.nodeType === ELEMENT_NODE) {
                        var curChild = node.firstChild;
                        while (curChild) {

                            var key = undefined;

                            if (skipKeyedNodes && (key = getNodeKey(curChild))) {
                                // If we are skipping keyed nodes then we add the key
                                // to a list so that it can be handled at the very end.
                                addKeyedRemoval(key);
                            } else {
                                // Only report the node as discarded if it is not keyed. We do this because
                                // at the end we loop through all keyed elements that were unmatched
                                // and then discard them in one final pass.
                                onNodeDiscarded(curChild);
                                if (curChild.firstChild) {
                                    walkDiscardedChildNodes(curChild, skipKeyedNodes);
                                }
                            }

                            curChild = curChild.nextSibling;
                        }
                    }
                }

                /**
                 * Removes a DOM node out of the original DOM
                 *
                 * @param  {Node} node The node to remove
                 * @param  {Node} parentNode The nodes parent
                 * @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
                 * @return {undefined}
                 */
                function removeNode(node, parentNode, skipKeyedNodes) {
                    if (onBeforeNodeDiscarded(node) === false) {
                        return;
                    }

                    if (parentNode) {
                        parentNode.removeChild(node);
                    }

                    onNodeDiscarded(node);
                    walkDiscardedChildNodes(node, skipKeyedNodes);
                }

                // // TreeWalker implementation is no faster, but keeping this around in case this changes in the future
                // function indexTree(root) {
                //     var treeWalker = document.createTreeWalker(
                //         root,
                //         NodeFilter.SHOW_ELEMENT);
                //
                //     var el;
                //     while((el = treeWalker.nextNode())) {
                //         var key = getNodeKey(el);
                //         if (key) {
                //             fromNodesLookup[key] = el;
                //         }
                //     }
                // }

                // // NodeIterator implementation is no faster, but keeping this around in case this changes in the future
                //
                // function indexTree(node) {
                //     var nodeIterator = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT);
                //     var el;
                //     while((el = nodeIterator.nextNode())) {
                //         var key = getNodeKey(el);
                //         if (key) {
                //             fromNodesLookup[key] = el;
                //         }
                //     }
                // }

                function indexTree(node) {
                    if (node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE$1) {
                        var curChild = node.firstChild;
                        while (curChild) {
                            var key = getNodeKey(curChild);
                            if (key) {
                                fromNodesLookup[key] = curChild;
                            }

                            // Walk recursively
                            indexTree(curChild);

                            curChild = curChild.nextSibling;
                        }
                    }
                }

                indexTree(fromNode);

                function handleNodeAdded(el) {
                    onNodeAdded(el);

                    var curChild = el.firstChild;
                    while (curChild) {
                        var nextSibling = curChild.nextSibling;

                        var key = getNodeKey(curChild);
                        if (key) {
                            var unmatchedFromEl = fromNodesLookup[key];
                            // if we find a duplicate #id node in cache, replace `el` with cache value
                            // and morph it to the child node.
                            if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
                                curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
                                morphEl(unmatchedFromEl, curChild);
                            } else {
                              handleNodeAdded(curChild);
                            }
                        } else {
                          // recursively call for curChild and it's children to see if we find something in
                          // fromNodesLookup
                          handleNodeAdded(curChild);
                        }

                        curChild = nextSibling;
                    }
                }

                function cleanupFromEl(fromEl, curFromNodeChild, curFromNodeKey) {
                    // We have processed all of the "to nodes". If curFromNodeChild is
                    // non-null then we still have some from nodes left over that need
                    // to be removed
                    while (curFromNodeChild) {
                        var fromNextSibling = curFromNodeChild.nextSibling;
                        if ((curFromNodeKey = getNodeKey(curFromNodeChild))) {
                            // Since the node is keyed it might be matched up later so we defer
                            // the actual removal to later
                            addKeyedRemoval(curFromNodeKey);
                        } else {
                            // NOTE: we skip nested keyed nodes from being removed since there is
                            //       still a chance they will be matched up later
                            removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                        }
                        curFromNodeChild = fromNextSibling;
                    }
                }

                function morphEl(fromEl, toEl, childrenOnly) {
                    var toElKey = getNodeKey(toEl);

                    if (toElKey) {
                        // If an element with an ID is being morphed then it will be in the final
                        // DOM so clear it out of the saved elements collection
                        delete fromNodesLookup[toElKey];
                    }

                    if (!childrenOnly) {
                        // optional
                        if (onBeforeElUpdated(fromEl, toEl) === false) {
                            return;
                        }

                        // update attributes on original DOM element first
                        morphAttrs(fromEl, toEl);
                        // optional
                        onElUpdated(fromEl);

                        if (onBeforeElChildrenUpdated(fromEl, toEl) === false) {
                            return;
                        }
                    }

                    if (fromEl.nodeName !== 'TEXTAREA') {
                      morphChildren(fromEl, toEl);
                    } else {
                      specialElHandlers.TEXTAREA(fromEl, toEl);
                    }
                }

                function morphChildren(fromEl, toEl) {
                    var curToNodeChild = toEl.firstChild;
                    var curFromNodeChild = fromEl.firstChild;
                    var curToNodeKey;
                    var curFromNodeKey;

                    var fromNextSibling;
                    var toNextSibling;
                    var matchingFromEl;

                    // walk the children
                    outer: while (curToNodeChild) {
                        toNextSibling = curToNodeChild.nextSibling;
                        curToNodeKey = getNodeKey(curToNodeChild);

                        // walk the fromNode children all the way through
                        while (curFromNodeChild) {
                            fromNextSibling = curFromNodeChild.nextSibling;

                            if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
                                curToNodeChild = toNextSibling;
                                curFromNodeChild = fromNextSibling;
                                continue outer;
                            }

                            curFromNodeKey = getNodeKey(curFromNodeChild);

                            var curFromNodeType = curFromNodeChild.nodeType;

                            // this means if the curFromNodeChild doesnt have a match with the curToNodeChild
                            var isCompatible = undefined;

                            if (curFromNodeType === curToNodeChild.nodeType) {
                                if (curFromNodeType === ELEMENT_NODE) {
                                    // Both nodes being compared are Element nodes

                                    if (curToNodeKey) {
                                        // The target node has a key so we want to match it up with the correct element
                                        // in the original DOM tree
                                        if (curToNodeKey !== curFromNodeKey) {
                                            // The current element in the original DOM tree does not have a matching key so
                                            // let's check our lookup to see if there is a matching element in the original
                                            // DOM tree
                                            if ((matchingFromEl = fromNodesLookup[curToNodeKey])) {
                                                if (fromNextSibling === matchingFromEl) {
                                                    // Special case for single element removals. To avoid removing the original
                                                    // DOM node out of the tree (since that can break CSS transitions, etc.),
                                                    // we will instead discard the current node and wait until the next
                                                    // iteration to properly match up the keyed target element with its matching
                                                    // element in the original tree
                                                    isCompatible = false;
                                                } else {
                                                    // We found a matching keyed element somewhere in the original DOM tree.
                                                    // Let's move the original DOM node into the current position and morph
                                                    // it.

                                                    // NOTE: We use insertBefore instead of replaceChild because we want to go through
                                                    // the `removeNode()` function for the node that is being discarded so that
                                                    // all lifecycle hooks are correctly invoked
                                                    fromEl.insertBefore(matchingFromEl, curFromNodeChild);

                                                    // fromNextSibling = curFromNodeChild.nextSibling;

                                                    if (curFromNodeKey) {
                                                        // Since the node is keyed it might be matched up later so we defer
                                                        // the actual removal to later
                                                        addKeyedRemoval(curFromNodeKey);
                                                    } else {
                                                        // NOTE: we skip nested keyed nodes from being removed since there is
                                                        //       still a chance they will be matched up later
                                                        removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                                                    }

                                                    curFromNodeChild = matchingFromEl;
                                                }
                                            } else {
                                                // The nodes are not compatible since the "to" node has a key and there
                                                // is no matching keyed node in the source tree
                                                isCompatible = false;
                                            }
                                        }
                                    } else if (curFromNodeKey) {
                                        // The original has a key
                                        isCompatible = false;
                                    }

                                    isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);
                                    if (isCompatible) {
                                        // We found compatible DOM elements so transform
                                        // the current "from" node to match the current
                                        // target DOM node.
                                        // MORPH
                                        morphEl(curFromNodeChild, curToNodeChild);
                                    }

                                } else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
                                    // Both nodes being compared are Text or Comment nodes
                                    isCompatible = true;
                                    // Simply update nodeValue on the original node to
                                    // change the text value
                                    if (curFromNodeChild.nodeValue !== curToNodeChild.nodeValue) {
                                        curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
                                    }

                                }
                            }

                            if (isCompatible) {
                                // Advance both the "to" child and the "from" child since we found a match
                                // Nothing else to do as we already recursively called morphChildren above
                                curToNodeChild = toNextSibling;
                                curFromNodeChild = fromNextSibling;
                                continue outer;
                            }

                            // No compatible match so remove the old node from the DOM and continue trying to find a
                            // match in the original DOM. However, we only do this if the from node is not keyed
                            // since it is possible that a keyed node might match up with a node somewhere else in the
                            // target tree and we don't want to discard it just yet since it still might find a
                            // home in the final DOM tree. After everything is done we will remove any keyed nodes
                            // that didn't find a home
                            if (curFromNodeKey) {
                                // Since the node is keyed it might be matched up later so we defer
                                // the actual removal to later
                                addKeyedRemoval(curFromNodeKey);
                            } else {
                                // NOTE: we skip nested keyed nodes from being removed since there is
                                //       still a chance they will be matched up later
                                removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                            }

                            curFromNodeChild = fromNextSibling;
                        } // END: while(curFromNodeChild) {}

                        // If we got this far then we did not find a candidate match for
                        // our "to node" and we exhausted all of the children "from"
                        // nodes. Therefore, we will just append the current "to" node
                        // to the end
                        if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
                            fromEl.appendChild(matchingFromEl);
                            // MORPH
                            morphEl(matchingFromEl, curToNodeChild);
                        } else {
                            var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);
                            if (onBeforeNodeAddedResult !== false) {
                                if (onBeforeNodeAddedResult) {
                                    curToNodeChild = onBeforeNodeAddedResult;
                                }

                                if (curToNodeChild.actualize) {
                                    curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
                                }
                                fromEl.appendChild(curToNodeChild);
                                handleNodeAdded(curToNodeChild);
                            }
                        }

                        curToNodeChild = toNextSibling;
                        curFromNodeChild = fromNextSibling;
                    }

                    cleanupFromEl(fromEl, curFromNodeChild, curFromNodeKey);

                    var specialElHandler = specialElHandlers[fromEl.nodeName];
                    if (specialElHandler) {
                        specialElHandler(fromEl, toEl);
                    }
                } // END: morphChildren(...)

                var morphedNode = fromNode;
                var morphedNodeType = morphedNode.nodeType;
                var toNodeType = toNode.nodeType;

                if (!childrenOnly) {
                    // Handle the case where we are given two DOM nodes that are not
                    // compatible (e.g. <div> --> <span> or <div> --> TEXT)
                    if (morphedNodeType === ELEMENT_NODE) {
                        if (toNodeType === ELEMENT_NODE) {
                            if (!compareNodeNames(fromNode, toNode)) {
                                onNodeDiscarded(fromNode);
                                morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
                            }
                        } else {
                            // Going from an element node to a text node
                            morphedNode = toNode;
                        }
                    } else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) { // Text or comment node
                        if (toNodeType === morphedNodeType) {
                            if (morphedNode.nodeValue !== toNode.nodeValue) {
                                morphedNode.nodeValue = toNode.nodeValue;
                            }

                            return morphedNode;
                        } else {
                            // Text node to something else
                            morphedNode = toNode;
                        }
                    }
                }

                if (morphedNode === toNode) {
                    // The "to node" was not compatible with the "from node" so we had to
                    // toss out the "from node" and use the "to node"
                    onNodeDiscarded(fromNode);
                } else {
                    if (toNode.isSameNode && toNode.isSameNode(morphedNode)) {
                        return;
                    }

                    morphEl(morphedNode, toNode, childrenOnly);

                    // We now need to loop over any keyed nodes that might need to be
                    // removed. We only do the removal if we know that the keyed node
                    // never found a match. When a keyed node is matched up we remove
                    // it out of fromNodesLookup and we use fromNodesLookup to determine
                    // if a keyed node has been matched up or not
                    if (keyedRemovalList) {
                        for (var i=0, len=keyedRemovalList.length; i<len; i++) {
                            var elToRemove = fromNodesLookup[keyedRemovalList[i]];
                            if (elToRemove) {
                                removeNode(elToRemove, elToRemove.parentNode, false);
                            }
                        }
                    }
                }

                if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
                    if (morphedNode.actualize) {
                        morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
                    }
                    // If we had to swap out the from node with a new node because the old
                    // node was not compatible with the target node then we need to
                    // replace the old DOM node in the original DOM tree. This is only
                    // possible if the original DOM node was part of a DOM tree which
                    // we know is the case if it has a parent node.
                    fromNode.parentNode.replaceChild(morphedNode, fromNode);
                }

                return morphedNode;
            };
        }

        return morphdomFactory(morphAttrs);

    })();
    // Here ends the copy-paste of morphdom, and the license that's under (MIT)
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

    interface PromptDecisions {
        [keyof: string]: boolean;
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
    const logPython = logPrefix + `: Python`;
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
        public promptKey: string;
        constructor(key: string) {
            this.dataKey = `forms_for_${key}`;
            this.scrollKey = `scrolls_for_${key}`;
            this.focusKey = `focus_for_${key}`;
            this.promptKey = `prompts_for_${key}`;
        }

        savePrompts() {
            // this is a bit bleh, depending on something from the outer scope
            // but hey ho.
            const serializedPromptState = JSON.stringify(promptDecisions);
            if (Object.keys(promptDecisions).length > 0) {
                sessionStorage.setItem(this.promptKey, serializedPromptState);
            } else {
                // There's nothing to persist, let's also make sure we tidy out
                // any stragglers.
                sessionStorage.removeItem(this.promptKey);
            }
            return [promptDecisions, serializedPromptState];
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
            const [promptDecisions, serializedPromptState ] = this.savePrompts();
            return [formValues, serializedFormState, scrollPos, serializedScrollState, focusSelector, promptDecisions, serializedPromptState];
        }

        restorePrompts() {
            const serializedPromptState = sessionStorage.getItem(this.promptKey);
            if (serializedPromptState !== null && serializedPromptState !== '') {
                promptDecisions = JSON.parse(serializedPromptState);
                const files = Object.keys(promptDecisions).join(', ');
                console.debug(logState, logFmt, `Restoring previous prompt decisions for ${files}`);
                // Specifically do not remove this key, as we want this to
                // persist for longer than one reload, unlike the others.
            }
            return serializedPromptState !== null && serializedPromptState !== '';
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
            return serializedFormState !== null && serializedFormState !== '';
        }

        restoreScroll() {
            const serializedScrollState = sessionStorage.getItem(this.scrollKey);
            if (serializedScrollState !== null && serializedScrollState !== '') {
                const scrollPos = JSON.parse(serializedScrollState);
                console.debug(logState, logFmt, `Restoring scroll position to vertical: ${scrollPos.y}, horizontal: ${scrollPos.x}`);
                window.scrollTo(scrollPos.x, scrollPos.y);
                sessionStorage.removeItem(this.scrollKey);
            }

            return serializedScrollState !== null && serializedScrollState !== '';
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
            return selector !== null && selector !== '';
        }

        /**
         * Special case for django-debug-toolbar (djdt) to restore the handle's
         * visibility after a *partial* reload.
         * Not called as part of restore() because I dunno if it's idempotent (i.e.
         * safe to call N times) ... it seems like maybe it is?
         */
        restoreDebugToolbar() {
            // @ts-ignore
            if (window.djdt && window.djdt.init) {
                console.debug(logState, logFmt, `Restoring django-debug-toolbar because window.djdt.init exists`);
                // @ts-ignore
                window.djdt.init();
                const handle = document.getElementById('djDebugToolbarHandle');
                // It fell off the page because the CSS is also being applied?
                if (handle !== null && handle.style.top && handle.style.top.charAt(0) === '-') {
                    const handleTop = parseInt(localStorage.getItem("djdt.top") || '0');
                    handle.style.top = handleTop + "px";
                }
            }
        }

        restore() {
            const restoredForm = this.restoreForm();
            const restoredScroll = this.restoreScroll();
            const restoredFocus = this.restoreActiveElement();
            const restoredPrompts = this.restorePrompts();
            return restoredForm || restoredScroll || restoredFocus || restoredPrompts;
        }

        /**
         * Check the document ready state and prepare to call restoreAfterRefresh.
         * This executes once when this script is loaded.
         */
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
         * This includes restoring values into the prompt decisions, along with
         * scrolling and form values etc.
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

    /**
     * When a 'possibly unrelated' file is updated, ask the user whether to reload.
     * Keys are files, values are booleans - true means "reload" and false
     * means "don't reload"
     * Data is persisted to the session storage so navigating around probably
     * obeys previous decisions.
     */
    let promptDecisions: PromptDecisions = {};
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

            if (file in promptDecisions && promptDecisions[file] === false) {
                console.debug(logPage, logFmt, `${file} is probably unrelated, user has already been notified, ignoring`);
                return;
            } else if (file in promptDecisions && promptDecisions[file] === true) {
                console.debug(logPage, logFmt, `${file} is probably unrelated, user has already been notified, refreshing`);
            } else {
                // handle the case where the file hasn't been prompted & recorded previously.
                let goneAway = '';
                if (evtSource?.readyState !== 1) {
                    goneAway = ' and runserver may be restarting,';
                }

                const confirmReload = window.confirm(`Possibly unrelated file "${file}" has been changed,${goneAway} reload anyway?`);
                promptDecisions[file] = confirmReload
                if (!confirmReload) {
                    console.error(logPage, logFmt, `${file} is probably unrelated, page may need manually reloading`);
                    return;
                }
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
                if (response.status > 300 && response.status < 400) {
                    throw new TypeError(`Stop due to Redirection: ${response.status} (${response.statusText})`);
                } else if (response.status > 500) {
                    throw new TypeError(`Stop due to Server error: ${response.status} (${response.statusText})`);
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
                morphdom(document.body, fragment.body, {});
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
                pageState.restoreDebugToolbar();
                checkSeenTemplatesUpdated(seenTemplatesAt);
            }).catch(function (err: Error) {
                console.debug(logPage, logFmt, `An error occurred doing a partial reload because ${file} changed; ${err}`);
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
        const possiblyReloadableScriptElements = document.querySelectorAll(`script[src*="${filename}"]`);
        const scriptElements: HTMLScriptElement[] = Array.prototype.slice.call(possiblyReloadableScriptElements);
        for (const scriptElement of scriptElements) {
            const reloadable = scriptElement.dataset.reloadable;
            const src = scriptElement.src;
            if (reloadable === "" || reloadable === "true") {
                console.debug(logJS, logFmt, `${src} is marked as reloadable`);
                replaceJSFile(scriptElement, msg, origin);
            } else {
                if (scriptElement.dataset.noReload !== undefined) {
                    console.debug(logJS, logFmt, `${src} is marked with data-no-reload, ignoring reload`);
                    return;
                } else if (scriptElement.dataset.pendingRemoval !== undefined) {
                    console.debug(logJS, logFmt, `${src} is marked with data-pending-removal, ignoring reload`);
                    return;
                } else if (scriptElement.dataset.upKeep !== undefined) {
                    console.debug(logJS, logFmt, `${src} is marked with up-keep, ignoring reload`);
                    return;
                } else if (scriptElement.dataset.turbolinksEval === "false") {
                    console.debug(logJS, logFmt, `${src} is marked with data-turbolinks-eval=false, ignoring reload`);
                    return;
                }
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
     * When a python file changes on the server, we MAY receive a message about it
     * before the server starts reloading. If we do, we know we need to wait until
     * the server is back up, by trying to reconnect to the SSE event stream.
     * If we successfully connect to the event stream
     */
    const pythonStrategy: ReloadStrategy = (msg: AssetChangeData): void => {
        console.debug(logPython, logFmt, `Server will need to restart, polling for when it comes back.`);
        const event = new CustomEvent('fake-error');
        reconnectRequested(event);

        let intervalId: undefined | number = undefined;
        const unloop = () => {
            if (intervalId !== undefined) {
                clearInterval(intervalId);
                return true;
            }
            return false;
        }

        let duration = 0;
        const loop = () => {
            // At 30seconds or so ... just give up entirely, it's not coming back.
            duration += 1000;
            const maxDuration = (maxErrors * 3000);
            // We defer to the pageStrategy, which MAY end up just being the
            // refreshStrategy anyway, so that we can prompt for possibly
            // unrelated files and let the user's preference get saved ...
            if (errorCount >= maxErrors) {
                console.error(logPython, logFmt, `Forcing the refresh so it's evident something broke`);
                unloop();
                return pageStrategy(msg);
            } else if (evtSource?.readyState === 1) {
                unloop();
                return pageStrategy(msg);
            } else if (duration >= maxDuration) {
                console.error(logPython, logFmt, `Giving up on waiting for the server to come back, after 30 seconds trying`);
                unloop();
            } else {
                console.debug(logPython, logFmt, `Still waiting...`);
            }
        }
        intervalId = setInterval(loop, 1000);
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
        "text/x-python": pythonStrategy,
        "application/x-python-code": pythonStrategy,
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
                console.debug(logQueue, logFmt, `Processing ${key} as ${msg.asset_type}`);
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
        for (const key in promptDecisions) {
            delete promptDecisions[key];
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
