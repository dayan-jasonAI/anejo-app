# Owner inputs — inventory readiness, October 4, 2026

The inventory feature release is authorized by direct-session instructions and existing deployment approval. No second deployment approval is requested. Engineering continues through release verification while these operating facts remain unset.

| Item | Input needed | Safe behavior until supplied |
|---|---|---|
| Physical stock | Current count and grams/unit for ingredients, packaging and finished meals; optional recorded expiry | Historical rows without fresh physical counts cannot authorize prep |
| Recipe map | Published recipe and exact ingredient plus packaging amount per finished item | No fuzzy inference from item names or pictures |
| Production targets | Finished-stock target, minimum/maximum batch, freshness window and cook assignment | No invented target, recurring plan OFF |
| Task approval mode | Approve one batch at a time or enable reviewed recurring plans | One-off owner approval available; no automatic enablement |
| Menu relisting | Review availability and any currently unlisted item; optionally allow active item's relisting after recorded completion | Ingredients never become an available product on their own |
| Phone notifications | Confirm receipt during next real update | Provider sent status remains separate from device delivery; three owner subscriptions were observed read-only |

These operating facts remain `Needs Dayan confirmation`. Prototype acceptance now includes an actual-route browser sandbox and migrated SQLite tests; this does not establish physical production or paid-order growth. The broader marketing goal and its existing channel/voice/delivery input queue remain open.
