# Menu corrections — 2026-09-09

Authorized by Dayan's request to correct serving-format images, remove salami bites, add dishes/fillings, and reorganize desserts and sides.

## Existing catalog
Reused the actual six separated images from this chat (empanadas, skewers, Hawaiian bocaditos, cold salad, plain croquetas, Cajitas) and the plated crispy-border pizza. Dedicated dressed-croqueta tray retained. Individual croquetas and empanadas use single-product photos. Individual cold salad is 6 oz at $5; the 10-serving cold-salad tray stays $45. Regular catering croquetas stay $40/$75 for 25/50; dressed stay $65/$125, covering cheese, greens and olive. Deactivated three salami-bite SKUs and the retail dressed croqueta; no historical records deleted.

Strawberry and chocolate tres leches have separate product families. Retail desserts offer a cup or whole cake for each flavor; catering has separate whole-cake and 12-cup listings. Selecting a format changes the image. The skewer remains the same full recipe, with quantity determining retail versus tray format. Cajitas use their four-box collection photo and quote flow, not invented instant pricing.

Added full-content illustrations for Cuban Bites, Cuban Table, Croqueta & Tamal Spread, bite snack and dessert duo. Representative package photos show included foods; piece counts and guest quantities are stated in customization. New dish images are AI-generated illustrations of proposed serving specifications, not evidence of delivered food.

## Launch pricing basis
User's earlier authorization to recommend prices/portions remains applicable; an optional clarification this turn received no response before proceeding. Prices below are proposals implemented for launch, not measured margins. Existing prices were preserved except the explicitly requested $5 cold salad. Recipes/weights for new dishes are proposed specifications, not owner-weighed production data.

Benchmarks checked 2026-09-09:
- Havana's Cuban Cuisine direct ordering: pan con lechón $12.99, chicken sandwich $14.99. https://www.toasttab.com/local/order/havanas-cuban-cuisine-8600-griffin-road/item-pan-con-lechon_814f3102-25e7-42ba-8f47-52d87996961b
- Havana 86 direct ordering: Uruguayo de res $22.61 (listed price; channel and inclusions may differ). https://www.toasttab.com/local/order/havana86/item-uruguayo-de-cerdo_d2082dd4-03ca-4048-ba47-2cd94c9f7d07
- Guarapos direct menu for Cuban plate and sandwich positioning: https://guaraposcubancuisine.us/wp-content/uploads/2025/01/Guarapos-Cuban-Cuisine.pdf

The other new prices are analogical recommendations relative to these and existing Añejo meals, not item-for-item verified competitor matches. Actual ingredient invoices, labor time and yield have not been provided. Target food cost at or below 35% is a planning guardrail only; verify recipe cost and packaging/labor before claiming ROI. No revenue or profit guarantee.

Packaging: lidded compartment meal boxes for complete plates; vented sandwich/taco containers; small lidded side cups; 4-cavity or vented boxes for stuffed tostones. Packaging cost remains an estimate until supplier quotes are available.

## Validation
Expected catalog: 140 SKUs. Server-handler test covers every SKU through mocked Square, with authoritative prices and order persistence. Browser exercised 133 non-bowl variants, all seven categories, cake/cup image switching and mobile overflow. Full suite: 1,910 passed. Lint: zero errors, two existing vendor warnings. No real checkout, charge or customer message was sent.

Targeted apply.sql and rollback.sql affect only this request's rows. Original image references and generated image mapping are recorded. No secrets or payment settings changed.

## New item prices and portions

| Item | Price | Portion |
|---|---:|---|
| Garbanzos fritos | $14.95 | 12 oz chickpeas sautéed with ham, chorizo, onion and pepper. One person. |
| Cuban fried rice | $15.95 | 16 oz fried rice with chicken, ham, egg and green onion. One person. |
| Three chicken tacos | $13.95 | 3 soft corn tacos with 6 oz total chicken, onion, cilantro and lime. |
| Three lechón tacos | $13.95 | 3 soft corn tacos with 6 oz total lechón, onion, cilantro and lime. |
| Bistec uruguayo — 8 oz congrí | $23.95 | Breaded beef steak stuffed with ham and cheese (6 oz beef), 8 oz congrí and 3 oz fresh salad. |
| Bistec uruguayo — 8 oz white rice and 4 oz black beans | $23.95 | Breaded beef steak stuffed with ham and cheese (6 oz beef), 8 oz white rice and 4 oz black beans and 3 oz fresh salad. |
| Pan con lechón | $12.95 | Cuban bread sandwich with 6 oz roast pork, sautéed onion and mojo. |
| Chicken sandwich | $13.95 | Cuban bread sandwich with 6 oz grilled chicken, lettuce, tomato and sautéed onion. |
| Chuleta encebollada | $18.95 | One pork chop with sautéed onion, 8 oz congrí and 3 oz fresh salad. |
| Potato & tuna lasagna | $15.95 | 12 oz portion of layered potato and tuna in tomato sauce with a golden cheese topping. |
| Enchilado de pollo | $17.95 | 6 oz chicken in tomato-pepper sauce, 8 oz white rice, 4 oz black beans and 4 oz maduros. |
| Tostones rellenos — Ham & cheese | $11.95 | 4 crispy plantain cups with ham & cheese; approximately 4 oz filling total. |
| Tostones rellenos — Shrimp | $15.95 | 4 crispy plantain cups with shrimp; approximately 4 oz filling total. |
| Tostones rellenos — Lechón | $12.95 | 4 crispy plantain cups with lechón; approximately 4 oz filling total. |
| White rice | $4.00 | 8 oz cooked white rice. Side for one person. |
| Garbanzos fritos — side | $6.50 | 6 oz chickpeas sautéed with ham, chorizo, onion and pepper. Side for one. |

## Production verification
Production deployment f17cec38-4e90-43a7-8eb4-c8d148e589c7, source a0b00b3, verified through authenticated Wrangler listing. Live D1 menu returned 140 SKUs and matched every expected price and image; no salami-bite SKU remains active. The environment-variable postdeploy verifier skipped; authenticated deployment inspection and live catalog checks provided independent evidence. No approval is pending. Next: validate new recipe yields and ingredient/labor costs against the proposed portions and prices.
