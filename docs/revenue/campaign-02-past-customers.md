# Campaign 02 — Past customers → the weekly plan

**Segment:** `past_customers` · **Channel:** email · **Format:** text · **Status when staged:** draft

Everyone with a paid order. Existing business relationship, which is the lawful basis under
CAN-SPAM — and the appended footer is what keeps it lawful.

**Send this a few hours after Campaign 01, or tomorrow.** `launch_list` and `past_customers`
overlap; back-to-back sends to overlapping audiences is how a warm list gets tired.

The ask here is deliberately **not** another one-off order. It is the weekly plan. One conversion
to `/subscribe` recurs every week after today; one more bowl order does not.

---

## Subject

```
Your bowls, every week — without the reorder
```

Alternates: `Stop reordering. Set it once.` · `The weekly plan, if you want it`

## Body — paste everything between the rules

---

You've ordered from us. Thank you — genuinely, that's the whole thing.

So here's what we built for the people who keep coming back: a weekly plan. You set your numbers once, we deliver on your schedule, and you stop thinking about food.

Build your plan: https://anejocateringco.com/subscribe
Not sure what your numbers are? The calculator does it free, in about a minute: https://anejocateringco.com/calculator

If you'd rather keep ordering one at a time, that's good too — FUEL48 takes 10% off for the next 48 hours, and the add-ons are here: https://anejocateringco.com/add-ons

Either way, thank you for eating with us.

— The Añejo team

· · ·

Ya has ordenado con nosotros. Gracias — de verdad, eso lo es todo.

Por eso creamos algo para los que vuelven: el plan semanal. Ajustas tus números una sola vez, nosotros entregamos según tu horario, y dejas de pensar en la comida.

Arma tu plan: https://anejocateringco.com/subscribe
¿No sabes cuáles son tus números? La calculadora lo hace gratis, en un minuto: https://anejocateringco.com/calculator

Y si prefieres seguir ordenando bowl por bowl, también está bien — FUEL48 te da 10% de descuento durante las próximas 48 horas, y los complementos están aquí: https://anejocateringco.com/add-ons

De cualquier forma, gracias por comer con nosotros.

— El equipo de Añejo

---

## Notes on the copy

- **"For the next 48 hours" rather than a date.** The code's expiry is set as `expires_days` from
  the moment it is minted, so a relative phrase stays true whenever the send actually goes out. A
  hardcoded date goes stale the moment the send slips a day.
- Same constraints as Campaign 01: no merge tokens, no hand-written unsubscribe or address, one
  bilingual body rather than two sends.
