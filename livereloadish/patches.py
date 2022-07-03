import logging
import mimetypes
import os
import posixpath
import time
from typing import Any, Union, Optional, TYPE_CHECKING, Tuple
from urllib.parse import urlsplit, urlunsplit

from django.apps import apps
from django.conf import settings
from django.contrib.staticfiles import finders
from django.core.files.storage import FileSystemStorage
from django.core.handlers.wsgi import WSGIRequest
from django.dispatch import receiver
from django.http import HttpResponse, FileResponse, QueryDict, HttpResponseNotModified
from django.template import Engine, Context, Template, NodeList, Origin
from django.template.loader_tags import ExtendsNode
from django.templatetags.static import StaticNode
from django.utils._os import safe_join
from django.utils.autoreload import file_changed
from django.utils.cache import add_never_cache_headers, patch_cache_control
from django.utils.http import parse_http_date, http_date
from django.views import static

if TYPE_CHECKING:
    from .apps import LiveReloadishConfig

logger = logging.getLogger(__name__)
original_serve = static.serve
original_template_compile_nodelist = Template.compile_nodelist
original_engine_find_template = Engine.find_template
original_staticnode_url = StaticNode.url
original_extendsnode_get_parent = ExtendsNode.get_parent
original_filesystemstorage_url = FileSystemStorage.url

__all__ = [
    "logger",
    "do_patch_static_serve",
    "do_patch_template_compile_nodelist",
    "do_patch_engine_find_template",
    "do_patch_staticnode_url",
    "do_patch_extendsnode_get_parent",
    "do_patch_filesystemstorage_url",
]
if ".map" not in mimetypes.suffix_map:
    mimetypes.suffix_map[".map"] = ".json"

markdowns = {
    ".markdown",
    ".mdown",
    ".mkdn",
    ".md",
    ".mkd",
    ".mdwn",
    ".mdtxt",
    ".mdtext",
}
for ext in markdowns:
    _type, _encoding = mimetypes.guess_type(f"test{ext}")
    if _type is None:
        mimetypes.add_type("text/markdown", ext)


def patched_serve(
    request: WSGIRequest,
    path: str,
    document_root: Optional[str] = None,
    show_indexes: bool = False,
) -> Union[HttpResponse, FileResponse, HttpResponseNotModified]:
    __traceback_hide__ = True
    response: Union[HttpResponse, FileResponse, HttpResponseNotModified] = original_serve(
        request, path, document_root, show_indexes
    )  # type: ignore[assignment]
    # Seen by another layer, skip work
    if hasattr(response, "livereloadish_seen"):
        return response

    # If the client sent If-Modified-Since and it checked out, we won't have
    # the file content, but still need to track the request as if we did,
    # otherwise files may be missed between autoreloads.
    if isinstance(response, HttpResponseNotModified):
        path = posixpath.normpath(path).lstrip("/")
        abspath = safe_join(document_root, path)  # type: ignore[arg-type]
        content_type, encoding = mimetypes.guess_type(abspath)
        logger.debug(
            "Resolving HttpResponseNotModified for %s, still intending to track",
            abspath,
            extra={"request": request},
        )
    else:
        full_content_type = "application/octet-stream; fallback"
        if response.has_header("Content-Type"):
            full_content_type = response['Content-Type']

        content_type, seq, params = full_content_type.partition(";")

        try:
            abspath = os.path.abspath(response.file_to_stream.name)  # type: ignore [union-attr]
        except AttributeError as e:
            logger.exception(
                "Failed to get the FileResponse's file path for %s",
                path,
                exc_info=e,
                extra={"request": request},
            )
            return response

    mtime = 0.0
    appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
    if content_type in appconf.seen:
        mtime = os.path.getmtime(abspath)
        logger.debug(
            "Adding FileResponse(%s) to tracked assets using stat syscall: %s",
            abspath,
            mtime,
        )
        appconf.add_to_seen(
            content_type,
            request.path,
            abspath,
            mtime,
            # We don't KNOW whether it'll require a full page reload, it's
            # just a static file. Defer it to the JS/HTML to decide.
            requires_full_reload=False,
        )
    else:
        logger.debug(
            "Skipping FileResponse(%s) due to content type %s being un-tracked",
            abspath,
            content_type,
        )
    response.livereloadish_seen = True  # type: ignore[union-attr]
    request_mtime: Optional[Union[str, float]] = request.GET.get("livereloadish", None)
    if not request_mtime:
        # Can't know for sure if it's cacheable, bust it.
        add_never_cache_headers(response)
    try:
        request_mtime = float(request_mtime)
    except (TypeError, ValueError):
        # Someone fiddled the livereloadish=xxx var, forcibly uncache it.
        add_never_cache_headers(response)
    else:
        # Find the newest of
        # A) the request parameter,
        # B) the just-stat'd tracked file
        # C) the last-modified from the stat call in the view (probably the
        # same as B but with less precision)
        # And of those, set the cache header.
        fileresponse_mtime = 0.0

        if response.has_header("Last-Modified"):
            fileresponse_mtime = float(
                parse_http_date(response["Last-Modified"])
            )
        mtimes = (request_mtime, mtime, fileresponse_mtime)
        newest_mtime = max(mtimes)
        response["Last-Modified"] = http_date(newest_mtime)
        logger.debug(
            "Setting %s last modified header to %s because %s was the newest of %s",
            request.path,
            response["Last-Modified"],
            newest_mtime,
            mtimes,
        )
        # https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#requiring_revalidation
        patch_cache_control(response, no_cache=True, must_revalidate=True, max_age=0)
    return response


