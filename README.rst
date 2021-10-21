django-livereloadish
====================

:author: Keryn Knight
:version: 0.1.0

A reusable `Django`_ application which enables *Live Reload* functionality under runserver,
without any dependencies on any fancy ``nodejs`` or ``npm`` shenanigans, or indeed ...
anything other than Django. Based partially on ideas found in `phoenix_live_reload`_
and `livereload`_ but with an unnecessary amount of reinventing the wheel, because why not?

How it works
------------

A number of monkeypatches are applied, for things like `static files serving`_ and `templates`_
to track the files loaded and continually monitor them by means of a `SSE`_ connection.
When one of the tracked files is changed, the `SSE`_ connection notifies some `TypeScript`_
(compiled to ES5) on the client, which attempts to replace the affected file automatically.

Where possible, the replacement is done without *reloading* the page, which is the magic
from `phoenix_live_reload`_ and `livereload`_ I wanted to emulate. This mostly works
for CSS files and images (including responsive ones using ``<picture>`` or ``srcset="..."``
but also attempts to do so for idempotent JS, and for HTML templates themselves.

It additionally forces requests going through `static files serving`_ to never be cached,
so you don't need to remember to have your devtools open (though who doesn't) and have
ticked *that* tickbox in the network panel.

Why though?
-----------

Why not just use ``webpack`` or ``browsersync`` or whatever the cool people are using
these days? Partially because I wanted to see if I could, and partially because I'm probably
the last person on Earth still using `Django`_ and server side templates for a lot of things,
rather than a separate SPA frontend in React/Svelte et al.

It turns out it is somewhat workable, and I think might actually serve me well enough for
small solo gigs. In production, I'll probably still be using something fancier for building,
even if that's just `django-pipeline`_ with `rcssmin`_ and `rjsmin`_, and none of this work
should have any affect on that.

Perhaps you too are clamouring for the simple life. If it works well, maybe this'll help?

Installation
------------

At the moment, you'll just have to pip install the `GitHub repository`_ until I put it on
PyPI. I think the syntax for that is::

    pip install git+https://github.com/kezabelle/django-livereloadish.git@main#egg=django-livereloadish

To actually set it up, edit your `Django`_ settings to:

- add *either* ``livereloadish`` or ``livereloadish.apps.LiveReloadishConfig`` to your ``INSTALLED_APPS``
- add ``livereloadish.middleware.LivereloadishMiddleware`` to your ``MIDDLEWARE``

In theory, that's it. Assuming you're using standard things like class based views, and
``django.contrib.staticfiles`` everything should hopefully just work.

For any requests you make which return an HTML response, you should have some JavaScript
injected into the end to set the `SSE`_ watcher up, and then you should be free to change
your CSS/HTML/Images etc as you like.

Logging
-------

If you make sure your ``LOGGING`` contains something like::

    LOGGING={
        ...
        "loggers": {
            ...
            "livereloadish": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
            ...
        },
        ...
    }

that is, you have ``livereloadish`` key with a level, echoing to your console, you'll
get informational messages about the server part. I recommend using ``INFO`` as the level,
(rather than ``DEBUG`` which is spammy) which will give you ``runserver`` output like::

    [8c88030f] Livereloadish SSE client connected at XXXXXX.XXX, starting

when things have gone well. When a file is changed you should see something like::

    [8c88030f] Livereloadish change detected in /static/css/base.css

at which point the client side JS should attempt to resolve & refresh that automatically.
When you close the tab, or do a full page refresh/navigate to another page, you'll see::

    [8c88030f] Livereloadish client disconnected after XXXXXX.XXX, cancelling

to indicate the request finally closed.

Regardless of your ``LOGGING`` config, the client-side JS outputs a bunch of information
to your browser's devtools console at the **debug** level, if you want to check on it.

Content-Security-Policy
-----------------------

If you're using something like `django-csp`_ you should still be OK. I've been using the
following configuration without issue so far::

    CSP_DEFAULT_SRC = ("'self'",)
    CSP_IMG_SRC = ("'self'",)
    CSP_STYLE_SRC = ("'self'",)
    CSP_SCRIPT_SRC = ("'self'",)
    CSP_CONNECT_SRC = ("'self'",)

most of which is probably redundant and fall back to the default src anyway.

Marking files as reloadable, or not
-----------------------------------

CSS and JS files will only be considered if they do **not** have one of the following HTML attributes:

- ``<link|script data-no-reload>``
- ``<link|script up-keep>``

If a CSS file does not have one of those attributes, it will be transparently reloaded, **without** a full page refresh.

JS files will also not be considered if they have:

- ``<script data-turbolinks-eval="false"></script>``

