-- Driver tips: à-la-carte checkout now shows a Square tip prompt (allow_tipping). The Square
-- webhook records the captured tip on the order so the owner can see it and pay drivers out.
ALTER TABLE orders ADD COLUMN tip_cents INTEGER DEFAULT 0;