def do_patch_static_serve() -> bool:
    if not hasattr(static.serve, "livereloadish_seen"):
        logger.debug(
            "Patching: django.views.static.serve (used by django.contrib.staticfiles.views.serve)"
        )
        static.serve = patched_serve
        static.serve.livereloadish_seen = True
        return True
    return False


def patched_template_compile_nodelist(self: Template) -> NodeList:
    __traceback_hide__ = True
    output = original_template_compile_nodelist(self)
    try:
        appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
    except LookupError:
        return output
    try:
        seen_templates = appconf.during_request.templates
    except AttributeError:
        # We're outside of the request/response cycle, or haven't got the middleware
        logger.debug(
            "Ignoring Template.compile_nodelist(%s) for seen-during-request",
            self.origin.name,
        )
        return output
    seen_already_during_request = self.origin.template_name in seen_templates
    if self.origin.template_name and not seen_already_during_request:
        # We've seen this template, let's try and mark it as related to a
        # given request...
        # Note that at this point it should have an actual path rather
        # than being UNKNOWN_SOURCE
        seen_templates[self.origin.template_name] = self.origin.name
        # seen_templates[self.origin.name] = self.origin.template_name
        logger.debug(
            "Adding Template.compile_nodelist(%s) to seen-during-request",
            self.origin.name,
        )
    # Avoid stat'ing something like "pipeline/css.html" multiple times during
    # a single request in dev, when they're not amalgamated into one tag.
    if seen_already_during_request:
        logger.debug(
            "Previously seen-during-request for Template.compile_nodelist(%s)",
            self.origin.name,
        )
        return output
    # Seen by another layer, skip work
    if hasattr(self, "livereloadish_seen"):
        return output
    # It's a django.template.base.Template wrapping over a django.template.backends.django.Template
    if hasattr(self, "template") and hasattr(self.template, "livereloadish_seen"):
        return output

    try:
        abspath = os.path.abspath(self.origin.name)
    except AttributeError:
        pass
    else:
        content_type, encoding = mimetypes.guess_type(abspath)
        if content_type in appconf.seen:
            logger.debug(
                "Adding Template.compile_nodelist(%s) to tracked assets using stat syscall",
                abspath,
            )
            appconf.add_to_seen(
                content_type,
                self.origin.template_name,
                abspath,
                os.path.getmtime(abspath),
                # Support the notion of whether or not a template NEEDS a hard refresh
                # I can't do it by looking at nodelist + nodelist[0] == ExtendsNode
                # because then things added via {% include %} would also constitute
                # a full reload...
                requires_full_reload=False,
            )
        else:
            logger.debug(
                "Skipping Template.compile_nodelist(%s) due to content type %s being un-tracked",
                abspath,
                content_type,
            )
    self.livereloadish_seen = True  # type: ignore[attr-defined]
    return output


