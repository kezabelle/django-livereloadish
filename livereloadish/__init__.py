import mimetypes
import os
from typing import Optional, Literal
from django.apps import apps as django_apps_registry
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

    appconf: LiveReloadishConfig = django_apps_registry.get_app_config("livereloadish")
    if content_type in appconf.seen:
    return appconf.add_to_seen(
        content_type=content_type,
        relative_path=relative_path,
        absolute_path=absolute_path,
        mtime=mtime,
        requires_full_reload=requires_full_reload,
    )
    return False
