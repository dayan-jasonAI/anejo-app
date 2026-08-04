# Campaign 01 — Launch list (the Founding Hundred)

**Segment:** `launch_list` · **Channel:** email · **Format:** text · **Status when staged:** draft

These people asked to hear from you when you opened. It is the warmest and least ambiguous
consent the business has. This is the first thing to send.

**Do not paste an unsubscribe line or an address into the body** — the desk appends both, and
there is no code path that sends marketing mail without them.

---

## Subject

```
We're open.
```

Alternates, if that reads too bare: `The wait is over — Añejo is open` · `You asked us to tell you when we opened`

## Body — paste everything between the rules

---

You told us to tell you when we opened.

We're open. Añejo Catering Co. is licensed, the kitchen is running, and bowls are going out across Palm Beach County.

Seven bowls. 16 oz, house-made signature sauce on the side so you control the moment, built to 40% protein / 30% carbs / 30% fat. Three days in the fridge, microwave and cold friendly.

Your Founding Member benefit is already on your account — 2x rewards points, for life. It applies by itself when you're signed in. Nothing to type, nothing to remember.

And because you waited from the beginning: FUEL48 takes 10% off your order for the next 48 hours.

Order: https://anejocateringco.com/order
See the seven bowls: https://anejocateringco.com/menu

Thank you for waiting on us. Clean Fuel. Bold Flavor. Built for Life.

— The Añejo team

· · ·

Nos pediste que te avisáramos cuando abriéramos.

Ya estamos abiertos. Añejo Catering Co. tiene su licencia, la cocina está funcionando, y los bowls están saliendo por todo el condado de Palm Beach.

Siete bowls. 16 oz, con salsa artesanal aparte para que tú controles el momento, formulados a 40% proteína / 30% carbohidratos / 30% grasa. Tres días en el refrigerador, buenos fríos o calientes.

Tu beneficio de Miembro Fundador ya está en tu cuenta — 2x puntos de recompensa, de por vida. Se aplica solo cuando inicias sesión. No hay nada que escribir.

Y porque nos esperaste desde el principio: FUEL48 te da 10% de descuento durante las próximas 48 horas.

Ordenar: https://anejocateringco.com/order
Ver los siete bowls: https://anejocateringco.com/menu

Gracias por esperarnos. Clean Fuel. Bold Flavor. Built for Life.

— El equipo de Añejo

---

## Notes on the copy

- **One bilingual email, not two campaigns.** The segments have no language dimension, so sending
  an EN campaign and an ES campaign to the same segment would double-send to everyone. EN first,
  ES below the divider, one send.
- **No merge tokens.** Text-format campaigns are not run through `renderTemplate` — a
  `{{first_name}}` here would ship as literal braces to the whole list.
- **The founding benefit is described as points, not a discount,** because that is what
  `promo_codes.kind='customer'` actually grants (`points_mult`, no `pct_off`, no expiry), and it
  auto-applies for signed-in members via `autoCustomerCodeFor`. Promising a percentage here would
  be a promise checkout does not keep.
- **FUEL48 is the separate campaign code** minted in step 1 of the runbook. If you change the code
  string or the percentage when you mint it, change it in this body too — nothing links them
  automatically.
