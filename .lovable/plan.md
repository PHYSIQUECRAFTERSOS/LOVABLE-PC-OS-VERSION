

# Definitive Fix for TestFlight White Screen

## Root Cause Analysis

After deep investigation, I identified **two critical issues** that are almost certainly causing the persistent white screen in TestFlight, even though the web app works fine in Safari:

### Issue 1: Query Parameter in `server.url` Breaks Capacitor Bridge Injection
There is a **known Capacitor bug** (GitHub issue #7517) where having a query parameter in `server.url` prevents JavaScript from being injected into the WKWebView DOM. Your current config:
```
server.url: 'https://app.physiquecrafters.com?v=11'
```
The `?v=11` cache-buster was added with good intentions, but it breaks the Capacitor bridge. The native bridge JS never loads, so the app shows a white screen. Safari works because it does not use the Capacitor bridge -- it is a normal browser.

### Issue 2: `packageClassList` is an Internal-Only Property
According to the Capacitor maintainers (GitHub issues #7409, #7699), `packageClassList` is an **internal property