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
your CSS/HTML/Images etc as you like. If you see a line like the following your ``runserver`` output::

    [8c88030f] Livereloadish SSE client connected, starting

then things have gone well. When a file is changed you should see something like::

    [8c88030f] Livereloadish change detected in /static/css/base.css

at which point the client side JS should attempt to resolve & refresh that automatically.
When you close the tab, or do a full page refresh/navigate to another page, you'll see::

    [8c88030f] Livereloadish client disappeared, cancelling

to indicate the request finally closed.

It outputs a bunch of information to your browser's devtools console at the **debug** level, if you
want to check on it. It also outputs a bunch of logging to your python logs, if you add
``livereloadish`` to your ``LOGGING['loggers']`` again with a level of **debug**.

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
