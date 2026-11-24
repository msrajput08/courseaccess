# Google Tag Manager
Container GTM-TDLVR6PD. Basic opt-in consent; no noscript pixel, no advertising consent, no tags on checker, workspace, account or checkout. Public routes use full document navigation so tags are not retained in private views. Analytics preferences are available at the bottom of the site. Campaign links may include standard UTM parameters with simple values (never personal information).
## In GTM
Create or connect a GA4 web stream (G- measurement ID), create a Google tag using that ID, trigger on Initialization/All Pages, and publish. Keep Google Signals, advertising features, automatic form interactions, user-provided data, custom HTML and sensitive URL capture disabled. This container must be administered only by trusted owners; a same-origin third-party script is executable code, not a sandbox. Optionally map custom events courseaccess_plan_selected (plan parameter: pro/institution) and courseaccess_free_checker_selected to GA4 events. Link click events immediately before navigation are best-effort. Do not count plan clicks as purchases; actual purchase events require a separate verified server-side integration. Check Tag Assistant / GA4 Realtime after opting in. CI intercepts the container request to avoid recording synthetic visits. No GA4 property access or verification is implied by installing this snippet.

## Cookie-free aggregate traffic (default, no banner)
The production Worker writes successful page navigation counts into Cloudflare Workers Analytics Engine dataset `courseaccess_traffic`. No browser analytics consent is needed to count these non-identifying requests at the server; optional Google tags remain separately opt-in through a footer link. Counts include repeats and potentially bots, not unique visitors or purchase conversions. Cloudflare's free plan includes daily usage allowances; do not upgrade or buy extra capacity without owner approval.
For custom reporting use the authenticated Cloudflare Analytics Engine SQL API (Account Analytics Read token). Never expose the token to the website. Example:
```sql
SELECT blob1 AS page, blob2 AS country, blob3 AS source, SUM(_sample_interval * double1) AS page_requests
FROM courseaccess_traffic WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY page,country,source ORDER BY page_requests DESC LIMIT 100
```
The basic Worker dashboard also provides request totals, including non-page/API traffic. Dataset writes are fail-open and do not affect page delivery.
