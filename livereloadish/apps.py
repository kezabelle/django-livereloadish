import logging
import os
import pickle
import time
from collections import namedtuple
from hashlib import sha1
from tempfile import gettempdir
from typing import Dict, NamedTuple, Literal

from django.apps import AppConfig
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.utils.autoreload import DJANGO_AUTORELOAD_ENV
from django.utils.functional import cached_property

from livereloadish.patches import (
    do_patch_static_serve,
    do_patch_select_template,
    do_patch_get_template,
    do_patch_templateresponse_resolve_template,
    do_patch_engine_find_template,
    do_patch_staticnode_url,
    do_patch_filesystemstorage_url,
)

logger = logging.getLogger(__name__)

Seen = namedtuple(
    "Seen", ("relative_path", "absolute_path", "mtime", "needs_full_reload")
)


class LiveReloadishConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "livereloadish"
    label = "livereloadish"

    # Assuming multiple projects, and each one is a separate venv, is probably enough...
    lockfile: str = sha1(os.path.dirname(__file__).encode("utf-8")).hexdigest()
    # How long before a file (either the lockfile or the individual entries therein)
    # is considered stale, in seconds.
    stale_after: int = 60 * 15

    # Sleep durations for the SSE connection
    sleep_quick = 0.35
    sleep_slow = 1.0

    # This is intentionally mutable, fwiw.
    # It's also in a precise order, being that dicts are insertion ordered nowawdays.
    # CSS is most likely to change, then templates (which /may/ be a partial reload)
    # then finally JS which is most likely a full page reload (cos I ain't implemented
    # any form of module.hot style accept/reject) to throw away state and keep things
    # lovely and stateless.
    # And then a bunch of stuff where there may not be a specific reliable
    # strategy (eg: images. Easy enough to replace <img> but then what about <picture>
    # and srcset and CSS backgrounds etc)
    seen: Dict[str, Dict[str, Seen]] = {
        "text/css": {},
        "text/html": {},
        "application/xhtml+xml": {},
        "text/javascript": {},
        "image/png": {},
        "image/jpeg": {},
        "image/svg+xml": {},
        "image/webp": {},
        "image/gif": {},
        "font/ttf": {},
        "font/woff": {},
        "font/woff2": {},
        # "application/json": {},
    }

    def ready(self) -> bool:
        if not self._should_be_enabled():
            logger.debug("Livereloadish is not applying patches")
        logger.info("Livereloadish applying patches for the process")
        return all(
            (
                do_patch_static_serve(),
                do_patch_select_template(),
                do_patch_get_template(),
                do_patch_templateresponse_resolve_template(),
                do_patch_engine_find_template(),
                do_patch_filesystemstorage_url(),
                do_patch_staticnode_url(),
                self.load_from_lockfile(),
            )
        )

    def add_to_seen(
        self,
        content_type: str,
        relative_path: str,
        absolute_path: str,
        mtime: float,
        requires_full_reload: bool,
    ) -> Literal[True]:
        self.seen[content_type][absolute_path] = Seen(
            relative_path, absolute_path, mtime, requires_full_reload
        )
        return True

    @cached_property
    def lockfile_storage(self) -> FileSystemStorage:
        return FileSystemStorage(
            location=os.path.join(gettempdir(), "livereloadish"),
            base_url=None,
        )

    def _should_be_enabled(self) -> bool:
        return (
            settings.DEBUG is True
            and os.environ.get(DJANGO_AUTORELOAD_ENV, "false") == "true"
        )

    def load_from_lockfile(self) -> bool:
        if not self._should_be_enabled():
            logger.debug("Livereloadish skipping loading previously seen file cache")
            return False
        if not self.lockfile_storage.exists(self.lockfile):
            logger.debug("Livereloadish has no previously seen file cache")
            return False
        last_modified = os.path.getmtime(self.lockfile_storage.path(self.lockfile))
        # If it's there but older than we'd like, assume a refresh is needed
        # to collect files to watch.
        if last_modified < (time.time() - self.stale_after):
            logger.info("Livereloadish has a stale cache of seen files")
            return False
        with self.lockfile_storage.open(self.lockfile) as f:
            try:
                self.seen = pickle.loads(f.read())
            except EOFError:
                logger.warning(
                    "Livereloadish previously seen files cache is corrupt: %s",
                    self.lockfile,
                )
            except TypeError:
                logger.warning(
                    "Livereloadish previously seen files cache contains out of date datastructures",
                    self.lockfile,
                )
            else:
                file_count = sum(len(values) for values in self.seen.values())
                logger.debug(
                    "Livereloadish %s previously seen files are being tracked from cache (< 15 minutes old): %s",
                    file_count,
                    self.lockfile,
                )
            return True

    def dump_to_lockfile(self) -> bool:
        if not self._should_be_enabled():
            logger.debug("Livereloadish skipping dumping previously seen file cache")
            return False
        file_count = sum(len(values) for values in self.seen.values())
        logger.debug(
            "Livereloadish dumping %s previously seen files to cache: %s",
            file_count,
            self.lockfile,
        )
        self.lockfile_storage.delete(self.lockfile)
        self.lockfile_storage.save(self.lockfile, ContentFile(pickle.dumps(self.seen)))
        return True
