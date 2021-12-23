"""
A reusable Django application which enables Live Reload functionality under
runserver, without any dependencies on any fancy nodejs or npm shenanigans,
or indeed ... anything other than Django. Based partially on ideas found
in phoenix_live_reload and livereload but with an unnecessary amount of
reinventing the wheel, because why not?

A number of monkeypatches are applied, for things like static files serving and
templates to track the files loaded and continually monitor them by means of a
SSE connection. When one of the tracked files is changed, the SSE connection
notifies some TypeScript (compiled to ES5) on the client, which attempts to
replace the affected file automatically.

Where possible, the replacement is done without reloading the page, which is the
magic from phoenix_live_reload and livereload I wanted to emulate. This mostly
works for CSS files and images (including responsive ones using <picture> or srcset="..."
but also attempts to do so for idempotent JS, and for HTML templates themselves.

It additionally forces requests going through static files serving to never be
cached, so you don't need to remember to have your devtools open (though who doesn't)
and have ticked that tickbox in the network panel.
"""
import mimetypes
import os
from typing import Optional, Literal
from django.apps import apps as django_apps_registry
from django.core.exceptions import ImproperlyConfigured
from .apps import LiveReloadishConfig

from .middleware import LivereloadishMiddleware


__all__ = ["LiveReloadishConfig", "LivereloadishMiddleware", "watch_file"]
default_app_config = "livereloadish.apps.LiveReloadishConfig"


def watch_file(
    relative_path: str,
    absolute_path: str,
    content_type: Optional[str] = None,
    mtime: Optional[float] = None,
    requires_full_reload: bool = True,
) -> bool:
    """
    Simple functional API for manually adding a file to the watched list in your
    project.

    Requires the absolute path to the file, and the "relative" path to broadcast
    to the frontend. The "relative" path is only relative to something ambiguous,
    like your template finders, or staticfiles finders.

    To force partial reload (if possible), set requires_full_reload to False.

    If neither the mime type (e.g: text/css) nor the mtime (eg: 1634811820.689562)
    is given, they will be inferred from the absolute path to the file.

    Does not handle exceptions, which may be:
    getmtime => FileNotFoundError, OSError, etc.
    get_app_config => LookupError
    """
    if content_type is None:
        content_type, encoding = mimetypes.guess_type(absolute_path)
    if mtime is None:
        mtime = os.path.getmtime(absolute_path)

    try:
        appconf: LiveReloadishConfig = django_apps_registry.get_app_config("livereloadish")
    except LookupError as exc:
        raise ImproperlyConfigured("Unable to watch a file without an appconfig for 'livereloadish'") from exc
    if content_type in appconf.seen:
        return appconf.add_to_seen(
            content_type=content_type,
            relative_path=relative_path,
            absolute_path=absolute_path,
            mtime=mtime,
            requires_full_reload=requires_full_reload,
        )
    return False
