# Direct Google Analytics 4
Measurement ID G-CL85EKEFRL. The old GTM container is not loaded. Direct server-rendered HTML head uses gtag.js and a single config command, with advanced consent mode; default analytics and advertising storage denied. Limited cookieless signals may be sent to Google; optional analytics cookies require the visitor's choice. No tags on checker, workspace, account or checkout. Public routes use full document navigation so tags are not retained in private views. Analytics preferences are available in the footer. Use standard UTM parameters with non-personal values.

In GA4, select the web stream with the exact ID above. Check Tag Assistant and Realtime. Keep Google Signals, advertising features, user-provided data, and automatic form interactions disabled. Custom events courseaccess_plan_selected (plan: pro or institution) and courseaccess_free_checker_selected are sent directly via gtag on consented marketing pages; they are best-effort click events, not purchases. CI mocks the Google script and verifies the exact ID and config command. GA4 data reception must be confirmed in the property.

## Cookie-free aggregate traffic (default, no banner)
The production Worker writes successful page navigation counts into Cloudflare Workers Analytics Engine dataset `courseaccess_traffic`. No browser analytics consent is needed to count these non-identifying requests at the server; Google tags load on public marketing pages with default denied consent; analytics cookies remain separately opt-in through a footer link. Counts include repeats and potentially bots, not unique visitors or purchase conversions. Cloudflare's free plan includes daily usage allowances; do not upgrade or buy extra capacity without owner approval.
For custom reporting use the authenticated Cloudflare Analytics Engine SQL API (Account Analytics Read token). Never expose the token to the website. Example:
```sql
SELECT blob1 AS page, blob2 AS country, blob3 AS source, SUM(_sample_interval * double1) AS page_requests
FROM courseaccess_traffic WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY page,country,source ORDER BY page_requests DESC LIMIT 100
```
The basic Worker dashboard also provides request totals, including non-page/API traffic. Dataset writes are fail-open and do not affect page delivery.
