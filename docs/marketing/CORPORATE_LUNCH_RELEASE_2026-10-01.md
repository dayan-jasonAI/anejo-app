# Corporate lunch ordering — October 1, 2026

Authority: Dayan direct-session instructions: any lunch other than featured meal requires24hours, minimum20each, fullupfrontpayment. Subsequent confirmation keeps onlinecap50, largerordersbyquote. Existing authorization permitsrelease afterchecks. No credential/payment-settings changes, charges or customercommunications authorized.

Implementation: separate Office & team lunches category with allfour validated daily-lunch products; mixed selections; min20perselectedmeal, max50total; free delivery tooneaddress. Corporate inquiry remains forlargerorders. Deliverydates fromexistingoperatingweekdays/closures over14dayhorizon; unscheduledfeatured-dates permissible forcorporate, explicitdisabled/soldoutdates blocked. 24h beforeearliestEastern lunchwindowstart, DSTaware. Ordinarydailyfeaturedflow unchanged. Corporateprices revalidated1000cents each, fullSquareorder (notdeposit), accurate per-product kitchen snapshots andpaymentdeadline.

Paymentguard: signedSquarewebhook checks corporate orderfullUSDprincipal andzerobalance usingtrustedSquareGET; no food/rewards/notifications frompartialorunverifiedpayment. Providerfailure/stalefullpaymentmodel returns503retry. Latecapturedpayment stayspending withcriticalowneralert, forfulfilment/refundreview; timelycapture replaylateaccepted usingprovider timestamp. Optionaltipseparate. Actualpayment/refund neverperformedhere.

Localvalidation:3413rootpassed, lint0errors/11existingwarnings, Functionscompiled. Actualserver/mockSquare tests cover min20, mixed20+20,24hboundary/DST, closures, dates, metadatarevalidation, full42800principal/optionaltip, partialpayment, providererrors, deadlineexpiry andreplay. VMtests executefrontend/cart andactualcheckout payload: corporateflag,distinctproducts, uncheckedconsents,no deposit. Supportedbrowser mixed20rice+20quesadillas shows400subtotal/free delivery/28estimatedtax/428total. Phone390px nooverflow. Allfour productlinkspreselect20 andmatchdateavailability.

No newmigrationrequired; existingorders.itemsJSON preservescorporateidentityanddeadline. Existingpendingpaidkitchenpipelineused. Remaining unrelateddeliverymileageprices/radius/cityZIP notconfigured.

Release andliveevidence appendedafterdeployment. Claimlimits: local/mocktests don'tprove actualpayment orrevenue; livepaymenthandoffverified separately ifrecordedbelow.
