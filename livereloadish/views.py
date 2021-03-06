import atexit
import json
import logging
import os
import socket
import sys
import time
from typing import Any, Union, Iterator
from uuid import UUID

try:
    from psutil import sensors_battery
except ImportError:
    sensors_battery = None
from django.apps import apps
from django.conf import settings
from django.core.exceptions import (
    PermissionDenied,
    AppRegistryNotReady,
    ImproperlyConfigured,
)
from django.core.handlers.wsgi import WSGIRequest
from django.core.servers.basehttp import ServerHandler
from django.http import (
    StreamingHttpResponse,
    JsonResponse,
    HttpResponse,
    HttpResponseNotAllowed,
    Http404,
    FileResponse,
)
from django.template.response import TemplateResponse
from django.views import static, View

from livereloadish import LiveReloadishConfig

__all__ = ["logger", "js", "SSEView", "sse", "stats"]
logger = logging.getLogger(__name__)


class Timer:
    __slots__ = ("start", "end")

    def __new__(cls) -> "Timer":
        instance: "Timer" = super().__new__(cls)
        instance.start = 0
        instance.end = 0
        return instance

    def __enter__(self) -> "Timer":
        self.start = time.perf_counter_ns()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.end = time.perf_counter_ns()

    def elapsed(self) -> float:
        return (self.end - self.start) * 1e-9  # 1e-6


def js(
    request: WSGIRequest, extension: str
) -> Union[HttpResponse, FileResponse, HttpResponseNotAllowed]:
    if request.method not in {"GET"}:
        return HttpResponseNotAllowed({"GET"})
    if not settings.DEBUG:
        raise Http404("Only available when DEBUG=True")
    if extension not in {"ts", "d.ts", "js", "js.map"}:
        raise Http404("Invalid file specified")
    try:
        apps.get_app_config("livereloadish")
    except LookupError:
        raise Http404("Only available when the livereloadish app is in INSTALLED_APPS")
    return static.serve(
        request,
        path=f"js/livereloadish.{extension}",
        document_root=os.path.join(os.path.dirname(__file__), "static"),
        show_indexes=False,
    )  # type: ignore[return-value]


