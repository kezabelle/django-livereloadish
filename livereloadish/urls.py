from django.urls import path, re_path
from django.views.decorators.cache import never_cache
from django.views.decorators.gzip import gzip_page

from .views import sse, stats, js

__all__ = ["urlpatterns"]

urlpatterns = [
    re_path(
        "watcher/livereloadish\.(?P<extension>js.map|js|ts|d.ts)",
        gzip_page(never_cache(js)),
    ),
    path("watch/", sse),
    path("stats/", never_cache(stats)),
]
