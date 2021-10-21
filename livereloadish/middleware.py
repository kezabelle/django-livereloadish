import json
import logging
import time
from collections import namedtuple
from typing import Any, Dict
from uuid import uuid4

from django.apps import apps
from django.conf import settings
from django.core.exceptions import MiddlewareNotUsed
from django.core.handlers.wsgi import WSGIRequest
from django.http.response import HttpResponseBase
from django.urls import include, path

from .urls import urlpatterns as livereloadish_urlpatterns

__all__ = ["logger", "NamedUrlconf", "LivereloadishMiddleware"]
logger = logging.getLogger(__name__)


class NamedUrlconf(namedtuple("NamedUrl", "included_patterns")):
    def __str__(self) -> str:
        return "livereloadish.middleware.LivereloadishMiddleware"


class LivereloadishMiddleware:
    __slots__ = ("get_response", "process_load", "appconf")
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
    insert_templates_before = ("<!--livereloadish-page-templates-->", "</body>")
    insert_templates_content = '<template id="livereloadish-page-templates" data-load-time="{page_load}" hidden>{templates}</template>\n{endmarker}'
    insert_files_before = ("<!--livereloadish-page-files-->", "</body>")
    insert_files_content = '<template id="livereloadish-page-files" data-load-time="{page_load}" hidden>{files}</template>\n{endmarker}'

    def __init__(self, get_response: Any) -> None:
        if not settings.DEBUG:
            raise MiddlewareNotUsed("Livereloadish is only available if DEBUG=True")
        try:
            self.appconf = apps.get_app_config("livereloadish")
        except LookupError:
            raise MiddlewareNotUsed("Livereloadish is in the INSTALLED_APPS")
        self.get_response = get_response
        self.process_load = time.time()

    def __call__(self, request: WSGIRequest) -> HttpResponseBase:
        if request.path[0:15] == f"/{self.prefix}/" and settings.DEBUG:
            request.urlconf = NamedUrlconf(
                path(f"{self.prefix}/", include(livereloadish_urlpatterns))
            )
            return self.get_response(request)
        self.appconf.during_request.templates = {}
        self.appconf.during_request.files = {}
        response = self.get_response(request)
        return self.insert_html(
            request,
            response,
            self.appconf.during_request.templates,
            self.appconf.during_request.files,
        )

    def insert_html(
        self,
        request: WSGIRequest,
        response: HttpResponseBase,
        templates: Dict[str, str],
        files: Dict[str, str],
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
            )
            return response

        content = response.content.decode(response.charset)
        content_touched = False

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
            content = content.replace(
                self.insert_meta_before,
                self.insert_meta_content,
            )
            content_touched = True

        when = time.time()

        if self.insert_js_before in content:
            logger.debug("Livereloadish is being mounted for path %s", request.path)
            content = content.replace(
                self.insert_js_before,
                self.insert_js_content.format(
                    prefix=self.prefix,
                    uuid=uuid4(),
                    process_load=self.process_load,
                    page_load=when,
                ),
            )
            content_touched = True

        response["X-Livereloadish-Templates"] = json.dumps(templates)
        response["X-Livereloadish-Files"] = json.dumps(files)

        for search_fragment in self.insert_templates_before:
            if search_fragment in content:
                logger.debug(
                    "Livereloadish saw %s Django templates for path %s",
                    len(templates),
                    request.path,
                )
                content = content.replace(
                    search_fragment,
                    self.insert_templates_content.format(
                        templates=response["X-Livereloadish-Templates"],
                        endmarker=search_fragment,
                        page_load=when,
                    ),
                )
                content_touched = True
                break

        for search_fragment in self.insert_files_before:
            if search_fragment in content:
                logger.debug(
                    "Livereloadish saw %s files for path %s",
                    len(files),
                    request.path,
                )
                content = content.replace(
                    search_fragment,
                    self.insert_files_content.format(
                        files=response["X-Livereloadish-Files"],
                        endmarker=search_fragment,
                        page_load=when,
                    ),
                )
                content_touched = True
                break

        if content_touched:
            response.content = content
            response["Content-Length"] = len(response.content)
        return response