class SSEView(View):
    def get(self, request: WSGIRequest) -> StreamingHttpResponse:
        if not settings.DEBUG:
            raise Http404("Only available when DEBUG=True")
        try:
            req_uuid = str(UUID(request.GET["uuid"]))
            short_req_uuid, _ignored, _ignored = req_uuid.partition("-")
        except (ValueError, KeyError) as e:
            raise PermissionDenied("Missing livereloadish UUID") from e
        # I'm using js_load instead of page_load because the latter doesn't
        # change if you close a tab and then re-summon it from the dead.
        # But the JS does re-fire to create an EventSource, complete with
        # a new epoch value.
        # Thus if you re-summon it and then quickly change something, it should
        # get notified.
        try:
            last_scan = float(request.GET["js_load"])
        except (TypeError, ValueError, KeyError):
            last_scan = time.time()
        try:
            appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
        except LookupError:
            raise Http404(
                "Only available when the livereloadish app is in INSTALLED_APPS"
            )
        return StreamingHttpResponse(
            streaming_content=self.loop(
                request=request,
                reqid=short_req_uuid,
                last_scan=last_scan,
                appconf=appconf,
            ),
            content_type="text/event-stream",
        )

    def loop(
        self,
        request: WSGIRequest,
        reqid: str,
        last_scan: float,
        appconf: LiveReloadishConfig,
    ) -> Iterator[str]:
        loop_count = 0
        logger.info(
            "[%s] Livereloadish SSE client connected at %s, starting",
            reqid,
            last_scan,
            extra={"request": request},
        )
        yield f'id: {reqid},{last_scan}\nevent: connect\ndata: {{"msg": "starting file watcher"}}\n\n'

        socket_is_open = True
        # This is me just finding out and documenting where these things live.
        # By no means is it an endorsement for trying to use anything other than
        # runserver for this. AFAIK It'll lock a whole thread permanently until
        # a client disconnects, so it's only really suitable for local stuff.
        if "gunicorn.socket" in request.environ:
            socket_handler: socket.socket = request.environ["gunicorn.socket"]
        elif "waitress.client_disconnected" in request.environ:
            # So Waitress has waitress.channel.HTTPChannel.check_client_disconnected
            # passed in, buuuuuuut calling it once the client has gone away doesn't
            # work if the channel_request_lookahead isn't set to > 0 ... which requires
            # setting that for the whole WSGI app via config or CLI. So let's
            # test the socket the same way as we do for the others, by finding it
            # in the stack. Bleh.
            parent_frame = sys._getframe().f_back
            server_handler = parent_frame.f_locals.get("self", None)  # type: ignore[union-attr]
            try:
                socket_handler = server_handler.channel.socket
            except AttributeError:
                logger.error(
                    "[%s] Livereloadish failed to walk the stack backwards to find the socket using waitress as a server, for connection termination",
                    reqid,
                    extra={"request": request},
                )
                yield f'id: {reqid},{last_scan}\nevent: disconnect\ndata: {{"msg": "stopping file watcher"}}\n\n'
                socket_is_open = False
                # runserver and Gunicorn both allow using
                # raise EnvironmentError(ECONNRESET, "Cancelling SSE before it loops")
                # but waitress doesn't catch it so it bleeds up.
                # return ""
        else:
            parent_frame = sys._getframe().f_back
            server_handler = parent_frame.f_locals.get("self", None)  # type: ignore[union-attr]
            if not isinstance(server_handler, ServerHandler):
                logger.error(
                    "[%s] Livereloadish failed to walk the stack backwards to find the ServerHandler in charge of the socket, for connection termination",
                    reqid,
                    extra={"request": request},
                )
                yield f'id: {reqid},{last_scan}\nevent: disconnect\ndata: {{"msg": "stopping file watcher"}}\n\n'
                socket_is_open = False
                # runserver and Gunicorn both allow using
                # raise EnvironmentError(ECONNRESET, "Cancelling SSE before it loops")
                # but waitress doesn't catch it so it bleeds up.
                # return ""
            socket_handler = server_handler.request_handler.connection

        while socket_is_open:
            # Test whether the client has hung up, apparently.
            # https://stackoverflow.com/a/62277798 and
            # https://stackoverflow.com/a/7589126 combined yo...
            # Fun fact, all this seems to work fine until you try and kill a waitress
            # server with current SSE connections, and then it terminates after
            # timeout with N threads still running (and presumably finally killed)
            # because in all of these scenarios, BlockingIOError(errno=35) is
            # returned regardless.
            is_blocking = socket_handler.getblocking()
            try:
                socket_handler.setblocking(False)
                # I don't know that I need socket.MSG_DONTWAIT | socket.MSG_PEEK if
                # setblock is already false...
                socket_data = socket_handler.recv(
                    16, socket.MSG_DONTWAIT | socket.MSG_PEEK
                )
                socket_is_open = len(socket_data) > 0
            except BlockingIOError:
                socket_is_open = True
            except ConnectionResetError:
                socket_is_open = False
                logger.debug(
                    "[%s] Livereloadish client disappeared via 'connection reset by peer'",
                    reqid,
                    extra={"request": request},
                )
            finally:
                if is_blocking:
                    socket_handler.setblocking(is_blocking)

            if not socket_is_open:
                logger.info(
                    "[%s] Livereloadish client disconnected after %s, cancelling",
                    reqid,
                    last_scan,
                    extra={"request": request},
                )
                break
                # runserver and Gunicorn both allow using
                # raise EnvironmentError(ECONNRESET, "Cancelling SSE in the loop")
                # but waitress doesn't catch it so it bleeds up.
                # return ""

            loop_count += 1

            min_increment = appconf.sleep_quick
            if loop_count % 20 == 0:
                if sensors_battery:
                    battery_percentage = sensors_battery()
                    if battery_percentage and battery_percentage.percent <= 50:
                        min_increment = appconf.sleep_quick * 2
                yield f'id: {reqid},{last_scan}\nevent: ping\ndata: {{"msg": "keep-alive ping after {loop_count} loops, scanning every {min_increment}s"}}\n\n'
                logger.info(
                    "[%s] Livereloadish keep-alive ping, scanning every %ss",
                    reqid,
                    min_increment,
                    extra={"request": request},
                )
                appconf.dump_to_lockfile()

            with Timer() as fileiterator:
                file_count = 0
                for content_type, files in tuple(appconf.seen.items()):
                    for key, file in tuple(files.items()):
                        file_count += 1
                        # When multiple SSEs are running, each is doing a separate
                        # scan (yeah not ideal but I also don't care that much and
                        # don't have more than 2 browsers in play at once so whatever)
                        # and another scan could trigger a reload in between this
                        # one's scans, so for it to be picked up we need to track
                        # when this one last completed and check the mtime against
                        # that first.
                        if file.mtime > last_scan:
                            data = json.dumps(
                                {
                                    "msg": "file updated elsewhere",
                                    "asset_type": content_type,
                                    "old_time": last_scan,
                                    "new_time": file.mtime,
                                    "info": file.to_dict(),
                                }
                            )
                            logger.info(
                                "[%s] Livereloadish change detected between runs in %s",
                                reqid,
                                file.relative_path,
                                extra={"request": request},
                            )
                            yield f"id: {reqid},{last_scan}\nevent: assets_change\ndata: {data}\n\n"
                            continue

                        # If mtime throws an error, the file in question was deleted
                        # so trigger a reload, otherwise see if it's newer and if it
                        # is trigger a change request.
                        try:
                            new_mtime: float = os.path.getmtime(key)
                        except FileNotFoundError:
                            data = json.dumps(
                                {
                                    "msg": "file deleted",
                                    "asset_type": content_type,
                                    "old_time": file.mtime,
                                    "new_time": 0,
                                    "info": file.to_dict(),
                                }
                            )
                            logger.info(
                                "[%s] Livereloadish deletion/move detected for %s",
                                reqid,
                                file.relative_path,
                                extra={"request": request},
                            )
                            yield f"id: {reqid},{last_scan}\nevent: assets_delete\ndata: {data}\n\n"
                            appconf.seen[content_type].pop(key, None)
                        else:
                            if new_mtime > file.mtime:
                                data = json.dumps(
                                    {
                                        "msg": "file updated",
                                        "asset_type": content_type,
                                        "old_time": file.mtime,
                                        "new_time": new_mtime,
                                        "info": file.to_dict(),
                                    }
                                )
                                logger.info(
                                    "[%s] Livereloadish change detected in %s",
                                    reqid,
                                    file.relative_path,
                                    extra={"request": request},
                                )
                                yield f"id: {reqid},{last_scan}\nevent: assets_change\ndata: {data}\n\n"
                                appconf.seen[content_type][key] = file._replace(
                                    mtime=new_mtime
                                )
            last_scan = time.time()
            scan_duration = fileiterator.elapsed()
            # Slow down (or stop) the watcher if it starts taking too long...
            if scan_duration >= min_increment:
                increment = appconf.sleep_slow
            elif scan_duration >= appconf.sleep_slow:
                socket_is_open = False
                logger.info(
                    "[%s] Checking mtimes for %s files took too long (%ss), turning off SSE permanently",
                    reqid,
                    file_count,
                    scan_duration,
                    extra={"request": request},
                )
                continue
            elif file_count == 0:
                increment = appconf.sleep_slow
            else:
                increment = min_increment

            logger.debug(
                "[%s] Checking mtimes for %s files took %ss, checking again in %ss",
                reqid,
                file_count,
                scan_duration,
                increment,
                extra={"request": request},
            )
            # Sleep at the end, because on the first iteration it's probably on
            # page load and there may have been something to change since
            # page_load/js_load were set. Basically a race condition where I'm
            # saving & alt-tabbing quickly after refreshing and I don't want to
            # miss a change and then assume it's got stuck and refresh manually again.
            # Sort of defeats the point of livereload if I don't have faith in it working.
            time.sleep(increment)