def do_patch_template_compile_nodelist() -> bool:
    if not hasattr(Template, "livereloadish_patched"):
        logger.debug("Patching: django.template.Template.compile_nodelist")
        Template.compile_nodelist = patched_template_compile_nodelist
        Template.livereloadish_patched = True  # type: ignore[attr-defined]
        return True
    return False


def patched_engine_find_template(
    self: Engine, name: str, dirs=None, skip=None
) -> Tuple[Template, Origin]:
    """
    This patch is required to ensure that by the time patched_extendsnode_get_parent
    executes we already have the Seen item in the data, otherwise we'll get
    a new Seen data but without the requires_full_reload=True
    """
    __traceback_hide__ = True
    template, origin = original_engine_find_template(self, name, dirs=dirs, skip=skip)
    # Seen by another layer, skip work
    if hasattr(template, "livereloadish_seen"):
        return template, origin
    # It's a django.template.base.Template wrapping over a django.template.backends.django.Template
    if hasattr(template, "template") and hasattr(
        template.template, "livereloadish_seen"
    ):
        return template, origin
    try:
        appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
    except LookupError:
        return template, origin
    try:
        abspath = os.path.abspath(origin.name)
    except AttributeError:
        pass
    else:
        try:
            seen_templates = appconf.during_request.templates
            seen_already_during_request = template.origin.template_name in seen_templates
        except AttributeError:
            seen_already_during_request = False
            # We're outside of the request/response cycle, or haven't got the middleware
            logger.debug(
                "Ignoring Engine.find_template(%s) for seen-during-request",
                template.origin.name,
            )
        if seen_already_during_request:
            logger.debug(
                "Previously seen-during-request for Engine.find_template(%s)",
                template.origin.name,
            )
        else:
            content_type, encoding = mimetypes.guess_type(abspath)
            if content_type in appconf.seen:
                logger.debug(
                    "Adding Engine.find_template(%s) to tracked assets using stat syscall",
                    abspath,
                )
                appconf.add_to_seen(
                    content_type,
                    origin.template_name,
                    abspath,
                    os.path.getmtime(abspath),
                    # Support the notion of whether or not a template NEEDS a hard refresh
                    # I can't do it by looking at nodelist + nodelist[0] == ExtendsNode
                    # because then things added via {% include %} would also constitute
                    # a full reload...
                    requires_full_reload=False,
                )
            else:
                logger.debug(
                    "Skipping Engine.find_template(%s) due to content type %s being un-tracked",
                    abspath,
                    content_type,
                )
    template.livereloadish_seen = True
    return template, origin


def do_patch_engine_find_template() -> bool:
    """
    This patch is required to ensure that by the time patched_extendsnode_get_parent
    executes we already have the Seen item in the data, otherwise we'll get
    a new Seen data but without the requires_full_reload=True
    """
    if not hasattr(Engine, "livereloadish_patched"):
        logger.debug("Patching: django.template.engine.Engine.find_template")
        Engine.find_template = patched_engine_find_template
        Engine.livereloadish_patched = True
        return True
    return False


def patched_staticnode_url(self: StaticNode, context: Context) -> str:
    __traceback_hide__ = True
    url: str = original_staticnode_url(self, context)
    scheme, netloc, path, query, fragment = urlsplit(url)
    if scheme or netloc or "livereloadish=" in query:
        return url
    static_url_length = len(settings.STATIC_URL)
    if static_url_length and path[0:static_url_length] == settings.STATIC_URL:
        name = path[static_url_length:]
        underlying_file = finders.find(name)
        if underlying_file is not None:
            try:
                ident = os.path.getmtime(underlying_file)
            except FileNotFoundError:
                ident = time.time()
            else:
                # And now, try and match this file to things that
                # were loaded during "this request" (if there is one)
                try:
                    appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
                    seen_files = appconf.during_request.files
                except (LookupError, AttributeError):
                    logger.debug(
                        "Ignoring StaticNode.url(%s) for seen-during-request",
                        name,
                    )
                else:
                    # We've seen this file, let's try and mark it as related to a
                    # given request...
                    seen_files[name] = underlying_file
                    # seen_files[underlying_file] = name
                    logger.debug(
                        "Adding StaticNode.url(%s) to seen-during-request",
                        name,
                    )
        else:
            ident = time.time()
    else:
        ident = time.time()
    qd = QueryDict(query, mutable=True)
    qd.setdefault("livereloadish", ident)
    return urlunsplit((scheme, netloc, path, qd.urlencode(), fragment))


