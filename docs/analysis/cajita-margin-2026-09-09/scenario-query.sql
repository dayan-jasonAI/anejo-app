-- standard_inputs(food, packaging) is populated from cost-query.sql's independently
-- calculated Ingredients and Packaging rows. All other scenario inputs are assumptions.
WITH cases(scenario,multiplier,minutes,hourly,pack_adjust,waste_rate,utilities) AS (VALUES
 ('Efficient',.9,8,22,-.25,.05,.25),
 ('Planning',1.0,12,24,0.0,.07,.35),
 ('Higher cost',1.3,16,28,.50,.10,.50)
), products(product,price,extra_minutes,extra_pack) AS (VALUES
 ('Standard',17.50,0,0.0),('Printed',19.50,2,.35)
), computed AS (
 SELECT scenario,product,price,
 food*multiplier*(1+waste_rate)+packaging+pack_adjust+extra_pack+
 (minutes+extra_minutes)/60.0*hourly+utilities+price*.029+.30/25 cost
 FROM standard_inputs CROSS JOIN cases CROSS JOIN products
)
SELECT scenario,product,price,cost,price-cost contribution,(price-cost)/price margin
FROM computed;