sse = SSEView.as_view()


def stats(
    request: WSGIRequest,
) -> Union[TemplateResponse, JsonResponse, HttpResponseNotAllowed]:
    if request.method not in {"GET"}:
        return HttpResponseNotAllowed({"GET"})
    if not settings.DEBUG:
        raise Http404("Only available when DEBUG=True")
    try:
        tracked_files = apps.get_app_config("livereloadish").seen  # type: ignore[attr-defined]
    except (LookupError, AttributeError) as exc:
        raise Http404(
            "Only available when the livereloadish app is in INSTALLED_APPS"
        ) from exc
    if "json" in request.GET:
        return JsonResponse(
            data=tracked_files,
            json_dumps_params={"indent": 4},
        )
    response = TemplateResponse(
        request=request,
        template="livereloadish/stats.html",
        context={
            "data": tracked_files,
        },
    )
    response[
        "Content-Security-Policy"
    ] = "default-src 'self'; img-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none';"
    return response


@atexit.register
def tidyup() -> None:
    try:
        appconf: LiveReloadishConfig = apps.get_app_config("livereloadish")  # type: ignore[assignment]
    except (LookupError, AppRegistryNotReady, ImproperlyConfigured) as e:
        return
    if appconf._should_be_enabled():
        try:
            appconf.dump_to_lockfile()
        except Exception as e:
            logger.warning(
                "An error occurred dumping the Livereloadish data on exit",
                exc_info=e,
            )