By default, the JS reload strategy is to **do** a full page refresh because JS often has state
or setup/teardown for eventhandlers etc. To allow a script to be reloaded in-place **without**
a full page refresh, you may mark it as either:

- ``<script data-reloadable></script>``
- ``<script data-reloadable="true"></script>``

which will tell the reloader it is either idempotent, or will sort out any unbinding/rebinding
when it's loaded.

Images are **always** reloaded in-place currently. HTML is reloaded in-place if it's not a
*root* template **and** I can detect you're using something like unpoly or turbolinks. Otherwise
it'll be a full page refresh currently.

Always reloading certain file types, regardless
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

It is possible to **always** do a full page refesh, regardless of any of the data
attributes above or hooks I've put in place, by adding the following meta tags as appropriate:

- ``<meta name="livereloadish-page-strategy" content="reload">`` will make all **HTML** changes do a full refresh;
- ``<meta name="livereloadish-css-strategy" content="reload">`` will make all **CSS** changes do a full refresh rather than the default in-place replacement;
- ``<meta name="livereloadish-js-strategy" content="reload">`` will make all **JS** changes do full refresh, ignoring any of the ``data-reloadable`` declarations etc;
- ``<meta name="livereloadish-image-strategy" content="reload">`` will make all **image** changes do a full refresh rather than the default in-place replacements

These take absolute precedence over any defaults, or attributes defined on any relevant elements.
These meta tags are the first thing checked when a file is changed, and everything else is subsequently ignored if they're found (ie: it's a short-circuit operation).

Caching & Middleware
^^^^^^^^^^^^^^^^^^^^

When `LivereloadishMiddleware` is enabled and injects itself into the HTML response, it will
prevent those responses from being cached by `django.middleware.cache.UpdateCacheMiddleware`
to avoid issues around middleware ordering, and potential injection of the HTML bits into
cached content which itself already included those same injected bits. As it won't be
enabled in production, this is fine.

If for whatever reason the frontend JavaScript detects there are multiple occurances
in the HTML response, it will prevent itself from continuing and output an error to the
devtools console.

Status
------

Exceptionally alpha. It seems to work, but I've only just begun exercising it properly.
It will only run if ``settings.DEBUG = True`` and *only* via runserver. It does correctly
cancel the `SSE`_ requests when your close the tab though, which isn't exactly straight
forward in WSGI at the best of times.

If you want to help me improve it, do give it a spin and yell at me when things don't work.

It'll never support Internet Explorer, but I've given it a quick once over in
Chrome, FireFox and Safari to ensure everything roughly works.

Performance
-----------

It doesn't seem *too* bad. It checks the files every half a second, and only those it has
*seen*, rather than the whole asset folders. It'll throttle itself further if it takes
too long to re-scan the files.

It's fast enough so far that by the time I've alt-tab'd back to the browser, my ``SCSS``
or `TypeScript`_ have finished being compiled by my IDE already. Not the highest bar, but hey.

Additionally I've tried to make it behave well when it isn't your browser's active tab,
queuing the replacements up until you come back to it.

One minor note is that multiple tabs/browsers/devices connecting and listening each have
their own `SSE`_ request, so files *can* end up being checked more frequently than every
half second or so. I *could* probably change that, but I don't really want to start messing
with an additional daemon thread etc. It doesn't seem particularly problematic yet.

Tests
-----

Hahaha-haha-hah-ha. No, there are no tests. I'm not even sure where to begin
testing some of the bits of this, so it's been entirely log-and-eyeballing-driven-development.

Cards on the table, I'm not likely to write any tests for it either. Perhaps if I find
bugs which are easily tested, at best.

The license
-----------

It's  `FreeBSD`_. There's should be a ``LICENSE`` file in the root of the repository, and in any archives.

.. _Django: https://docs.djangoproject.com/en/dev/
.. _phoenix_live_reload: https://github.com/phoenixframework/phoenix_live_reload
.. _livereload: https://github.com/livereload
.. _static files serving: https://docs.djangoproject.com/en/dev/ref/contrib/staticfiles/
.. _templates: https://docs.djangoproject.com/en/dev/topics/templates/
.. _SSE: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
.. _TypeScript: https://www.typescriptlang.org/
.. _django-pipeline: https://django-pipeline.readthedocs.io/en/latest/
.. _rcssmin: https://pypi.org/project/rcssmin/
.. _rjsmin: https://pypi.org/project/rjsmin/
.. _GitHub repository: https://github.com/kezabelle/django-livereloadish
.. _django-csp: https://django-csp.readthedocs.io/en/latest/
.. _FreeBSD: http://en.wikipedia.org/wiki/BSD_licenses#2-clause_license_.28.22Simplified_BSD_License.22_or_.22FreeBSD_License.22.29
