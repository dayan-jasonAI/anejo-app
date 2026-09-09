-- Independent SQLite calculation from benchmark unit rates and assumed quantities.
-- This is a scenario, not recorded production. Matches model.py.
WITH food_items(name, cost) AS (VALUES
 ('roll',4.99/12+.65*4.47/16+.15*2/8+.1*3.82/48+.03),
 ('empanada',.5*2.38/80+.3*1.99/14+.25*2/8+.10),
 ('croqueta',.5*4.47/16+.12*2.38/80+.45*4.0/128+.15*2/15+.10),
 ('skewer',.3*4.97/32+.6*4.47/16+.35*1.97/8+.3*1.99/14+.45*3/24),
 ('salad',(1.24+3+.50+.75+1.50+4*1.97/8+6*4.47/16+1+.15+4*3.87/12+.75+8*3.82/48+2*3.39/64+.30)/20),
 ('dessert',(2.47+1.25+8*4.0/128+12*2.96/16+5*3.87/12+5*2.38/80+7*3.39/64+.75)/20)
), inputs AS (
 SELECT SUM(cost) food, 19.99/25+2*8.99/150+7.99/200+8.97/100+.50+.40+.25 packaging
 FROM food_items
), components(component,cost,price) AS (
 SELECT 'Ingredients',food,17.50 FROM inputs
 UNION ALL SELECT 'Food waste',food*.07,17.50 FROM inputs
 UNION ALL SELECT 'Packaging',packaging,17.50 FROM inputs
 UNION ALL SELECT 'Direct labor',12.0/60*24,17.50
 UNION ALL SELECT 'Utilities',.35,17.50
 UNION ALL SELECT 'Card processing',17.50*.029+.30/25,17.50
)
SELECT component,cost,price FROM components;
