import logging
import time
from collections import namedtuple
from typing import Any
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import MiddlewareNotUsed
from django.core.handlers.wsgi import WSGIRequest
from django.http.response import HttpResponseBase
from django.urls import include, path

import livereloadish.urls

logger = logging.getLogger(__name__)


class NamedUrlconf(namedtuple("NamedUrl", "included_patterns")):
    def __str__(self) -> str:
        return "livereloadish.middleware.LivereloadishMiddleware"


class LivereloadishMiddleware:
    __slots__ = ("get_response", "process_load")
    prefix = "livereloadish"
    content_types = ("text/html", "application/xhtml+xml")
    # SSE insertion. Happens at the end of the </head> but don't worry it's marked
    # as async & defer, so it'll not block page load.
    insert_js_before = "</head>"
    insert_js_content = f'<script type="text/javascript" data-livereloadish-url="/{prefix}/watch/?uuid={{uuid}}&process_load={{process_load}}&page_load={{page_load}}&js_load=0" src="/{{prefix}}/watcher/livereloadish.js" defer async data-turbolinks="false" data-turbolinks-eval="false"></script>\n</head>'
    # When an error page (technical_404, technical_500) is shown, we want to
    # force a full page reload if they connect to the SSE, so that styles etc get
    # re-applied where they might not otherwise (eg: if I end up doing a udomdiff
    # on the body)
    insert_meta_before = "</head>"
    insert_meta_content = (
        '<meta name="livereloadish-css-strategy" content="reload">\n'
        '<meta name="livereloadish-image-strategy" content="reload">\n'
        '<meta name="livereloadish-js-strategy" content="reload">\n'
        '<meta name="livereloadish-page-strategy" content="reload">\n'
        "</head>"
    )

    def __init__(self, get_response: Any) -> None:
        if not settings.DEBUG:
            raise MiddlewareNotUsed("Livereloadish is only available if DEBUG=True")
        self.get_response = get_response
        self.process_load = time.time()

    def __call__(self, request: WSGIRequest) -> HttpResponseBase:
        if request.path[0:15] == f"/{self.prefix}/" and settings.DEBUG:
            request.urlconf = NamedUrlconf(
                path(f"{self.prefix}/", include(livereloadish.urls.urlpatterns))
            )
            return self.get_response(request)
        return self.insert_js(request, self.get_response(request))

    def insert_js(
        self, request: WSGIRequest, response: HttpResponseBase
    ) -> HttpResponseBase:
        # This prelude is taken from Django-debug-toolbar's middleware, because
        # it's been rock solid for my usage for 10 years, can't be totally wrong.
        content_encoding = response.headers.get("Content-Encoding", "")
        content_type = response.headers.get("Content-Type", "").partition(";")[0]
        if (
            getattr(response, "streaming", False)
            or "gzip" in content_encoding
            or content_type not in self.content_types
        ):
            logger.debug(
                "Livereloadish not being mounted for path %s",
                request.path,
                response.status_code,
            )
            return response
        content = response.content.decode(response.charset)
        # I don't want to load the SSE connection for 401/403/404 etc
        # because those cannot be rectified by a CSS/JS/HTML change so the auto-reloader
        # would kick in for the Python/Django change.
        # Note that it is still turned on for 500 errors (ie: the technical debug page)
        # because those may stem from TemplateSyntaxError, which is resolvable.
        # But we make sure we're doing a full page reload if the change came from
        # a template (or anything else, though they can't fix it), so that any
        # debug styles are flushed away and correct stylesheets etc are loaded in.
        if response.status_code >= 500 and self.insert_meta_before in content:
            logger.debug(
                "Livereloadish is telling the error page to do full page reloads for %s",
                request.path,
            )
            response.content = content.replace(
                self.insert_meta_before,
                self.insert_meta_content,
            )
            if "Content-Length" in response.headers:
                response["Content-Length"] = len(response.content)
            # TODO: avoid decoding it again here for the next if branch? IDK.
            content = response.content.decode(response.charset)

        if self.insert_js_before in content:
            logger.debug("Livereloadish is being mounted for path %s", request.path)
            response.content = content.replace(
                self.insert_js_before,
                self.insert_js_content.format(
                    prefix=self.prefix,
                    uuid=uuid4(),
                    process_load=self.process_load,
                    page_load=time.time(),
                ),
            )
            if "Content-Length" in response.headers:
                response["Content-Length"] = len(response.content)
        return response
