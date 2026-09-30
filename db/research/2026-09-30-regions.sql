-- Taxes set per region: regions never inherit the national rate for these.
update offshore_insights.jurisdiction set regional_tax_types = '{INHERITANCE_DIRECT,INHERITANCE_OTHER}' where code = 'BE';
update offshore_insights.jurisdiction set regional_tax_types = '{INHERITANCE_DIRECT,INHERITANCE_OTHER,WEALTH_NET}' where code = 'ES';
