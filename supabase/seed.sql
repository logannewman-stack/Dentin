-- ===========================================================================
-- Dentin — global catalog seed
--
-- Categories, suppliers, a representative dental catalog, and a synthetic
-- supplier market so price comparison has something to compare.
--
-- NOTE ON BARCODES: the `gtin` values below are DEMO values in a reserved
-- 099999… range. They are not real GS1 barcodes. Replace this table with a
-- licensed GS1/GDSN feed (or your suppliers' catalog exports) before you scan
-- real packaging in production — `resolve_gtin()` will then match live boxes.
-- Prices are likewise illustrative, not quoted rates.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Categories
-- --------------------------------------------------------------------------
insert into categories (slug, name, icon, sort_order) values
  ('infection-control', 'Infection Control', 'shield-check',   10),
  ('restorative',       'Restorative',       'layers',         20),
  ('preventive',        'Preventive',        'sparkles',       30),
  ('endodontics',       'Endodontics',       'git-branch',     40),
  ('oral-surgery',      'Oral Surgery',      'scissors',       50),
  ('implants',          'Implants',          'anchor',         60),
  ('orthodontics',      'Orthodontics',      'align-center',   70),
  ('impression-lab',    'Impression & Lab',  'flask-conical',  80),
  ('anesthetics',       'Anesthetics',       'syringe',        90),
  ('rotary-burs',       'Rotary & Burs',     'disc',          100),
  ('imaging',           'Imaging',           'scan-line',     110),
  ('whitening',         'Whitening',         'sun',           120),
  ('disposables',       'Disposables',       'package',       130),
  ('equipment',         'Equipment',         'wrench',        140)
on conflict (slug) do nothing;

-- --------------------------------------------------------------------------
-- Suppliers
-- --------------------------------------------------------------------------
insert into suppliers (slug, name, website, free_ship_over, flat_ship_fee, avg_lead_days, notes) values
  ('henry-schein', 'Henry Schein',  'https://www.henryschein.com', 250.00, 12.95, 2, 'Full-service; deepest equipment bench'),
  ('patterson',    'Patterson Dental','https://www.pattersondental.com', 300.00, 14.50, 3, 'Strong CAD/CAM and service network'),
  ('benco',        'Benco Dental',  'https://www.benco.com',       225.00,  9.95, 3, 'Independent; competitive on consumables'),
  ('darby',        'Darby Dental',  'https://www.darbydental.com', 150.00,  7.95, 3, 'Consumables specialist, low free-ship bar'),
  ('net32',        'Net32',         'https://www.net32.com',         0.00,  6.50, 5, 'Marketplace; usually the floor on price'),
  ('dental-city',  'Dental City',   'https://www.dentalcity.com',  199.00,  8.95, 4, 'Good mid-market pricing'),
  ('safco',        'Safco Dental',  'https://www.safcodental.com', 175.00,  8.50, 4, 'Reliable generics and disposables')
on conflict (slug) do nothing;

-- --------------------------------------------------------------------------
-- Catalog
-- --------------------------------------------------------------------------
insert into products
  (practice_id, category_id, name, brand, manufacturer, gtin, mfr_sku, unit, pack_size,
   is_equipment, is_rx, shelf_life_days, description, image_url)
select
  null,
  (select id from categories where slug = v.category),
  v.name, v.brand, v.manufacturer, v.gtin, v.mfr_sku, v.unit, v.pack_size,
  v.is_equipment, v.is_rx, v.shelf_life_days, v.description, null
from (values
  -- Infection control -------------------------------------------------------
  ('infection-control','Micro-Touch Nitrile Exam Gloves, Powder-Free, Medium','Micro-Touch','Ansell','099999000010','MT-N-M','box of 200',200,false,false,1825,'Textured fingertips, low-dermatitis nitrile. The single highest-turn SKU in most practices.'),
  ('infection-control','Micro-Touch Nitrile Exam Gloves, Powder-Free, Large','Micro-Touch','Ansell','099999000027','MT-N-L','box of 200',200,false,false,1825,'Textured fingertips, low-dermatitis nitrile.'),
  ('infection-control','Level 3 Procedure Masks with Earloops','Crosstex','Crosstex International','099999000034','CTX-L3-EL','box of 50',50,false,false,1825,'ASTM Level 3 fluid resistance for aerosol-generating procedures.'),
  ('infection-control','CaviWipes Surface Disinfectant Towelettes','CaviWipes','Metrex','099999000041','MTX-CW-160','canister of 160',160,false,false,730,'Intermediate-level disinfectant, 3-minute contact time.'),
  ('infection-control','CaviCide Surface Disinfectant, 24 oz','CaviCide','Metrex','099999000058','MTX-CC-24','24 oz bottle',1,false,false,730,'Spray disinfectant for operatory turnover.'),
  ('infection-control','Self-Seal Sterilization Pouches, 3.5" x 9"','Halyard','Owens & Minor','099999000065','HAL-SP-35','box of 200',200,false,false,1825,'Dual indicator, steam and EO compatible.'),
  ('infection-control','Sterilization Integrator Strips, Class 5','SteriGage','3M','099999000072','3M-SG-1243','box of 250',250,false,false,1095,'Class 5 integrating indicator for every load.'),
  ('infection-control','Biological Spore Test Strips, Weekly','Attest','3M','099999000089','3M-AT-1262','box of 25',25,false,false,545,'Weekly spore testing to satisfy state board requirements.'),
  ('infection-control','Isolation Gowns, Level 2, Universal','Crosstex','Crosstex International','099999000096','CTX-GN-L2','case of 50',50,false,false,1825,'Fluid-resistant disposable gowns.'),
  -- Restorative -------------------------------------------------------------
  ('restorative','Filtek Supreme Ultra Universal Restorative, A2 Body Refill','Filtek','3M','099999000102','3M-FSU-A2B','syringe of 20',20,false,false,1095,'Nanocomposite with high polish retention. Workhorse anterior and posterior shade.'),
  ('restorative','Filtek Supreme Ultra Universal Restorative, A3 Body Refill','Filtek','3M','099999000119','3M-FSU-A3B','syringe of 20',20,false,false,1095,'Nanocomposite universal restorative.'),
  ('restorative','Scotchbond Universal Plus Adhesive, 5 mL','Scotchbond','3M','099999000126','3M-SBU-5','5 mL bottle',1,false,false,730,'Single-bottle universal adhesive, total/self/selective etch.'),
  ('restorative','Ultra-Etch 35% Phosphoric Acid Etchant Kit','Ultra-Etch','Ultradent','099999000133','ULT-UE-KIT','kit of 20',20,false,false,1095,'Controlled-viscosity etchant that stays where you place it.'),
  ('restorative','OptiBond FL Adhesive System','OptiBond','Kerr','099999000140','KRR-OBFL','kit',1,false,false,730,'Two-bottle gold-standard bond for long-term retention.'),
  ('restorative','Clearfil SE Bond 2 Kit','Clearfil','Kuraray','099999000157','KUR-SE2','kit',1,false,false,730,'Self-etch primer and bond, minimal post-op sensitivity.'),
  ('restorative','Fuji IX GP Glass Ionomer Capsules, A2','Fuji','GC America','099999000164','GC-F9-A2','box of 50',50,false,false,1095,'High-viscosity glass ionomer for bulk fill and ART.'),
  ('restorative','Palodent V3 Sectional Matrix Refill','Palodent','Dentsply Sirona','099999000171','DEN-PV3-RF','box of 100',100,false,false,1825,'Sectional matrix bands for tight interproximal contacts.'),
  ('restorative','TheraCal LC Resin-Modified Calcium Silicate Liner','TheraCal','Bisco','099999000188','BIS-TC-LC','syringe of 4',4,false,false,730,'Pulp-capping liner that releases calcium.'),
  ('restorative','Cavit G Temporary Filling Material','Cavit','3M','099999000195','3M-CVT-G','jar of 28g',1,false,false,1095,'Self-curing temporary restorative.'),
  -- Preventive --------------------------------------------------------------
  ('preventive','Clinpro 5000 1.1% Sodium Fluoride Toothpaste, Vanilla','Clinpro','3M','099999000201','3M-CP5-VAN','case of 10',10,false,true,730,'Prescription-strength fluoride with tri-calcium phosphate.'),
  ('preventive','Vanish 5% Sodium Fluoride Varnish','Vanish','3M','099999000218','3M-VAN-100','box of 100',100,false,false,730,'White varnish with tri-calcium phosphate, single-dose.'),
  ('preventive','Prophy Paste with Fluoride, Medium Mint','Nupro','Dentsply Sirona','099999000225','DEN-NP-MM','box of 200',200,false,false,1095,'Single-use prophy cups, splatter-controlled.'),
  ('preventive','Disposable Prophy Angles, Soft Cup','Young','Young Dental','099999000232','YNG-PA-SC','box of 100',100,false,false,1825,'Latex-free soft-cup prophy angles.'),
  ('preventive','Clinpro Sealant, Light Cure','Clinpro','3M','099999000249','3M-CPS-LC','syringe of 4',4,false,false,730,'Color-change sealant — pink on placement, white when cured.'),
  ('preventive','Icon Caries Infiltrant, Proximal Kit','Icon','DMG America','099999000256','DMG-ICN-P','kit',1,false,false,730,'Micro-invasive resin infiltration for incipient lesions.'),
  -- Endodontics -------------------------------------------------------------
  ('endodontics','ProTaper Gold Rotary Files, Assorted 25mm','ProTaper','Dentsply Sirona','099999000263','DEN-PTG-25','pack of 6',6,false,false,1825,'Heat-treated NiTi with improved flexibility and cyclic fatigue resistance.'),
  ('endodontics','Gutta Percha Points, ProTaper Gold F2','Roeko','Coltene','099999000270','COL-GP-F2','box of 60',60,false,false,1825,'Matched taper obturation points.'),
  ('endodontics','AH Plus Root Canal Sealer','AH Plus','Dentsply Sirona','099999000287','DEN-AHP','kit',1,false,false,1095,'Epoxy resin sealer, low solubility.'),
  ('endodontics','Hedstrom Files, 25mm Assorted','Hedstrom','Kerr','099999000294','KRR-HF-25','pack of 6',6,false,false,1825,'Stainless hand files for retreatment and ledging.'),
  ('endodontics','Sodium Hypochlorite Irrigant 6%, 16 oz','Chlor-XTRA','Vista Apex','099999000300','VST-CX-16','16 oz bottle',1,false,false,730,'Surfactant-modified irrigant for improved tissue dissolution.'),
  ('endodontics','EDTA Solution 17%, 16 oz','SmearOFF','Vista Apex','099999000317','VST-SO-16','16 oz bottle',1,false,false,730,'Smear layer removal with chlorhexidine compatibility.'),
  -- Oral surgery ------------------------------------------------------------
  ('oral-surgery','Chromic Gut Suture 4-0, 27" Reverse Cutting','Perma','Ethicon','099999000324','ETH-CG-40','box of 12',12,false,false,1095,'Absorbable suture for extraction sites.'),
  ('oral-surgery','PTFE Suture 4-0, Non-Absorbable','Cytoplast','Osteogenics','099999000331','OST-PT-40','box of 12',12,false,false,1825,'Plaque-resistant monofilament for grafting cases.'),
  ('oral-surgery','Surgical Scalpel Blades #15, Sterile','Bard-Parker','Aspen Surgical','099999000348','ASP-BP-15','box of 100',100,false,false,1825,'Carbon steel sterile blades.'),
  ('oral-surgery','HemCon Dental Dressing','HemCon','Tricol Biomedical','099999000355','TRI-HC-DD','box of 10',10,false,false,1095,'Chitosan hemostatic dressing for anticoagulated patients.'),
  ('oral-surgery','Mineralized Cortical Bone Allograft, 0.5cc','MinerOss','BioHorizons','099999000362','BHZ-MO-05','vial',1,false,false,1825,'Particulate allograft for socket preservation.'),
  -- Implants ----------------------------------------------------------------
  ('implants','BLX Implant, Roxolid SLActive 4.0 x 10mm','BLX','Straumann','099999000379','STR-BLX-4010','each',1,false,false,1825,'Fully tapered implant for immediate protocols.'),
  ('implants','NobelActive Internal Implant 4.3 x 11.5mm','NobelActive','Nobel Biocare','099999000386','NOB-NA-4311','each',1,false,false,1825,'Dual-function drilling implant with high primary stability.'),
  ('implants','Healing Abutment 4.5 x 5mm','Straumann','Straumann','099999000393','STR-HA-4505','each',1,false,false,1825,'Titanium healing cap.'),
  ('implants','Implant Torque Wrench, Ratchet Style','Straumann','Straumann','099999000409','STR-TW-01','each',1,true,false,null,'Calibrated ratchet, requires annual verification.'),
  -- Orthodontics ------------------------------------------------------------
  ('orthodontics','Victory Series Metal Brackets, MBT .022 Case','Victory','3M','099999000416','3M-VS-MBT22','case',1,false,false,1825,'Pre-adjusted twin brackets, full case setup.'),
  ('orthodontics','NiTi Archwire .014 Upper','Unitek','3M','099999000423','3M-NT-014U','pack of 10',10,false,false,1825,'Superelastic nickel titanium for initial alignment.'),
  ('orthodontics','Orthodontic Elastics 1/4" Medium','Dentsply','Dentsply Sirona','099999000430','DEN-EL-14M','bag of 100',100,false,false,1095,'Latex intraoral elastics.'),
  -- Impression & lab ---------------------------------------------------------
  ('impression-lab','Aquasil Ultra+ Smart Wetting Impression Material, Heavy Body','Aquasil','Dentsply Sirona','099999000447','DEN-AQ-HB','box of 4',4,false,false,730,'VPS with hydrophilic behavior in a wet field.'),
  ('impression-lab','Take 1 Advanced Light Body VPS','Take 1','Kerr','099999000454','KRR-T1-LB','box of 4',4,false,false,730,'Fast-set wash material.'),
  ('impression-lab','Jeltrate Plus Alginate, Fast Set','Jeltrate','Dentsply Sirona','099999000461','DEN-JP-FS','1 lb pouch',1,false,false,730,'Dust-free alginate for study models.'),
  ('impression-lab','Disposable Impression Trays, Upper Medium','Miratray','Hager Worldwide','099999000478','HAG-MT-UM','bag of 12',12,false,false,1825,'Perforated plastic trays.'),
  ('impression-lab','Die Stone Type IV, Golden','Resin Rock','Whip Mix','099999000485','WM-RR-25','25 lb box',1,false,false,1095,'High-strength die stone for lab work.'),
  -- Anesthetics -------------------------------------------------------------
  ('anesthetics','Septocaine Articaine 4% with Epinephrine 1:100,000','Septocaine','Septodont','099999000492','SEP-ART-100','box of 50',50,false,true,730,'Articaine for infiltration and block anesthesia.'),
  ('anesthetics','Lidocaine 2% with Epinephrine 1:100,000','Cook-Waite','Septodont','099999000508','SEP-LID-100','box of 50',50,false,true,730,'Standard amide anesthetic cartridges.'),
  ('anesthetics','Dental Needles 27G Long, Sterile','Monoject','Cardinal Health','099999000515','CAR-MN-27L','box of 100',100,false,false,1825,'Tri-bevel needles for block injections.'),
  ('anesthetics','Topical Benzocaine Gel 20%, Cherry','Topicale','Sultan Healthcare','099999000522','SUL-TP-CH','1 oz jar',1,false,false,730,'Pre-injection topical anesthetic.'),
  -- Rotary & burs ------------------------------------------------------------
  ('rotary-burs','NeoDiamond Coarse Round End Taper, Sterile','NeoDiamond','Microcopy','099999000539','MC-ND-856','box of 25',25,false,false,1825,'Single-patient-use diamonds — no reprocessing cost.'),
  ('rotary-burs','Carbide Bur FG #245, Sterile','SS White','SS White Dental','099999000546','SSW-245','pack of 10',10,false,false,1825,'Amalgam and composite prep bur.'),
  ('rotary-burs','Two Striper Diamond, Coarse Flat End','Two Striper','Premier Dental','099999000553','PRM-TS-FE','pack of 5',5,false,false,1825,'Sintered diamonds with long cutting life.'),
  ('rotary-burs','Ti-Max Z900L Optic High-Speed Handpiece','Ti-Max','NSK','099999000560','NSK-Z900L','each',1,true,false,null,'Titanium body electric-quiet turbine with cellular optics.'),
  -- Imaging -----------------------------------------------------------------
  ('imaging','Digital Sensor Barrier Sleeves, Size 2','Crosstex','Crosstex International','099999000577','CTX-SB-2','box of 500',500,false,false,1825,'Protective sleeves for intraoral sensors.'),
  ('imaging','XIOS AE Digital Intraoral Sensor, Size 2','XIOS','Dentsply Sirona','099999000584','DEN-XIOS-2','each',1,true,false,null,'High-resolution direct USB sensor.'),
  ('imaging','Phosphor Storage Plates, Size 2','ScanX','Air Techniques','099999000591','AT-SX-2','pack of 4',4,false,false,1095,'Reusable imaging plates for PSP workflows.'),
  -- Whitening ---------------------------------------------------------------
  ('whitening','Opalescence PF 20% Take-Home Whitening, Mint','Opalescence','Ultradent','099999000607','ULT-OP-20M','patient kit',1,false,false,545,'Potassium nitrate and fluoride, sticky viscous gel.'),
  ('whitening','Opalescence Boost 40% In-Office Whitening','Opalescence','Ultradent','099999000614','ULT-OB-40','kit of 2',2,false,false,545,'Chemically activated — no light required.'),
  -- Disposables --------------------------------------------------------------
  ('disposables','Patient Bibs, 3-Ply, Blue','Crosstex','Crosstex International','099999000621','CTX-BIB-BL','case of 500',500,false,false,1825,'Poly-backed patient bibs.'),
  ('disposables','Saliva Ejectors, Clear with White Tip','Monoject','Cardinal Health','099999000638','CAR-SE-CL','bag of 100',100,false,false,1825,'Standard vented saliva ejectors.'),
  ('disposables','Cotton Rolls #2 Medium, Non-Sterile','Richmond','Richmond Dental','099999000645','RIC-CR-2','box of 2000',2000,false,false,1825,'High-absorbency cotton rolls.'),
  ('disposables','Gauze Sponges 2x2, 8-Ply, Non-Sterile','Dukal','Dukal','099999000652','DUK-GZ-22','box of 5000',5000,false,false,1825,'Woven gauze for surgical and routine use.'),
  ('disposables','Disposable Air/Water Syringe Tips','Zirc','Zirc Dental','099999000669','ZRC-AWT','bag of 250',250,false,false,1825,'Single-use triple syringe tips.'),
  -- Equipment ---------------------------------------------------------------
  ('equipment','M11 UltraClave Automatic Sterilizer','Midmark','Midmark','099999000676','MID-M11','each',1,true,false,null,'11" chamber automatic autoclave with printer port.'),
  ('equipment','STATIM 5000 G4 Cassette Autoclave','STATIM','SciCan','099999000683','SCI-ST5G4','each',1,true,false,null,'Rapid cassette sterilization for chairside turnaround.'),
  ('equipment','A-dec 500 Dental Chair Package','A-dec','A-dec','099999000690','ADC-500-PKG','each',1,true,false,null,'Operatory chair, delivery system and light package.'),
  ('equipment','Elite Oil-Free Dental Air Compressor, 5 User','DentalEZ','DentalEZ','099999000706','DEZ-AC-5U','each',1,true,false,null,'Oil-free compressor sized for five operatories.'),
  ('equipment','VALO Grand Cordless Curing Light','VALO','Ultradent','099999000713','ULT-VG-CL','each',1,true,false,null,'Broadband LED curing light with wide lens.'),
  ('equipment','Cavitron Plus Ultrasonic Scaler','Cavitron','Dentsply Sirona','099999000720','DEN-CAV-PL','each',1,true,false,null,'Magnetostrictive ultrasonic scaling unit.')
) as v(category, name, brand, manufacturer, gtin, mfr_sku, unit, pack_size, is_equipment, is_rx, shelf_life_days, description)
on conflict do nothing;

-- --------------------------------------------------------------------------
-- Supplier market
--
-- Every supplier gets an offer on every catalog item, priced off a base with
-- a per-supplier margin and a deterministic per-SKU jitter. That produces a
-- realistic spread — which is the whole point of the compare screen.
-- --------------------------------------------------------------------------
with base(mfr_sku, base_price) as (values
  ('MT-N-M', 28.99), ('MT-N-L', 28.99), ('CTX-L3-EL', 24.50), ('MTX-CW-160', 21.75),
  ('MTX-CC-24', 16.40), ('HAL-SP-35', 18.90), ('3M-SG-1243', 42.00), ('3M-AT-1262', 68.50),
  ('CTX-GN-L2', 59.00), ('3M-FSU-A2B', 92.00), ('3M-FSU-A3B', 92.00), ('3M-SBU-5', 148.00),
  ('ULT-UE-KIT', 64.00), ('KRR-OBFL', 189.00), ('KUR-SE2', 212.00), ('GC-F9-A2', 138.00),
  ('DEN-PV3-RF', 176.00), ('BIS-TC-LC', 96.00), ('3M-CVT-G', 34.50), ('3M-CP5-VAN', 88.00),
  ('3M-VAN-100', 264.00), ('DEN-NP-MM', 46.00), ('YNG-PA-SC', 32.50), ('3M-CPS-LC', 78.00),
  ('DMG-ICN-P', 398.00), ('DEN-PTG-25', 121.00), ('COL-GP-F2', 38.00), ('DEN-AHP', 92.00),
  ('KRR-HF-25', 19.50), ('VST-CX-16', 24.00), ('VST-SO-16', 36.00), ('ETH-CG-40', 78.00),
  ('OST-PT-40', 96.00), ('ASP-BP-15', 28.00), ('TRI-HC-DD', 189.00), ('BHZ-MO-05', 142.00),
  ('STR-BLX-4010', 412.00), ('NOB-NA-4311', 438.00), ('STR-HA-4505', 96.00), ('STR-TW-01', 486.00),
  ('3M-VS-MBT22', 168.00), ('3M-NT-014U', 62.00), ('DEN-EL-14M', 14.50), ('DEN-AQ-HB', 118.00),
  ('KRR-T1-LB', 104.00), ('DEN-JP-FS', 18.75), ('HAG-MT-UM', 22.00), ('WM-RR-25', 68.00),
  ('SEP-ART-100', 132.00), ('SEP-LID-100', 78.00), ('CAR-MN-27L', 32.00), ('SUL-TP-CH', 12.90),
  ('MC-ND-856', 42.00), ('SSW-245', 21.00), ('PRM-TS-FE', 58.00), ('NSK-Z900L', 1290.00),
  ('CTX-SB-2', 46.00), ('DEN-XIOS-2', 6480.00), ('AT-SX-2', 268.00), ('ULT-OP-20M', 24.50),
  ('ULT-OB-40', 96.00), ('CTX-BIB-BL', 42.00), ('CAR-SE-CL', 12.40), ('RIC-CR-2', 38.00),
  ('DUK-GZ-22', 46.00), ('ZRC-AWT', 28.50), ('MID-M11', 6890.00), ('SCI-ST5G4', 9450.00),
  ('ADC-500-PKG', 28500.00), ('DEZ-AC-5U', 5980.00), ('ULT-VG-CL', 1180.00), ('DEN-CAV-PL', 3480.00)
),
margin(slug, mult) as (values
  ('henry-schein', 1.11), ('patterson', 1.14), ('benco', 1.05),
  ('darby', 0.98),        ('net32', 0.88),     ('dental-city', 0.95), ('safco', 1.01)
)
insert into supplier_offers
  (product_id, supplier_id, supplier_sku, price, pack_size, in_stock, lead_days, product_url)
select
  p.id,
  s.id,
  upper(left(s.slug, 3)) || '-' || b.mfr_sku,
  round(
    (b.base_price * m.mult *
      (1 + ((abs(hashtext(b.mfr_sku || s.slug)) % 90)::numeric / 1000.0) - 0.045)
    )::numeric, 2),
  p.pack_size,
  -- roughly 1 in 12 offers is out of stock, deterministically
  (abs(hashtext(s.slug || b.mfr_sku)) % 12) <> 0,
  greatest(1, s.avg_lead_days + ((abs(hashtext(b.mfr_sku || s.slug)) % 3) - 1)),
  s.website
from base b
join products p  on p.mfr_sku = b.mfr_sku and p.practice_id is null
join margin  m   on true
join suppliers s on s.slug = m.slug
on conflict (product_id, supplier_id, supplier_sku) do nothing;
