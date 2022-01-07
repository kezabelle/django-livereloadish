import logging
import os
import pickle
import time
import pathlib
from collections import namedtuple
from datetime import datetime, timezone
from hashlib import sha1
from tempfile import gettempdir
from typing import Dict, Literal, Optional

from asgiref.local import Local
from django.apps import AppConfig, apps
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.dispatch import receiver
from django.utils.autoreload import (
    DJANGO_AUTORELOAD_ENV,
    autoreload_started,
    BaseReloader,
)
from django.utils.functional import cached_property

from livereloadish.patches import (
    do_patch_static_serve,
    do_patch_engine_find_template,
    do_patch_staticnode_url,
    do_patch_filesystemstorage_url,
    do_patch_extendsnode_get_parent,
    do_patch_template_compile_nodelist,
)

__all__ = ["logger", "Seen", "LiveReloadishConfig"]
logger = logging.getLogger(__name__)


class Seen(
    namedtuple(
        "Seen",
        ("relative_path", "absolute_path", "filename", "mtime", "requires_full_reload"),
    )
):
    def mtime_as_utc_date(self):
        return datetime.fromtimestamp(self.mtime, timezone.utc)

    def _asdict(self):
        return {
            "relative_path": self.relative_path,
            "absolute_path": self.absolute_path,
            "filename": self.filename,
            "mtime": self.mtime,
            "mtime_iso": self.mtime_as_utc_date().isoformat(),
            "requires_full_reload": self.requires_full_reload,
        }


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
        "application/javascript": {},
        "image/png": {},
        "image/jpeg": {},
        "image/svg+xml": {},
        "image/webp": {},
        "image/gif": {},
        "font/ttf": {},
        "font/woff": {},
        "font/woff2": {},
        "text/x-python": {},
        "application/x-python-code": {},
        "text/markdown": {},
        # "application/json": {},
    }
    during_request = Local()
    django_reloader: Optional[BaseReloader] = None

    def ready(self) -> bool:
        if not self._should_be_enabled():
            logger.debug("Livereloadish is not applying patches")
            return False
        logger.info("Livereloadish applying patches for the process")
        return all(
            (
                do_patch_static_serve(),
                do_patch_template_compile_nodelist(),
                do_patch_engine_find_template(),
                do_patch_filesystemstorage_url(),
                do_patch_staticnode_url(),
                do_patch_extendsnode_get_parent(),
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
            relative_path,
            absolute_path,
            os.path.basename(relative_path),
            mtime,
            requires_full_reload,
        )
        # Disabled for now ...
        if 0 and self.django_reloader is not None:
            # Apparently the modern reloader literally doesn't support str paths,
            # only Path instances. boo.
            #
            # mtime = file.stat().st_mtime
            #   AttributeError: 'str' object has no attribute 'stat'
            #
            # Note that I can't see a way to determine if the file being changed
            # is already present in either directory_globs or iter_all_python_module_files
            # so I think doing it this way introduces the possibility that it's
            # stat'd twice or thrice? Although it may get amortized down into one
            # value based on snapshot_files()'s seen_files or tick's mtimes?
            self.django_reloader.extra_files.add(pathlib.Path(absolute_path))
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
        lockfile_path = self.lockfile_storage.path(self.lockfile)
        last_modified = os.path.getmtime(lockfile_path)
        # If it's there but older than we'd like, assume a refresh is needed
        # to collect files to watch.
        if last_modified < (time.time() - self.stale_after):
            logger.info(
                "Livereloadish has a stale cache of seen files: %s", lockfile_path
            )
            return False
        with self.lockfile_storage.open(self.lockfile) as f:
            try:
                self.seen = pickle.loads(f.read())
            except EOFError:
                logger.warning(
                    "Livereloadish previously seen files cache is corrupt: %s",
                    lockfile_path,
                )
            except TypeError:
                logger.warning(
                    "Livereloadish previously seen files cache contains out of date datastructures: %s",
                    lockfile_path,
                )
            else:
                file_count = sum(len(values) for values in self.seen.values())
                logger.debug(
                    "Livereloadish %s previously seen files are being tracked from cache (< 15 minutes old): %s",
                    file_count,
                    lockfile_path,
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
            self.lockfile_storage.path(self.lockfile),
        )
        try:
            self.lockfile_storage.delete(self.lockfile)
            self.lockfile_storage.save(
                self.lockfile, ContentFile(pickle.dumps(self.seen))
            )
        except FileNotFoundError as e:
            logger.debug(
                "Failed to dump %s files into previously seen file cache, lockfile was swept away probably",
                file_count,
                exc_info=e,
            )
            # Delete the cached_property to try again at getting the temp dir.
            # Because it could've technically changed...
            if "lockfile_storage" in self.__dict__:
                self.__dict__.pop("lockfile_storage")
            return False
        except OSError as e:
            logger.debug(
                "Failed to dump %s files into previously seen file cache for an unknown reason",
                file_count,
                exc_info=e,
            )
            # Delete the cached_property to try again at getting the temp dir.
            # Because it could've technically changed...
            if "lockfile_storage" in self.__dict__:
                self.__dict__.pop("lockfile_storage")
            return False
        return True


@receiver(autoreload_started, dispatch_uid="livereloadish_reloader-connected")
def save_reloader_to_appconfig(sender, signal, **kwargs):
    """
    I can't see a way to actually get a reference to the reloader in use within
    the autoreload module, nor anywhere in the stack frame history, so let's
    just patch one the heck in manually.
    """
    try:
        appconf = apps.get_app_config("livereloadish")
    except LookupError:
        return None
    else:
        appconf.django_reloader = sender
