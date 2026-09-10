-- Añejo menu, ratified by Dayan on 2026-09-09.
-- GENERATED — do not hand-edit. Source: scripts/menu-2026-09/prices.mjs
--   node scripts/menu-2026-09/generate.mjs
--
-- Every tray ladder in the source is machine-checked to fall: a tray priced above a smaller one
-- per piece never sells, because the quote engine always takes the cheapest exact combination.
--
-- Retirement is active=0, never DELETE. Past orders reference these ids and must stay readable.

INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_croq-jamon','addon','Ham croqueta','Croqueta de jamón',150,'menu-launch/croqueta-single.webp',100,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_croq-jamon','traditional_croq-jamon','price_cents',NULL,150,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_croq-jamon-10','addon','Ham croqueta — 10 pieces (box — no sauce)','Croqueta de jamón — 10 unidades',1000,'menu-launch/croqueta-single.webp',101,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_croq-jamon-10','catering_croq-jamon-10','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_croq-pollo','addon','Chicken croqueta','Croqueta de pollo',150,'menu-launch/food-croq-pollo.webp',102,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_croq-pollo','traditional_croq-pollo','price_cents',NULL,150,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_croq-pollo-10','addon','Chicken croqueta — 10 pieces (box — no sauce)','Croqueta de pollo — 10 unidades',1000,'menu-launch/food-croq-pollo.webp',103,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_croq-pollo-10','catering_croq-pollo-10','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_croq-res','addon','Beef croqueta','Croqueta de res',150,'menu-launch/food-croq-res.webp',104,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_croq-res','traditional_croq-res','price_cents',NULL,150,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_croq-res-10','addon','Beef croqueta — 10 pieces (box — no sauce)','Croqueta de res — 10 unidades',1000,'menu-launch/food-croq-res.webp',105,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_croq-res-10','catering_croq-res-10','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_croq-chorizo','addon','Chorizo croqueta','Croqueta de chorizo',150,'menu-launch/croqueta-single.webp',106,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_croq-chorizo','traditional_croq-chorizo','price_cents',NULL,150,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_croq-chorizo-10','addon','Chorizo croqueta — 10 pieces (box — no sauce)','Croqueta de chorizo — 10 unidades',1000,'menu-launch/croqueta-single.webp',107,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_croq-chorizo-10','catering_croq-chorizo-10','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_croq-sausage','addon','Sausage croqueta','Croqueta de salchicha',150,'menu-launch/croqueta-single.webp',108,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_croq-sausage','traditional_croq-sausage','price_cents',NULL,150,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_croq-sausage-10','addon','Sausage croqueta — 10 pieces (box — no sauce)','Croqueta de salchicha — 10 unidades',1000,'menu-launch/croqueta-single.webp',109,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_croq-sausage-10','catering_croq-sausage-10','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_croq-tuna','addon','Tuna croqueta','Croqueta de atún',150,'menu-launch/croqueta-single.webp',110,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_croq-tuna','traditional_croq-tuna','price_cents',NULL,150,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_croq-tuna-10','addon','Tuna croqueta — 10 pieces (box — no sauce)','Croqueta de atún — 10 unidades',1000,'menu-launch/croqueta-single.webp',111,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_croq-tuna-10','catering_croq-tuna-10','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-jamon-30','addon','Ham croqueta platter — 30 pieces (plated with sauces)','Bandeja de croquetas de jamón — 30 unidades',3500,'menu-launch/tray-croquetas.webp',112,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-jamon-30','catering_platter-jamon-30','price_cents',NULL,3500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-jamon-60','addon','Ham croqueta platter — 60 pieces (plated with sauces)','Bandeja de croquetas de jamón — 60 unidades',7000,'menu-launch/tray-croquetas.webp',113,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-jamon-60','catering_platter-jamon-60','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-jamon-90','addon','Ham croqueta platter — 90 pieces (plated with sauces)','Bandeja de croquetas de jamón — 90 unidades',10500,'menu-launch/tray-croquetas.webp',114,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-jamon-90','catering_platter-jamon-90','price_cents',NULL,10500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-pollo-30','addon','Chicken croqueta platter — 30 pieces (plated with sauces)','Bandeja de croquetas de pollo — 30 unidades',3500,'menu-launch/tray-croquetas.webp',115,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-pollo-30','catering_platter-pollo-30','price_cents',NULL,3500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-pollo-60','addon','Chicken croqueta platter — 60 pieces (plated with sauces)','Bandeja de croquetas de pollo — 60 unidades',7000,'menu-launch/tray-croquetas.webp',116,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-pollo-60','catering_platter-pollo-60','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-pollo-90','addon','Chicken croqueta platter — 90 pieces (plated with sauces)','Bandeja de croquetas de pollo — 90 unidades',10500,'menu-launch/tray-croquetas.webp',117,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-pollo-90','catering_platter-pollo-90','price_cents',NULL,10500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-res-30','addon','Beef croqueta platter — 30 pieces (plated with sauces)','Bandeja de croquetas de res — 30 unidades',3500,'menu-launch/tray-croquetas.webp',118,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-res-30','catering_platter-res-30','price_cents',NULL,3500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-res-60','addon','Beef croqueta platter — 60 pieces (plated with sauces)','Bandeja de croquetas de res — 60 unidades',7000,'menu-launch/tray-croquetas.webp',119,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-res-60','catering_platter-res-60','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-res-90','addon','Beef croqueta platter — 90 pieces (plated with sauces)','Bandeja de croquetas de res — 90 unidades',10500,'menu-launch/tray-croquetas.webp',120,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-res-90','catering_platter-res-90','price_cents',NULL,10500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-chorizo-30','addon','Chorizo croqueta platter — 30 pieces (plated with sauces)','Bandeja de croquetas de chorizo — 30 unidades',3500,'menu-launch/tray-croquetas.webp',121,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-chorizo-30','catering_platter-chorizo-30','price_cents',NULL,3500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-chorizo-60','addon','Chorizo croqueta platter — 60 pieces (plated with sauces)','Bandeja de croquetas de chorizo — 60 unidades',7000,'menu-launch/tray-croquetas.webp',122,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-chorizo-60','catering_platter-chorizo-60','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-chorizo-90','addon','Chorizo croqueta platter — 90 pieces (plated with sauces)','Bandeja de croquetas de chorizo — 90 unidades',10500,'menu-launch/tray-croquetas.webp',123,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-chorizo-90','catering_platter-chorizo-90','price_cents',NULL,10500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-sausage-30','addon','Sausage croqueta platter — 30 pieces (plated with sauces)','Bandeja de croquetas de salchicha — 30 unidades',3500,'menu-launch/tray-croquetas.webp',124,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-sausage-30','catering_platter-sausage-30','price_cents',NULL,3500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-sausage-60','addon','Sausage croqueta platter — 60 pieces (plated with sauces)','Bandeja de croquetas de salchicha — 60 unidades',7000,'menu-launch/tray-croquetas.webp',125,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-sausage-60','catering_platter-sausage-60','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-sausage-90','addon','Sausage croqueta platter — 90 pieces (plated with sauces)','Bandeja de croquetas de salchicha — 90 unidades',10500,'menu-launch/tray-croquetas.webp',126,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-sausage-90','catering_platter-sausage-90','price_cents',NULL,10500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-tuna-30','addon','Tuna croqueta platter — 30 pieces (plated with sauces)','Bandeja de croquetas de atún — 30 unidades',3500,'menu-launch/tray-croquetas.webp',127,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-tuna-30','catering_platter-tuna-30','price_cents',NULL,3500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-tuna-60','addon','Tuna croqueta platter — 60 pieces (plated with sauces)','Bandeja de croquetas de atún — 60 unidades',7000,'menu-launch/tray-croquetas.webp',128,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-tuna-60','catering_platter-tuna-60','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_platter-tuna-90','addon','Tuna croqueta platter — 90 pieces (plated with sauces)','Bandeja de croquetas de atún — 90 unidades',10500,'menu-launch/tray-croquetas.webp',129,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_platter-tuna-90','catering_platter-tuna-90','price_cents',NULL,10500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_dressed','addon','Dressed croqueta platter','Bandeja de croquetas preparadas',325,'menu-launch/tray-dressed.webp',130,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_dressed','traditional_dressed','price_cents',NULL,325,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_dressed-30','addon','Dressed croqueta platter — 30 pieces','Bandeja de croquetas preparadas — 30 unidades',4500,'menu-launch/tray-dressed.webp',131,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_dressed-30','catering_dressed-30','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_dressed-60','addon','Dressed croqueta platter — 60 pieces','Bandeja de croquetas preparadas — 60 unidades',9000,'menu-launch/tray-dressed.webp',132,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_dressed-60','catering_dressed-60','price_cents',NULL,9000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_dressed-90','addon','Dressed croqueta platter — 90 pieces','Bandeja de croquetas preparadas — 90 unidades',13500,'menu-launch/tray-dressed.webp',133,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_dressed-90','catering_dressed-90','price_cents',NULL,13500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-guava','addon','Guava & cheese empanada','Empanada de guayaba y queso',250,'menu-launch/food-emp-guava.webp',134,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-guava','traditional_emp-guava','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-guava-10','addon','Guava & cheese empanada — 10 pieces','Empanada de guayaba y queso — 10 unidades',2500,'menu-launch/food-emp-guava.webp',135,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-guava-10','catering_emp-guava-10','price_cents',NULL,2500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-guava-25','addon','Guava & cheese empanada — 25 pieces','Empanada de guayaba y queso — 25 unidades',5000,'menu-launch/food-emp-guava.webp',136,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-guava-25','catering_emp-guava-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-guava-50','addon','Guava & cheese empanada — 50 pieces','Empanada de guayaba y queso — 50 unidades',7500,'menu-launch/food-emp-guava.webp',137,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-guava-50','catering_emp-guava-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-cheese','addon','Cheese empanada','Empanada de queso',250,'menu-launch/empanada-single.webp',138,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-cheese','traditional_emp-cheese','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-cheese-10','addon','Cheese empanada — 10 pieces','Empanada de queso — 10 unidades',2500,'menu-launch/empanada-single.webp',139,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-cheese-10','catering_emp-cheese-10','price_cents',NULL,2500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-cheese-25','addon','Cheese empanada — 25 pieces','Empanada de queso — 25 unidades',5000,'menu-launch/empanada-single.webp',140,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-cheese-25','catering_emp-cheese-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-cheese-50','addon','Cheese empanada — 50 pieces','Empanada de queso — 50 unidades',7500,'menu-launch/empanada-single.webp',141,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-cheese-50','catering_emp-cheese-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-ham','addon','Ham empanada','Empanada de jamón',250,'menu-launch/empanada-single.webp',142,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-ham','traditional_emp-ham','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-ham-10','addon','Ham empanada — 10 pieces','Empanada de jamón — 10 unidades',2500,'menu-launch/empanada-single.webp',143,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-ham-10','catering_emp-ham-10','price_cents',NULL,2500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-ham-25','addon','Ham empanada — 25 pieces','Empanada de jamón — 25 unidades',5000,'menu-launch/empanada-single.webp',144,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-ham-25','catering_emp-ham-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-ham-50','addon','Ham empanada — 50 pieces','Empanada de jamón — 50 unidades',7500,'menu-launch/empanada-single.webp',145,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-ham-50','catering_emp-ham-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-dulce','addon','Dulce de leche empanada','Empanada de dulce de leche',250,'menu-launch/empanada-single.webp',146,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-dulce','traditional_emp-dulce','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-dulce-10','addon','Dulce de leche empanada — 10 pieces','Empanada de dulce de leche — 10 unidades',2500,'menu-launch/empanada-single.webp',147,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-dulce-10','catering_emp-dulce-10','price_cents',NULL,2500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-dulce-25','addon','Dulce de leche empanada — 25 pieces','Empanada de dulce de leche — 25 unidades',5000,'menu-launch/empanada-single.webp',148,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-dulce-25','catering_emp-dulce-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-dulce-50','addon','Dulce de leche empanada — 50 pieces','Empanada de dulce de leche — 50 unidades',7500,'menu-launch/empanada-single.webp',149,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-dulce-50','catering_emp-dulce-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-ham-cheese','addon','Ham & cheese empanada','Empanada de jamón y queso',250,'menu-launch/empanada-single.webp',150,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-ham-cheese','traditional_emp-ham-cheese','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-ham-cheese-10','addon','Ham & cheese empanada — 10 pieces','Empanada de jamón y queso — 10 unidades',2500,'menu-launch/empanada-single.webp',151,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-ham-cheese-10','catering_emp-ham-cheese-10','price_cents',NULL,2500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-ham-cheese-25','addon','Ham & cheese empanada — 25 pieces','Empanada de jamón y queso — 25 unidades',5000,'menu-launch/empanada-single.webp',152,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-ham-cheese-25','catering_emp-ham-cheese-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-ham-cheese-50','addon','Ham & cheese empanada — 50 pieces','Empanada de jamón y queso — 50 unidades',7500,'menu-launch/empanada-single.webp',153,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-ham-cheese-50','catering_emp-ham-cheese-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-guava-only','addon','Guava empanada','Empanada de guayaba',250,'menu-launch/empanada-single.webp',154,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-guava-only','traditional_emp-guava-only','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-guava-only-10','addon','Guava empanada — 10 pieces','Empanada de guayaba — 10 unidades',2500,'menu-launch/empanada-single.webp',155,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-guava-only-10','catering_emp-guava-only-10','price_cents',NULL,2500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-guava-only-25','addon','Guava empanada — 25 pieces','Empanada de guayaba — 25 unidades',5000,'menu-launch/empanada-single.webp',156,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-guava-only-25','catering_emp-guava-only-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-guava-only-50','addon','Guava empanada — 50 pieces','Empanada de guayaba — 50 unidades',7500,'menu-launch/empanada-single.webp',157,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-guava-only-50','catering_emp-guava-only-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-pollo','addon','Chicken empanada','Empanada de pollo',275,'menu-launch/empanada-single.webp',158,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-pollo','traditional_emp-pollo','price_cents',NULL,275,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-pollo-10','addon','Chicken empanada — 10 pieces','Empanada de pollo — 10 unidades',3000,'menu-launch/empanada-single.webp',159,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-pollo-10','catering_emp-pollo-10','price_cents',NULL,3000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-pollo-25','addon','Chicken empanada — 25 pieces','Empanada de pollo — 25 unidades',6000,'menu-launch/empanada-single.webp',160,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-pollo-25','catering_emp-pollo-25','price_cents',NULL,6000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-pollo-50','addon','Chicken empanada — 50 pieces','Empanada de pollo — 50 unidades',11000,'menu-launch/empanada-single.webp',161,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-pollo-50','catering_emp-pollo-50','price_cents',NULL,11000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-pulled-pork','addon','Pulled pork empanada','Empanada de lechón',275,'menu-launch/empanada-single.webp',162,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-pulled-pork','traditional_emp-pulled-pork','price_cents',NULL,275,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-pulled-pork-10','addon','Pulled pork empanada — 10 pieces','Empanada de lechón — 10 unidades',3000,'menu-launch/empanada-single.webp',163,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-pulled-pork-10','catering_emp-pulled-pork-10','price_cents',NULL,3000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-pulled-pork-25','addon','Pulled pork empanada — 25 pieces','Empanada de lechón — 25 unidades',6000,'menu-launch/empanada-single.webp',164,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-pulled-pork-25','catering_emp-pulled-pork-25','price_cents',NULL,6000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-pulled-pork-50','addon','Pulled pork empanada — 50 pieces','Empanada de lechón — 50 unidades',11000,'menu-launch/empanada-single.webp',165,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-pulled-pork-50','catering_emp-pulled-pork-50','price_cents',NULL,11000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-tuna','addon','Tuna empanada','Empanada de atún',275,'menu-launch/empanada-single.webp',166,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-tuna','traditional_emp-tuna','price_cents',NULL,275,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-tuna-10','addon','Tuna empanada — 10 pieces','Empanada de atún — 10 unidades',3000,'menu-launch/empanada-single.webp',167,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-tuna-10','catering_emp-tuna-10','price_cents',NULL,3000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-tuna-25','addon','Tuna empanada — 25 pieces','Empanada de atún — 25 unidades',6000,'menu-launch/empanada-single.webp',168,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-tuna-25','catering_emp-tuna-25','price_cents',NULL,6000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-tuna-50','addon','Tuna empanada — 50 pieces','Empanada de atún — 50 unidades',11000,'menu-launch/empanada-single.webp',169,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-tuna-50','catering_emp-tuna-50','price_cents',NULL,11000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-res','addon','Beef empanada','Empanada de res',275,'menu-launch/empanada-single.webp',170,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-res','traditional_emp-res','price_cents',NULL,275,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-res-10','addon','Beef empanada — 10 pieces','Empanada de res — 10 unidades',3000,'menu-launch/empanada-single.webp',171,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-res-10','catering_emp-res-10','price_cents',NULL,3000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-res-25','addon','Beef empanada — 25 pieces','Empanada de res — 25 unidades',6000,'menu-launch/empanada-single.webp',172,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-res-25','catering_emp-res-25','price_cents',NULL,6000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-res-50','addon','Beef empanada — 50 pieces','Empanada de res — 50 unidades',11000,'menu-launch/empanada-single.webp',173,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-res-50','catering_emp-res-50','price_cents',NULL,11000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_emp-ropa-vieja','addon','Ropa vieja empanada','Empanada de ropa vieja',400,'menu-launch/empanada-single.webp',174,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_emp-ropa-vieja','traditional_emp-ropa-vieja','price_cents',NULL,400,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-ropa-vieja-25','addon','Ropa vieja empanada — 25 pieces','Empanada de ropa vieja — 25 unidades',8500,'menu-launch/empanada-single.webp',175,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-ropa-vieja-25','catering_emp-ropa-vieja-25','price_cents',NULL,8500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_emp-ropa-vieja-50','addon','Ropa vieja empanada — 50 pieces','Empanada de ropa vieja — 50 unidades',16500,'menu-launch/empanada-single.webp',176,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_emp-ropa-vieja-50','catering_emp-ropa-vieja-50','price_cents',NULL,16500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_bomba','addon','La Bomba Tropical','La Bomba Tropical',300,'menu-launch/food-bomba.webp',177,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_bomba','traditional_bomba','price_cents',NULL,300,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bomba-10','addon','La Bomba Tropical — 10 pieces','La Bomba Tropical — 10 unidades',3000,'menu-launch/food-bomba.webp',178,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bomba-10','catering_bomba-10','price_cents',NULL,3000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bomba-25','addon','La Bomba Tropical — 25 pieces','La Bomba Tropical — 25 unidades',6875,'menu-launch/food-bomba.webp',179,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bomba-25','catering_bomba-25','price_cents',NULL,6875,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bomba-50','addon','La Bomba Tropical — 50 pieces','La Bomba Tropical — 50 unidades',12500,'menu-launch/food-bomba.webp',180,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bomba-50','catering_bomba-50','price_cents',NULL,12500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_bocadito-jamon','addon','Ham bocadito','Bocadito de jamón',150,'menu-launch/food-bocadito.webp',181,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_bocadito-jamon','traditional_bocadito-jamon','price_cents',NULL,150,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bocadito-jamon-10','addon','Ham bocadito — 10 pieces','Bocadito de jamón — 10 unidades',1500,'menu-launch/food-bocadito.webp',182,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bocadito-jamon-10','catering_bocadito-jamon-10','price_cents',NULL,1500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bocadito-jamon-25','addon','Ham bocadito — 25 pieces','Bocadito de jamón — 25 unidades',3125,'menu-launch/food-bocadito.webp',183,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bocadito-jamon-25','catering_bocadito-jamon-25','price_cents',NULL,3125,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bocadito-jamon-50','addon','Ham bocadito — 50 pieces','Bocadito de jamón — 50 unidades',5000,'menu-launch/food-bocadito.webp',184,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bocadito-jamon-50','catering_bocadito-jamon-50','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_bocadito-atun','addon','Tuna bocadito','Bocadito de atún',150,'menu-launch/food-bocadito.webp',185,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_bocadito-atun','traditional_bocadito-atun','price_cents',NULL,150,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bocadito-atun-10','addon','Tuna bocadito — 10 pieces','Bocadito de atún — 10 unidades',1500,'menu-launch/food-bocadito.webp',186,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bocadito-atun-10','catering_bocadito-atun-10','price_cents',NULL,1500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bocadito-atun-25','addon','Tuna bocadito — 25 pieces','Bocadito de atún — 25 unidades',3125,'menu-launch/food-bocadito.webp',187,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bocadito-atun-25','catering_bocadito-atun-25','price_cents',NULL,3125,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_bocadito-atun-50','addon','Tuna bocadito — 50 pieces','Bocadito de atún — 50 unidades',5000,'menu-launch/food-bocadito.webp',188,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_bocadito-atun-50','catering_bocadito-atun-50','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_skewer','addon','Skewer','Brocheta',300,'menu-launch/food-skewer.webp',189,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_skewer','traditional_skewer','price_cents',NULL,300,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_skewer-10','addon','Skewer — 10 pieces','Brocheta — 10 unidades',3000,'menu-launch/food-skewer.webp',190,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_skewer-10','catering_skewer-10','price_cents',NULL,3000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_skewer-25','addon','Skewer — 25 pieces','Brocheta — 25 unidades',6500,'menu-launch/food-skewer.webp',191,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_skewer-25','catering_skewer-25','price_cents',NULL,6500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_skewer-50','addon','Skewer — 50 pieces','Brocheta — 50 unidades',10000,'menu-launch/food-skewer.webp',192,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_skewer-50','catering_skewer-50','price_cents',NULL,10000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_papa-queso','addon','Cheese papa rellena','Papa rellena de queso',200,NULL,193,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_papa-queso','traditional_papa-queso','price_cents',NULL,200,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-queso-10','addon','Cheese papa rellena — 10 pieces','Papa rellena de queso — 10 unidades',2000,NULL,194,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-queso-10','catering_papa-queso-10','price_cents',NULL,2000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-queso-25','addon','Cheese papa rellena — 25 pieces','Papa rellena de queso — 25 unidades',5000,NULL,195,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-queso-25','catering_papa-queso-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-queso-50','addon','Cheese papa rellena — 50 pieces','Papa rellena de queso — 50 unidades',7500,NULL,196,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-queso-50','catering_papa-queso-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_papa-jamon','addon','Ham papa rellena','Papa rellena de jamón',200,NULL,197,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_papa-jamon','traditional_papa-jamon','price_cents',NULL,200,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-jamon-10','addon','Ham papa rellena — 10 pieces','Papa rellena de jamón — 10 unidades',2000,NULL,198,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-jamon-10','catering_papa-jamon-10','price_cents',NULL,2000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-jamon-25','addon','Ham papa rellena — 25 pieces','Papa rellena de jamón — 25 unidades',5000,NULL,199,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-jamon-25','catering_papa-jamon-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-jamon-50','addon','Ham papa rellena — 50 pieces','Papa rellena de jamón — 50 unidades',7500,NULL,200,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-jamon-50','catering_papa-jamon-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_papa-chorizo','addon','Chorizo papa rellena','Papa rellena de chorizo',200,NULL,201,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_papa-chorizo','traditional_papa-chorizo','price_cents',NULL,200,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-chorizo-10','addon','Chorizo papa rellena — 10 pieces','Papa rellena de chorizo — 10 unidades',2000,NULL,202,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-chorizo-10','catering_papa-chorizo-10','price_cents',NULL,2000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-chorizo-25','addon','Chorizo papa rellena — 25 pieces','Papa rellena de chorizo — 25 unidades',5000,NULL,203,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-chorizo-25','catering_papa-chorizo-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-chorizo-50','addon','Chorizo papa rellena — 50 pieces','Papa rellena de chorizo — 50 unidades',7500,NULL,204,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-chorizo-50','catering_papa-chorizo-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_papa-perro','addon','Hot dog papa rellena','Papa rellena de perro caliente',200,NULL,205,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_papa-perro','traditional_papa-perro','price_cents',NULL,200,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-perro-10','addon','Hot dog papa rellena — 10 pieces','Papa rellena de perro caliente — 10 unidades',2000,NULL,206,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-perro-10','catering_papa-perro-10','price_cents',NULL,2000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-perro-25','addon','Hot dog papa rellena — 25 pieces','Papa rellena de perro caliente — 25 unidades',5000,NULL,207,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-perro-25','catering_papa-perro-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-perro-50','addon','Hot dog papa rellena — 50 pieces','Papa rellena de perro caliente — 50 unidades',7500,NULL,208,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-perro-50','catering_papa-perro-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_papa-jamon-queso','addon','Ham & cheese papa rellena','Papa rellena de jamón y queso',250,NULL,209,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_papa-jamon-queso','traditional_papa-jamon-queso','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-jamon-queso-10','addon','Ham & cheese papa rellena — 10 pieces','Papa rellena de jamón y queso — 10 unidades',2000,NULL,210,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-jamon-queso-10','catering_papa-jamon-queso-10','price_cents',NULL,2000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-jamon-queso-25','addon','Ham & cheese papa rellena — 25 pieces','Papa rellena de jamón y queso — 25 unidades',5000,NULL,211,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-jamon-queso-25','catering_papa-jamon-queso-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-jamon-queso-50','addon','Ham & cheese papa rellena — 50 pieces','Papa rellena de jamón y queso — 50 unidades',7500,NULL,212,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-jamon-queso-50','catering_papa-jamon-queso-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_papa-pollo','addon','Chicken papa rellena','Papa rellena de pollo',250,NULL,213,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_papa-pollo','traditional_papa-pollo','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-pollo-10','addon','Chicken papa rellena — 10 pieces','Papa rellena de pollo — 10 unidades',2000,NULL,214,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-pollo-10','catering_papa-pollo-10','price_cents',NULL,2000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-pollo-25','addon','Chicken papa rellena — 25 pieces','Papa rellena de pollo — 25 unidades',5000,NULL,215,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-pollo-25','catering_papa-pollo-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-pollo-50','addon','Chicken papa rellena — 50 pieces','Papa rellena de pollo — 50 unidades',7500,NULL,216,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-pollo-50','catering_papa-pollo-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_papa-res','addon','Beef papa rellena','Papa rellena de res',250,NULL,217,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_papa-res','traditional_papa-res','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-res-10','addon','Beef papa rellena — 10 pieces','Papa rellena de res — 10 unidades',2000,NULL,218,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-res-10','catering_papa-res-10','price_cents',NULL,2000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-res-25','addon','Beef papa rellena — 25 pieces','Papa rellena de res — 25 unidades',5000,NULL,219,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-res-25','catering_papa-res-25','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_papa-res-50','addon','Beef papa rellena — 50 pieces','Papa rellena de res — 50 unidades',7500,NULL,220,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_papa-res-50','catering_papa-res-50','price_cents',NULL,7500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_lechon','addon','Lechón asado','Lechón asado',650,'menu-launch/food-lechon.webp',221,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_lechon','traditional_lechon','price_cents',NULL,650,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_lechon-10','addon','Lechón asado — 10 servings','Lechón asado — 10 porciones',5000,'menu-launch/food-lechon.webp',222,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_lechon-10','catering_lechon-10','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_lechon-25','addon','Lechón asado — 25 servings','Lechón asado — 25 porciones',8500,'menu-launch/food-lechon.webp',223,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_lechon-25','catering_lechon-25','price_cents',NULL,8500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_lechon-50','addon','Lechón asado — 50 servings','Lechón asado — 50 porciones',16000,'menu-launch/food-lechon.webp',224,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_lechon-50','catering_lechon-50','price_cents',NULL,16000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_congri','addon','Congrí','Congrí',350,'menu-launch/congri-single.webp',225,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_congri','traditional_congri','price_cents',NULL,350,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_congri-10','addon','Congrí — 10 servings','Congrí — 10 porciones',3500,'menu-launch/congri-single.webp',226,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_congri-10','catering_congri-10','price_cents',NULL,3500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_congri-25','addon','Congrí — 25 servings','Congrí — 25 porciones',6000,'menu-launch/congri-single.webp',227,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_congri-25','catering_congri-25','price_cents',NULL,6000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_congri-30','addon','Congrí — 30 servings','Congrí — 30 porciones',7000,'menu-launch/congri-single.webp',228,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_congri-30','catering_congri-30','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_congri-50','addon','Congrí — 50 servings','Congrí — 50 porciones',12000,'menu-launch/congri-single.webp',229,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_congri-50','catering_congri-50','price_cents',NULL,12000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_yuca','addon','Yuca with onion & chicharrones','Yuca con cebolla y chicharrones',350,'menu-launch/yuca-single.webp',230,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_yuca','traditional_yuca','price_cents',NULL,350,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_yuca-10','addon','Yuca with onion & chicharrones — 10 servings','Yuca con cebolla y chicharrones — 10 porciones',3000,'menu-launch/yuca-single.webp',231,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_yuca-10','catering_yuca-10','price_cents',NULL,3000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_yuca-25','addon','Yuca with onion & chicharrones — 25 servings','Yuca con cebolla y chicharrones — 25 porciones',4500,'menu-launch/yuca-single.webp',232,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_yuca-25','catering_yuca-25','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_yuca-30','addon','Yuca with onion & chicharrones — 30 servings','Yuca con cebolla y chicharrones — 30 porciones',5000,'menu-launch/yuca-single.webp',233,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_yuca-30','catering_yuca-30','price_cents',NULL,5000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_yuca-50','addon','Yuca with onion & chicharrones — 50 servings','Yuca con cebolla y chicharrones — 50 porciones',6500,'menu-launch/yuca-single.webp',234,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_yuca-50','catering_yuca-50','price_cents',NULL,6500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_fria','addon','Cold macaroni salad','Ensalada fría de coditos',500,'menu-launch/fria-single.webp',235,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_fria','traditional_fria','price_cents',NULL,500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_fria-10','addon','Cold macaroni salad — 10 servings','Ensalada fría de coditos — 10 porciones',4500,'menu-launch/fria-single.webp',236,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_fria-10','catering_fria-10','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_fria-25','addon','Cold macaroni salad — 25 servings','Ensalada fría de coditos — 25 porciones',6500,'menu-launch/fria-single.webp',237,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_fria-25','catering_fria-25','price_cents',NULL,6500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_fria-50','addon','Cold macaroni salad — 50 servings','Ensalada fría de coditos — 50 porciones',10000,'menu-launch/fria-single.webp',238,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_fria-50','catering_fria-50','price_cents',NULL,10000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_verde','addon','Fresh salad','Ensalada fresca',450,'menu-launch/salad-side.webp',239,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_verde','traditional_verde','price_cents',NULL,450,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_verde-10','addon','Fresh salad — 10 servings','Ensalada fresca — 10 porciones',3000,'menu-launch/salad-side.webp',240,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_verde-10','catering_verde-10','price_cents',NULL,3000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_verde-25','addon','Fresh salad — 25 servings','Ensalada fresca — 25 porciones',4500,'menu-launch/salad-side.webp',241,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_verde-25','catering_verde-25','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_verde-50','addon','Fresh salad — 50 servings','Ensalada fresca — 50 porciones',6000,'menu-launch/salad-side.webp',242,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_verde-50','catering_verde-50','price_cents',NULL,6000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_tamal','addon','Cuban tamal','Tamal cubano',450,'menu-launch/tamal-single.webp',243,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tamal','traditional_tamal','price_cents',NULL,450,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_tamal-10','addon','Cuban tamal — 10 servings','Tamal cubano — 10 porciones',4500,'menu-launch/tamal-single.webp',244,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_tamal-10','catering_tamal-10','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_tamal-25','addon','Cuban tamal — 25 servings','Tamal cubano — 25 porciones',7000,'menu-launch/tamal-single.webp',245,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_tamal-25','catering_tamal-25','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_tamal-50','addon','Cuban tamal — 50 servings','Tamal cubano — 50 porciones',9500,'menu-launch/tamal-single.webp',246,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_tamal-50','catering_tamal-50','price_cents',NULL,9500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_cup-fresa','addon','Strawberry tres leches cup','Vasito de tres leches de fresa',550,'menu-launch/cup-fresa.webp',247,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_cup-fresa','traditional_cup-fresa','price_cents',NULL,550,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cup-fresa-10','addon','Strawberry tres leches cup — 10 cups','Vasito de tres leches de fresa — 10 vasitos',4000,'menu-launch/cup-fresa.webp',248,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cup-fresa-10','catering_cup-fresa-10','price_cents',NULL,4000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cup-fresa-25','addon','Strawberry tres leches cup — 25 cups','Vasito de tres leches de fresa — 25 vasitos',7000,'menu-launch/cup-fresa.webp',249,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cup-fresa-25','catering_cup-fresa-25','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cup-fresa-50','addon','Strawberry tres leches cup — 50 cups','Vasito de tres leches de fresa — 50 vasitos',11000,'menu-launch/cup-fresa.webp',250,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cup-fresa-50','catering_cup-fresa-50','price_cents',NULL,11000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_cup-chocolate','addon','Chocolate tres leches cup','Vasito de tres leches de chocolate',550,'menu-launch/cup-chocolate.webp',251,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_cup-chocolate','traditional_cup-chocolate','price_cents',NULL,550,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cup-chocolate-10','addon','Chocolate tres leches cup — 10 cups','Vasito de tres leches de chocolate — 10 vasitos',4000,'menu-launch/cup-chocolate.webp',252,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cup-chocolate-10','catering_cup-chocolate-10','price_cents',NULL,4000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cup-chocolate-25','addon','Chocolate tres leches cup — 25 cups','Vasito de tres leches de chocolate — 25 vasitos',7000,'menu-launch/cup-chocolate.webp',253,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cup-chocolate-25','catering_cup-chocolate-25','price_cents',NULL,7000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cup-chocolate-50','addon','Chocolate tres leches cup — 50 cups','Vasito de tres leches de chocolate — 50 vasitos',11000,'menu-launch/cup-chocolate.webp',254,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cup-chocolate-50','catering_cup-chocolate-50','price_cents',NULL,11000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_cajita','addon','La Cajita','La Cajita',1750,'menu-launch/cajitas-collection.webp',255,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_cajita','traditional_cajita','price_cents',NULL,1750,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cajita-10','addon','La Cajita — 10 cajitas','La Cajita — 10 cajitas',16000,'menu-launch/cajitas-collection.webp',256,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cajita-10','catering_cajita-10','price_cents',NULL,16000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cajita-25','addon','La Cajita — 25 cajitas','La Cajita — 25 cajitas',38500,'menu-launch/cajitas-collection.webp',257,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cajita-25','catering_cajita-25','price_cents',NULL,38500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cajita-50','addon','La Cajita — 50 cajitas','La Cajita — 50 cajitas',72500,'menu-launch/cajitas-collection.webp',258,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cajita-50','catering_cajita-50','price_cents',NULL,72500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_tamal-full','addon','Whole tamal — 6 slices','Tamal entero — 6 rodajas',550,'menu-launch/food-tamal.webp',259,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tamal-full','traditional_tamal-full','price_cents',NULL,550,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_arroz-blanco','addon','White rice — 8 oz','Arroz blanco — 8 oz',300,'menu-launch/rice-side.webp',260,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_arroz-blanco','traditional_arroz-blanco','price_cents',NULL,300,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_arroz-frito-side','addon','Fried rice — 6 oz','Arroz frito — 6 oz',650,'menu-launch/arroz-frito.webp',261,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_arroz-frito-side','traditional_arroz-frito-side','price_cents',NULL,650,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cake-fresa-c','addon','Strawberry tres leches — 10-inch cake','Tres leches de fresa — pastel de 10 pulgadas',4500,'menu-launch/food-cake-fresa-c.webp',262,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cake-fresa-c','catering_cake-fresa-c','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('catering_cake-chocolate-c','addon','Chocolate tres leches — 10-inch cake','Tres leches de chocolate — pastel de 10 pulgadas',4500,'menu-launch/food-cake-chocolate-c.webp',263,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-catering_cake-chocolate-c','catering_cake-chocolate-c','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=250, updated_at=1788955200000 WHERE id='traditional_tostones-cheese';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tostones-cheese','traditional_tostones-cheese','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=250, updated_at=1788955200000 WHERE id='traditional_tostones-ham';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tostones-ham','traditional_tostones-ham','price_cents',NULL,250,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=325, updated_at=1788955200000 WHERE id='traditional_tostones-pollo';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tostones-pollo','traditional_tostones-pollo','price_cents',NULL,325,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=325, updated_at=1788955200000 WHERE id='traditional_tostones-ham-cheese';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tostones-ham-cheese','traditional_tostones-ham-cheese','price_cents',NULL,325,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=325, updated_at=1788955200000 WHERE id='traditional_tostones-ropa-vieja';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tostones-ropa-vieja','traditional_tostones-ropa-vieja','price_cents',NULL,325,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=325, updated_at=1788955200000 WHERE id='traditional_tostones-lechon';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tostones-lechon','traditional_tostones-lechon','price_cents',NULL,325,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=325, updated_at=1788955200000 WHERE id='traditional_tostones-shrimp';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_tostones-shrimp','traditional_tostones-shrimp','price_cents',NULL,325,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=4500, updated_at=1788955200000 WHERE id='traditional_cake-fresa';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_cake-fresa','traditional_cake-fresa','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=4500, updated_at=1788955200000 WHERE id='traditional_cake-chocolate';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_cake-chocolate','traditional_cake-chocolate','price_cents',NULL,4500,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1000, updated_at=1788955200000 WHERE id='traditional_meal-tacos-pollo';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-tacos-pollo','traditional_meal-tacos-pollo','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1000, updated_at=1788955200000 WHERE id='traditional_meal-tacos-lechon';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-tacos-lechon','traditional_meal-tacos-lechon','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1000, updated_at=1788955200000 WHERE id='traditional_meal-lasagna';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-lasagna','traditional_meal-lasagna','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1000, updated_at=1788955200000 WHERE id='traditional_meal-sandwich-pollo';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-sandwich-pollo','traditional_meal-sandwich-pollo','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1000, updated_at=1788955200000 WHERE id='traditional_pizza';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_pizza','traditional_pizza','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES ('traditional_pizza-loaded','addon','Cuban pizza with toppings','Pizza cubana con ingredientes',1200,'menu-launch/pizza-plated.webp',500,1,1788955200000,1788955200000)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=1788955200000;
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_pizza-loaded','traditional_pizza-loaded','price_cents',NULL,1200,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1600, updated_at=1788955200000 WHERE id='traditional_meal-uruguayo-congri';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-uruguayo-congri','traditional_meal-uruguayo-congri','price_cents',NULL,1600,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1600, updated_at=1788955200000 WHERE id='traditional_meal-uruguayo-arroz';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-uruguayo-arroz','traditional_meal-uruguayo-arroz','price_cents',NULL,1600,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1400, updated_at=1788955200000 WHERE id='traditional_meal-chuleta';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-chuleta','traditional_meal-chuleta','price_cents',NULL,1400,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1275, updated_at=1788955200000 WHERE id='traditional_meal-enchilado-pollo';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-enchilado-pollo','traditional_meal-enchilado-pollo','price_cents',NULL,1275,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1400, updated_at=1788955200000 WHERE id='traditional_combo-traditional-meal';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_combo-traditional-meal','traditional_combo-traditional-meal','price_cents',NULL,1400,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1650, updated_at=1788955200000 WHERE id='traditional_ropa-vieja-meal';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_ropa-vieja-meal','traditional_ropa-vieja-meal','price_cents',NULL,1650,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1200, updated_at=1788955200000 WHERE id='traditional_meal-garbanzos';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-garbanzos','traditional_meal-garbanzos','price_cents',NULL,1200,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1275, updated_at=1788955200000 WHERE id='traditional_meal-arroz-frito';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-arroz-frito','traditional_meal-arroz-frito','price_cents',NULL,1275,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET price_cents=1000, updated_at=1788955200000 WHERE id='traditional_meal-pan-lechon';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-traditional_meal-pan-lechon','traditional_meal-pan-lechon','price_cents',NULL,1000,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_combo-bites75';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_combo-bites75','catering_combo-bites75','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_combo-bites150';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_combo-bites150','catering_combo-bites150','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_combo-table10';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_combo-table10','catering_combo-table10','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_combo-table25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_combo-table25','catering_combo-table25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_combo-table50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_combo-table50','catering_combo-table50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_combo-dessert24';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_combo-dessert24','catering_combo-dessert24','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_combo-tamal-croq';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_combo-tamal-croq','catering_combo-tamal-croq','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='traditional_combo-bites-snack';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-traditional_combo-bites-snack','traditional_combo-bites-snack','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-jamon-25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-jamon-25','catering_croq-jamon-25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-jamon-50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-jamon-50','catering_croq-jamon-50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-pollo-25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-pollo-25','catering_croq-pollo-25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-pollo-50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-pollo-50','catering_croq-pollo-50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-res-25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-res-25','catering_croq-res-25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-res-50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-res-50','catering_croq-res-50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-chorizo-25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-chorizo-25','catering_croq-chorizo-25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-chorizo-50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-chorizo-50','catering_croq-chorizo-50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-sausage-25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-sausage-25','catering_croq-sausage-25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-sausage-50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-sausage-50','catering_croq-sausage-50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-tuna-25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-tuna-25','catering_croq-tuna-25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_croq-tuna-50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_croq-tuna-50','catering_croq-tuna-50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_dressed-25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_dressed-25','catering_dressed-25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_dressed-50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_dressed-50','catering_dressed-50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='traditional_salami';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-traditional_salami','traditional_salami','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_salami-25';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_salami-25','catering_salami-25','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_salami-50';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_salami-50','catering_salami-50','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_pizza-3';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_pizza-3','catering_pizza-3','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_cups-fresa';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_cups-fresa','catering_cups-fresa','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
UPDATE menu_items SET active=0, updated_at=1788955200000 WHERE id='catering_cups-chocolate';
INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES ('m2609-retire-catering_cups-chocolate','catering_cups-chocolate','availability:retired',NULL,NULL,'Dayan ratified menu 2026-09-09',1788955200000);