def do_patch_staticnode_url() -> bool:
    if not hasattr(StaticNode, "livereloadish_patched"):
        logger.debug("Patching: django.templatetags.static.StaticNode.url")
        StaticNode.url = patched_staticnode_url
        StaticNode.livereloadish_patched = True
        return True
    return False


def patched_extendsnode_get_parent(self: ExtendsNode, context: Context) -> Any:
    __traceback_hide__ = True
    template = original_extendsnode_get_parent(self, context)
    if hasattr(template, "livereloadish_seen"):
        try:
            abspath = os.path.abspath(template.origin.name)
        except AttributeError:
            pass
        else:
            content_type, encoding = mimetypes.guess_type(abspath)
            try:
                appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
            except LookupError:
                return template
            if content_type in appconf.seen and abspath in appconf.seen[content_type]:
                existing_seen = appconf.seen[content_type][abspath]
                logger.debug(
                    "ExtendsNode.find_parent(%s) requires updating the seen list to requires_full_reload=True",
                    abspath,
                )
                appconf.add_to_seen(
                    content_type,
                    existing_seen.relative_path,
                    existing_seen.absolute_path,
                    existing_seen.mtime,
                    requires_full_reload=True,
                )
    return template


def do_patch_extendsnode_get_parent() -> bool:
    if not hasattr(ExtendsNode, "livereloadish_patched"):
        logger.debug("Patching: django.template.loader_tags.ExtendsNode.get_parent")
        ExtendsNode.get_parent = patched_extendsnode_get_parent
        ExtendsNode.livereloadish_patched = True
        return True
    return False


def patched_filesystemstorage_url(self: FileSystemStorage, name: str) -> str:
    __traceback_hide__ = True
    url: str = original_filesystemstorage_url(self, name)
    scheme, netloc, path, query, fragment = urlsplit(url)
    if scheme or netloc or "livereloadish=" in query:
        return url
    qd = QueryDict(query, mutable=True)
    underlying_file = finders.find(name)
    if underlying_file is not None:
        try:
            ident = os.path.getmtime(underlying_file)
        except FileNotFoundError:
            ident = time.time()
        else:
            # And now, try and match this file to things that
            # were loaded during "this request" (if there is one)
            try:
                appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
                seen_files = appconf.during_request.files
            except (LookupError, AttributeError):
                logger.debug(
                    "Ignoring FileSystemStorage.url(%s) for seen-during-request",
                    name,
                )
            else:
                # We've seen this file, let's try and mark it as related to a
                # given request...
                seen_files[name] = underlying_file
                # seen_files[underlying_file] = name
                logger.debug(
                    "Adding FileSystemStorage.url(%s) to seen-during-request",
                    name,
                )
    else:
        ident = time.time()
    qd.setdefault("livereloadish", ident)
    return urlunsplit((scheme, netloc, path, qd.urlencode(), fragment))


def do_patch_filesystemstorage_url() -> bool:
    if not hasattr(FileSystemStorage, "livereloadish_patched"):
        logger.debug("Patching: django.core.files.storage.FileSystemStorage.url")
        FileSystemStorage.url = patched_filesystemstorage_url
        FileSystemStorage.livereloadish_patched = True
        return True
    return False


@receiver(file_changed, dispatch_uid="livereloadish_file-changed")
def listen_for_python_changes(sender, file_path, **kwargs):
    abspath = str(file_path)
    content_type, encoding = mimetypes.guess_type(abspath)
    if content_type not in {"text/x-python", "application/x-python-code"}:
        return None
    try:
        appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
    except LookupError:
        return None

    if content_type in appconf.seen:
        logger.debug(
            "Adding listen_for_python_changes(%s) to tracked assets using stat syscall",
            file_path,
        )
        appconf.add_to_seen(
            content_type,
            abspath,
            abspath,
            os.path.getmtime(abspath),
            # Support the notion of whether or not a template NEEDS a hard refresh
            # I can't do it by looking at nodelist + nodelist[0] == ExtendsNode
            # because then things added via {% include %} would also constitute
            # a full reload...
            requires_full_reload=True,
        )
    else:
        logger.debug(
            "Skipping listen_for_python_changes(%s) due to content type %s being un-tracked",
            abspath,
            content_type,
        )
    return
