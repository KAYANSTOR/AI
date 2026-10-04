-- 0039_yemen_carrier_profiles.sql
-- Seed Yemeni telecom carrier profiles (Yemen Mobile, YOU, Sabafon, Y)

INSERT INTO carrier_profiles (
  country_code,
  operator_name,
  forward_on_no_answer_code,
  forward_on_busy_code,
  forward_all_code,
  cancel_forward_code,
  setup_instructions_url,
  is_manual_only
) VALUES
  -- Yemen Mobile (يمن موبايل - يدعم كود CDMA القياسي وكود GSM لشرائح 4G/VoLTE)
  ('YE', 'يمن موبايل (Yemen Mobile)', '*92{PHONE}', '*90{PHONE}', '*72{PHONE}', '*920', 'https://yemenmobile.com.ye', false),

  -- YOU (يو للاتصالات - MTN سابقاً)
  ('YE', 'يو للاتصالات (YOU - MTN سابقاً)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://you.com.ye', false),

  -- Sabafon (سبأفون)
  ('YE', 'سبأفون (Sabafon)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://sabafon.com', false),

  -- Y Telecom (شركة واي للاتصالات)
  ('YE', 'واي للاتصالات (Y Telecom)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://y-gsm.com', false)
ON CONFLICT DO NOTHING;
