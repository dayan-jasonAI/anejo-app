# Corporate lunch ordering — October 1, 2026

Authority: Dayan direct-session instructions: any lunch other than featured meal requires24hours, minimum20each, fullupfrontpayment. Subsequent confirmation keeps onlinecap50, largerordersbyquote. Existing authorization permitsrelease afterchecks. No credential/payment-settings changes, charges or customercommunications authorized.

Implementation: separate Office & team lunches category with allfour validated daily-lunch products; mixed selections; min20perselectedmeal, max50total; free delivery tooneaddress. Corporate inquiry remains forlargerorders. Deliverydates fromexistingoperatingweekdays/closures over14dayhorizon; unscheduledfeatured-dates permissible forcorporate, explicitdisabled/soldoutdates blocked. 24h beforeearliestEastern lunchwindowstart, DSTaware. Ordinarydailyfeaturedflow unchanged. Corporateprices revalidated1000cents each, fullSquareorder (notdeposit), accurate per-product kitchen snapshots andpaymentdeadline.

Paymentguard: signedSquarewebhook checks corporate orderfullUSDprincipal andzerobalance usingtrustedSquareGET; no food/rewards/notifications frompartialorunverifiedpayment. Providerfailure/stalefullpaymentmodel returns503retry. Latecapturedpayment stayspending withcriticalowneralert, forfulfilment/refundreview; timelycapture replaylateaccepted usingprovider timestamp. Optionaltipseparate. Actualpayment/refund neverperformedhere.

Localvalidation:3413rootpassed, lint0errors/11existingwarnings, Functionscompiled. Actualserver/mockSquare tests cover min20, mixed20+20,24hboundary/DST, closures, dates, metadatarevalidation, full42800principal/optionaltip, partialpayment, providererrors, deadlineexpiry andreplay. VMtests executefrontend/cart andactualcheckout payload: corporateflag,distinctproducts, uncheckedconsents,no deposit. Supportedbrowser mixed20rice+20quesadillas shows400subtotal/free delivery/28estimatedtax/428total. Phone390px nooverflow. Allfour productlinkspreselect20 andmatchdateavailability.

No newmigrationrequired; existingorders.itemsJSON preservescorporateidentityanddeadline. Existingpendingpaidkitchenpipelineused. Remaining unrelateddeliverymileageprices/radius/cityZIP notconfigured.

Release andliveevidence appendedafterdeployment. Claimlimits: local/mocktests don'tprove actualpayment orrevenue; livepaymenthandoffverified separately ifrecordedbelow.


## Release and live acceptance — October 1, 2026, approximately 06:10 UTC

PR [179](https://github.com/dayan-jasonAI/anejo-app/pull/179) merged as `ed788112f8ffb1ec757afd8ca376db9e9c7f1167`. All three checks passed for head `1602deb281e12c3834b9b43bfcea5d33f11db520`: Functions test/auth + lint, Studio lint/test/build, and Cloudflare preview. CI run: `36822959618`.

Wrangler's deployment list reports Production/main source `ed78811` active at deployment `d1f71239-4c2b-42ad-80ab-c13519575e19`. Supported browser acceptance at https://anejocateringco.com/order?category=corporate showed all four meals, 24-hour notice, minimum 20 each, maximum 50 online, and a larger-order quote link.

The live guest flow selected 20 fried rice plus 20 quesadillas for October 2, 2026. Cart: $400 subtotal, $0 delivery, $28 tax, $428 estimated principal. The normal checkout reached Square, which displayed both separate 20-meal lines and the same subtotal/tax. Square initially selected a 15% optional tip ($64.20), displaying $492.20. The Other/zero-tip Apply action was attempted; the captured snapshot was still updating, so final zero-tip total is **Unverified** in this specific run. Payment-card and Google Pay controls were visible; neither was used. No charge was made, and paid fulfillment was not exercised live. Full-payment/deadline behavior is supported by local mocked-provider tests, not a real paid transaction.

QA-only order `ord_8ba630dc5011c9d57121` was canceled immediately after observing the payment screen. A narrowly scoped D1 update changed one pending QA record; readback confirmed canceled status, correct individual kitchen item snapshots and payment deadline, $400/$0/$428 totals, null email/phone, SMS consent off, and no recovery send timestamp. No customer order was modified. The browser returned to the normal corporate menu. The private Square link was not distributed or revoked.

Evidence: `docs/evidence/corporate-lunch-2026-10-01/live-square-summary.txt` preserves the observed payment-screen excerpt, including its transient tip update. Existing tests-summary.txt records local validation and log paths.

No additional approval is needed for this released feature. Remaining separate information blocker: distance-based delivery bands, fees, maximum radius, and exact city/ZIP for the approved mailing-address pricing origin. The broader marketing readiness goal remains unfinished; this release does not establish revenue uplift.
