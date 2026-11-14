-- Owner-approved 12-piece boxes at $1.50 per piece, before taxes.
-- One catalog unit is one box. Preparation and filling are separate fulfillment choices.
INSERT INTO menu_items (
  id, kind, name, name_es, price_cents, description, description_es, image,
  sort, active, availability, created_at, updated_at
)
SELECT column1, 'addon', column2, column3, 1800, column4, column5,
       'menu-launch/croquetas-box-12.webp', 5, 1, 'available',
       unixepoch() * 1000, unixepoch() * 1000
FROM (VALUES
 ('traditional_croq-box12-fry-jamon', 'Croquetas 12-pack · Ham · Ready to fry', 'Caja de 12 croquetas · Jamón · Listas para freír', 'Ready to fry. One box with 12 ham croquetas.', 'Listas para freír. Una caja con 12 croquetas de jamón.'),
 ('traditional_croq-box12-fry-pollo', 'Croquetas 12-pack · Chicken · Ready to fry', 'Caja de 12 croquetas · Pollo · Listas para freír', 'Ready to fry. One box with 12 chicken croquetas.', 'Listas para freír. Una caja con 12 croquetas de pollo.'),
 ('traditional_croq-box12-fry-res', 'Croquetas 12-pack · Beef · Ready to fry', 'Caja de 12 croquetas · Res · Listas para freír', 'Ready to fry. One box with 12 beef croquetas.', 'Listas para freír. Una caja con 12 croquetas de res.'),
 ('traditional_croq-box12-fry-chorizo', 'Croquetas 12-pack · Chorizo · Ready to fry', 'Caja de 12 croquetas · Chorizo · Listas para freír', 'Ready to fry. One box with 12 chorizo croquetas.', 'Listas para freír. Una caja con 12 croquetas de chorizo.'),
 ('traditional_croq-box12-fry-sausage', 'Croquetas 12-pack · Sausage · Ready to fry', 'Caja de 12 croquetas · Salchicha · Listas para freír', 'Ready to fry. One box with 12 sausage croquetas.', 'Listas para freír. Una caja con 12 croquetas de salchicha.'),
 ('traditional_croq-box12-fry-tuna', 'Croquetas 12-pack · Tuna · Ready to fry', 'Caja de 12 croquetas · Atún · Listas para freír', 'Ready to fry. One box with 12 tuna croquetas.', 'Listas para freír. Una caja con 12 croquetas de atún.'),
 ('traditional_croq-box12-eat-jamon', 'Croquetas 12-pack · Ham · Ready to eat', 'Caja de 12 croquetas · Jamón · Listas para comer', 'Ready to eat. One box with 12 ham croquetas.', 'Listas para comer. Una caja con 12 croquetas de jamón.'),
 ('traditional_croq-box12-eat-pollo', 'Croquetas 12-pack · Chicken · Ready to eat', 'Caja de 12 croquetas · Pollo · Listas para comer', 'Ready to eat. One box with 12 chicken croquetas.', 'Listas para comer. Una caja con 12 croquetas de pollo.'),
 ('traditional_croq-box12-eat-res', 'Croquetas 12-pack · Beef · Ready to eat', 'Caja de 12 croquetas · Res · Listas para comer', 'Ready to eat. One box with 12 beef croquetas.', 'Listas para comer. Una caja con 12 croquetas de res.'),
 ('traditional_croq-box12-eat-chorizo', 'Croquetas 12-pack · Chorizo · Ready to eat', 'Caja de 12 croquetas · Chorizo · Listas para comer', 'Ready to eat. One box with 12 chorizo croquetas.', 'Listas para comer. Una caja con 12 croquetas de chorizo.'),
 ('traditional_croq-box12-eat-sausage', 'Croquetas 12-pack · Sausage · Ready to eat', 'Caja de 12 croquetas · Salchicha · Listas para comer', 'Ready to eat. One box with 12 sausage croquetas.', 'Listas para comer. Una caja con 12 croquetas de salchicha.'),
 ('traditional_croq-box12-eat-tuna', 'Croquetas 12-pack · Tuna · Ready to eat', 'Caja de 12 croquetas · Atún · Listas para comer', 'Ready to eat. One box with 12 tuna croquetas.', 'Listas para comer. Una caja con 12 croquetas de atún.')
)
WHERE 1
ON CONFLICT(id) DO NOTHING;
