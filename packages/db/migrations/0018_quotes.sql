-- Migration 0018: Quotes Domain

CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id UUID REFERENCES business_locations(id) ON DELETE SET NULL,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    quote_number VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
    currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
    
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    notes TEXT,
    valid_until TIMESTAMP WITH TIME ZONE,
    
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE quote_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generate unique quote numbers (e.g. Q-2026-0001) using a sequence
CREATE SEQUENCE quote_number_seq;

CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := 'Q-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('quote_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION generate_quote_number();

-- Update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_quotes_org_business ON quotes(organization_id, business_id);
CREATE INDEX idx_quotes_contact_id ON quotes(contact_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quote_items_quote_id ON quote_items(quote_id);

-- Row Level Security (RLS)
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view quotes"
ON quotes FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can insert quotes"
ON quotes FOR INSERT WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Org members can update quotes"
ON quotes FOR UPDATE USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can delete quotes"
ON quotes FOR DELETE USING (public.is_org_member(organization_id));

-- Quote items policies inherit from the quote's organization_id via join or subselect
CREATE POLICY "Org members can view quote items"
ON quote_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND public.is_org_member(quotes.organization_id))
);

CREATE POLICY "Org members can insert quote items"
ON quote_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND public.is_org_member(quotes.organization_id))
);

CREATE POLICY "Org members can update quote items"
ON quote_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND public.is_org_member(quotes.organization_id))
);

CREATE POLICY "Org members can delete quote items"
ON quote_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND public.is_org_member(quotes.organization_id))
);
