-- Config-driven verticals use the existing organization/business profile model.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'appointments',
  ADD COLUMN IF NOT EXISTS vertical_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

WITH verticals(id, name, description) AS (
  VALUES
    ('clinic', 'عيادات ومراكز طبية', 'عيادات ومراكز طبية'),
    ('dental_beauty', 'عيادات أسنان وتجميل', 'عيادات أسنان وتجميل'),
    ('salon_barber', 'صالونات تجميل وحلاقة', 'صالونات تجميل وحلاقة'),
    ('legal_consulting', 'مكاتب محاماة واستشارات', 'مكاتب محاماة واستشارات'),
    ('maintenance_workshop', 'مراكز صيانة وورش سيارات', 'مراكز صيانة وورش سيارات'),
    ('gym_fitness', 'أندية رياضية ومدربين', 'أندية رياضية ومدربين'),
    ('ecommerce_store', 'متجر إلكتروني / تجزئة', 'متجر إلكتروني أو تجزئة'),
    ('restaurant_cafe', 'مطاعم وكافيهات', 'مطاعم وكافيهات'),
    ('bakery_sweets', 'مخابز وحلويات', 'مخابز وحلويات'),
    ('pharmacy', 'صيدليات ومستلزمات طبية', 'صيدليات ومستلزمات طبية'),
    ('fashion_tailoring', 'محلات أزياء وتطريز وخياطة', 'أزياء وتطريز وخياطة'),
    ('wholesale', 'تجارة جملة وموردين', 'تجارة جملة وموردين'),
    ('event_hall', 'قاعات مناسبات وأعراس', 'قاعات مناسبات وأعراس'),
    ('artist_entertainment', 'فنانين ومنسقي حفلات', 'فنانين ومنسقي حفلات'),
    ('photography', 'مصورين واستوديوهات', 'مصورين واستوديوهات'),
    ('hotel_chalet', 'فنادق وشاليهات واستراحات', 'فنادق وشاليهات واستراحات'),
    ('car_rental', 'تأجير سيارات ومعدات', 'تأجير سيارات ومعدات'),
    ('real_estate', 'عقارات ومكاتب تسويق عقاري', 'عقارات وتسويق عقاري'),
    ('travel_agency', 'وكالات سفر وسياحة', 'وكالات سفر وسياحة'),
    ('education_courses', 'أكاديميات ومعاهد ودورات', 'أكاديميات ومعاهد ودورات'),
    ('agency_services', 'شركات برمجة وتسويق وخدمات', 'برمجة وتسويق وخدمات'),
    ('shipping_logistics', 'شركات شحن وتوصيل', 'شركات شحن وتوصيل'),
    ('custom', 'نشاط تجاري عام / مخصص', 'نشاط تجاري عام أو مخصص')
)
INSERT INTO public.business_types(id, name, description)
SELECT id, name, description FROM verticals
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- All engines share a small set of existing capability modules; the vertical registry
-- chooses the module and tool subset in application code.
WITH vertical_engines(id, engine) AS (
  VALUES
    ('clinic','booking'), ('dental_beauty','booking'), ('salon_barber','booking'),
    ('legal_consulting','booking'), ('maintenance_workshop','booking'), ('gym_fitness','booking'),
    ('ecommerce_store','commerce'), ('restaurant_cafe','commerce'), ('bakery_sweets','commerce'),
    ('pharmacy','commerce'), ('fashion_tailoring','commerce'), ('wholesale','commerce'),
    ('event_hall','event'), ('artist_entertainment','event'), ('photography','event'),
    ('hotel_chalet','event'), ('car_rental','event'),
    ('real_estate','lead'), ('travel_agency','lead'), ('education_courses','lead'),
    ('agency_services','lead'), ('shipping_logistics','lead'), ('custom','lead')
), capability_defaults AS (
  SELECT id AS business_type_id, unnest(
    CASE engine
      WHEN 'booking' THEN ARRAY['appointments','lead_capture','knowledge_base','inbox','follow_up']
      WHEN 'commerce' THEN ARRAY['orders','quotes','lead_capture','knowledge_base','inbox','follow_up']
      WHEN 'event' THEN ARRAY['appointments','quotes','lead_capture','knowledge_base','inbox','follow_up']
      ELSE ARRAY['lead_capture','quotes','knowledge_base','inbox','follow_up']
    END
  ) AS capability_id
  FROM vertical_engines
)
INSERT INTO public.business_type_capabilities(business_type_id, capability_id, is_default)
SELECT business_type_id, capability_id, TRUE FROM capability_defaults
ON CONFLICT (business_type_id, capability_id) DO UPDATE SET is_default = EXCLUDED.is_default;

-- Backfill the tenant-level selector without overwriting an existing profile choice.
UPDATE public.organizations o
SET business_type = COALESCE(bp.business_type_id, o.business_type)
FROM public.business_profiles bp
WHERE bp.organization_id = o.id;
