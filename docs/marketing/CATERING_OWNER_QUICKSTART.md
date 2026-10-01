# Run an event from the Añejo Hub

Owner delivery/pickup was deployed in PR152 (65b0d0f). Authenticated live acceptance is still pending. Staff-driver instructions below describe a separate local candidate, not a live capability.

## Before the event

Open **Kitchen → More → Events**, or **Owner → Catering & events** and open the quote's production plan. A paid quote supplies the menu and guest count. Verify the serving time, address, allergies, quantities, recipes and balance. The purchase and packaging lists are planning aids: a draft recipe is not an approved recipe, and estimated preparation minutes are not measured kitchen times.

At **Event progress**, choose **I am delivering** or **Customer pickup**. Enter actual travel/setup minutes (travel0 for pickup). Confirm that you reviewed handling for every dish, then confirm the plan. The timeline recalculates in Eastern time. Individual temperature readings and carrier details are not recorded by this confirmation.

## During service

1. Select **Start preparation**. Use the separate planning checklist for shopping, cooking and packing work.
2. Verify the food, quantities and all packaging. Check the confirmation, then select **Mark packed and ready**.
3. For your own delivery, select **Record departure**, then **Record arrival** at the appropriate moments.
4. Select **Complete delivery**, or **Confirm pickup completed** for pickup. Completion requires the balance already recorded as paid/waived, or a zero balance. These controls do not charge or settle a payment.

The saved history records who changed progress and when. Checking a planning task does not move the event through these stages.

## Corrections and interrupted connections

If details change after packing or departure, use **Reopen preparation** with a reason. Reconfirm the corrected plan, handling and packing before continuing. The history remains; earlier steps are not erased. Past/completed events cannot be rewritten into a fabricated live service history.

If the screen says the save outcome is unconfirmed, choose **Resolve previous save**. It retries the same request rather than recording another step. If signed out, sign in again. A failure to refresh the planner after a confirmed save means old timing must not be relied on until reloaded.

## What remains manual

This flow does not notify customers, offer a job to a staff driver, or create an ordinary order/route. Those integrations require a separate catering adapter. Notify people through your approved operational process until that integration is released and authorized. Do not interpret “Packed and ready” as proof that anyone received a notification.

## Staff-driver workflow — local candidate, not yet live

After its separate release, choose **Staff driver** in Event progress and confirm the plan. Select the driver in **Catering driver → Assign in Hub**. In the driver Hub, open **Catering**, choose the event date and open the assignment. The driver accepts, checks each package after the kitchen marks ready, records departure/arrival, and confirms handoff. A driver can decline before accepting. The owner can release an assignment before departure with a reason.

No alert is sent by this candidate. Until notifications are separately implemented and authorized, coordinate through your existing process. It does not calculate catering driver pay or create ordinary meal-delivery routes.
