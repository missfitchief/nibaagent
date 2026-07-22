-- New businesses now default to gpt-4o instead of gpt-4o-mini (owner's
-- explicit request: sales/customer understanding quality over raw cost for
-- the customer-facing bot). Only affects the column default for FUTURE
-- inserts — existing rows are untouched, each business's own selected_model
-- stays exactly what it already was.
ALTER TABLE "businesses" ALTER COLUMN "selected_model" SET DEFAULT 'gpt-4o';
