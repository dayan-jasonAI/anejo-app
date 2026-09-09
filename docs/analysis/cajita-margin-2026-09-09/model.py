"""Planning scenarios, not actual production costs. All amounts USD; no live writes."""
import json

# Observed online retail benchmark prices; not location-confirmed supplier quotes.
RATES = {
    'roll_each': 4.99 / 12, 'ham_oz': 4.47 / 16,
    'guava_oz': 1.99 / 14, 'cheddar_oz': 1.97 / 8,
    'pasta_dry_oz': 1.24 / 16, 'flour_oz': 2.38 / 80,
    'oil_fl_oz': 3.82 / 48, 'grape_oz': 4.97 / 32,
    'condensed_can': 2.47, 'cream_fl_oz': 2.96 / 16,
    'egg_each': 3.87 / 12, 'sugar_oz': 3.39 / 64,
    # Explicit assumptions, NOT retrieved quotes:
    'cream_cheese_oz': 2 / 8, 'milk_fl_oz': 4 / 128,
    'breadcrumb_oz': 2 / 15, 'pineapple_edible_oz': 3 / 24,
}

# Costing proxies only. Do not replace kitchen recipes with these quantities.
# Exact spread/croqueta/empanada recipes and yields have not been supplied.
food = {
    'Hawaiian roll + ham spread': RATES['roll_each'] + .65 * RATES['ham_oz']
        + .15 * RATES['cream_cheese_oz'] + .1 * RATES['oil_fl_oz'] + .03,
    'Guava-cheese empanada (1.25 oz target)': .5 * RATES['flour_oz']
        + .3 * RATES['guava_oz'] + .25 * RATES['cream_cheese_oz'] + .10,
    'Ham croqueta (1.20 oz fried target; no butter)': .5 * RATES['ham_oz']
        + .12 * RATES['flour_oz'] + .45 * RATES['milk_fl_oz']
        + .15 * RATES['breadcrumb_oz'] + .10,
    'One five-ingredient skewer': .3 * RATES['grape_oz'] + .6 * RATES['ham_oz']
        + .35 * RATES['cheddar_oz'] + .3 * RATES['guava_oz'] + .45 * RATES['pineapple_edible_oz'],
}
# Owner's salad ingredient list, with all unspecified amounts/yields assumed.
# One pound dry pasta, one pineapple, two apples, four eggs (incl mayo), two potatoes.
salad_batch = {
    'dry pasta 16 oz': 16 * RATES['pasta_dry_oz'],
    'one pineapple': 3.00, 'onion allowance': .50, 'olives allowance': .75,
    'two apples allowance': 1.50, 'cheese 4 oz assumed': 4 * RATES['cheddar_oz'],
    'ham 6 oz assumed': 6 * RATES['ham_oz'], 'one tuna can allowance': 1.00,
    'tomato puree allowance': .15, 'four eggs': 4 * RATES['egg_each'],
    'two potatoes allowance': .75, 'oil 8 fl oz assumed for mayo': 8 * RATES['oil_fl_oz'],
    'sugar 2 oz assumed': 2 * RATES['sugar_oz'],
    'garlic vinegar salt allowance': .30,
}
# Assumed finished salad yield: 120 oz = twenty 6 oz portions; NOT measured.
food['Cold salad (6 oz)'] = sum(salad_batch.values()) / 20
# Dessert recipe proxy: benchmark dairy/eggs plus explicit small ingredient allowances.
# Twenty 3–4 oz cups is an assumed yield; no density conversion from fl oz to weight.
dessert_batch = {'condensed milk': RATES['condensed_can'], 'evaporated milk allowance': 1.25,
    'whole milk 8 fl oz': 8 * RATES['milk_fl_oz'], 'cream 12 fl oz': 12 * RATES['cream_fl_oz'],
    'five eggs': 5 * RATES['egg_each'], 'flour 5 oz': 5 * RATES['flour_oz'],
    'sugar 7 oz': 7 * RATES['sugar_oz'], 'vanilla cinnamon garnish allowance': .75}
food['Tres leches (3–4 oz target)'] = sum(dessert_batch.values()) / 20

known_pack = 19.99 / 25 + 2 * 8.99 / 150 + 7.99 / 200 + 8.97 / 100
# Two wet-food containers at $0.25 each, print allocation $0.40, bag/twine/cutlery $0.25:
# these are allowances, not facts inferred from the ambiguous $9.99 pack or $15 print job.
base_pack = known_pack + .50 + .40 + .25
food_sum = sum(food.values())

def calculate(price, food_multiplier=1, minutes=12, loaded_hourly=24,
              packaging=base_pack, waste=.07, utilities=.35, quantity=25):
    ingredients = food_sum * food_multiplier
    spoilage = ingredients * waste
    labor = minutes / 60 * loaded_hourly
    production = ingredients + spoilage + packaging + labor + utilities
    # Public Square API rate, not confirmed merchant contract. One transaction per batch.
    processing = price * .029 + .30 / quantity
    contribution = price - production - processing
    return dict(price=price, food=ingredients, waste=spoilage, packaging=packaging,
        labor=labor, utilities=utilities, production=production, processing=processing,
        total_variable_cost=production+processing, contribution=contribution,
        contribution_margin=contribution / price, batch_contribution=contribution*quantity,
        after_example_overhead_margin=(contribution-1.50)/price)

scenarios = []
for name, params in [
    ('Efficient batch', dict(food_multiplier=.9, minutes=8, loaded_hourly=22, packaging=base_pack-.25, waste=.05, utilities=.25)),
    ('Planning case', dict()),
    ('Higher-cost batch', dict(food_multiplier=1.3, minutes=16, loaded_hourly=28, packaging=base_pack+.50, waste=.10, utilities=.50)),
]:
    for printed in [False, True]:
        p = dict(params)
        if printed:
            p['minutes'] = p.get('minutes',12) + 2
            p['packaging'] = p.get('packaging',base_pack) + .35
        row = calculate(19.50 if printed else 17.50, **p)
        row.update(scenario=name, product='Preset printed' if printed else 'Standard')
        scenarios.append(row)

assert round(known_pack,5) == 1.04912
assert len(food) == 6 and len(scenarios) == 6
for row in scenarios:
    assert abs(row['price']-row['total_variable_cost']-row['contribution']) < 1e-10
    assert abs(row['contribution_margin'] - (1-row['total_variable_cost']/row['price'])) < 1e-10
assert abs(calculate(17.50, quantity=1)['processing']-calculate(17.50)['processing']-.288) < 1e-10

RESULT = {'food_components':food, 'salad_batch':salad_batch, 'dessert_batch':dessert_batch,
    'known_packaging':known_pack, 'base_packaging':base_pack, 'scenarios':scenarios,
    'validation':'Arithmetic assertions passed; actual margins unverified',
    'net_profit':'Unavailable: actual fixed overhead and production records missing'}
if __name__ == '__main__':
    print(json.dumps(RESULT, indent=2))
