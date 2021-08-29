import logging
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
    prefix = "livereloadish"
    content_types = ("text/html", "application/xhtml+xml")
    insert_js_before = "</body>"
    insert_js_content = f'<script data-livereloadish-id="{{uuid}}" type="text/javascript" data-livereloadish-url="/{prefix}/watch/?livereloadish={{uuid}}" src="/{{prefix}}/watcher/livereloadish.js" defer async data-turbolinks="false" data-turbolinks-eval="false"></script></body>'

    def __init__(self, get_response: Any) -> None:
        if not settings.DEBUG:
            raise MiddlewareNotUsed("Livereloadish is only available if DEBUG=True")
        self.get_response = get_response

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
        # Additionally I don't want to load the SSE connection for 401/403/404 etc
        # because those cannot be rectified by a CSS/JS/HTML change so the auto-reloader
        # would kick in for the Python/Django change.
        # Note that it is still turned on for 500 errors (ie: the technical debug page)
        # because those may stem from TemplateSyntaxError, which is resolvable.
        if (
            getattr(response, "streaming", False)
            or "gzip" in content_encoding
            or content_type not in self.content_types
            or (400 < response.status_code < 500)
        ):
            logger.debug(
                "Livereloadish not being mounted for path %s with HTTP status=%s",
                request.path,
                response.status_code,
            )
            return response
        content = response.content.decode(response.charset)
        if self.insert_js_before in content:
            logger.debug("Livereloadish is being mounted for path %s", request.path)
            response.content = content.replace(
                self.insert_js_before,
                self.insert_js_content.format(prefix=self.prefix, uuid=uuid4()),
            )
            if "Content-Length" in response.headers:
                response["Content-Length"] = len(response.content)
        return response
