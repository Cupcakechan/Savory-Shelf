-- ─────────────────────────────────────────────────────────
-- Shopping list categorization — schema change + backfill
-- ─────────────────────────────────────────────────────────
--
-- Run this once in the Supabase SQL Editor. Safe to re-run: the column
-- creation uses IF NOT EXISTS and each backfill UPDATE filters on
-- `category = 'other'` so previously-categorized rows are skipped.
--
-- Reversal: see the commented `DROP COLUMN` block at the bottom.
--
-- The backfill uses PostgreSQL word-boundary regex (`\y`) so substrings
-- like "egg" inside "eggplant" do NOT cause false positives. Hyphens are
-- replaced with spaces and diacritics stripped (via the unaccent
-- extension) before matching, mirroring the JS normalize() in
-- lib/shopping-categorizer.ts.
--
-- Category precedence: more-specific buckets run first so they can claim
-- compound terms before broader buckets (e.g. "tomato sauce" → pantry
-- before bare "tomato" → vegetables). The `category = 'other'` filter on
-- each UPDATE enforces single-assignment.


-- ── Step 0: enable unaccent (one-time) ─────────────────────
-- Strips Spanish/French diacritics before regex matching. If your
-- Supabase project doesn't permit this extension, remove the
-- `unaccent(...)` wrapper from each UPDATE below — Spanish accented
-- terms (azúcar, jamón) will then fall back to 'other' until manually
-- recategorized via the chip picker.

CREATE EXTENSION IF NOT EXISTS unaccent;


-- ── Step 1: add the column with CHECK constraint ───────────

ALTER TABLE shopping_list_items
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other'
CHECK (category IN (
  'vegetables', 'fruits', 'dairy', 'meat', 'seafood', 'pantry', 'spices', 'other'
));


-- ── Step 2: backfill existing rows ─────────────────────────
-- Order matters: pantry/spices/dairy/meat/seafood/fruits all claim their
-- compounds before vegetables (the most permissive bucket) runs last.


-- ── PANTRY (run first — owns the most compounds) ───────────

UPDATE shopping_list_items
SET category = 'pantry', updated_at = now()
WHERE category = 'other'
  AND lower(unaccent(replace(ingredient_name, '-', ' '))) ~ (
    '\y('
    -- Oils
    || 'extra virgin olive oil|olive oil|vegetable oil|canola oil|sesame oil|toasted sesame oil|coconut oil|avocado oil|peanut oil|sunflower oil|safflower oil|grapeseed oil|walnut oil|truffle oil|cooking spray|'
    -- Vinegars
    || 'apple cider vinegar|red wine vinegar|white wine vinegar|rice vinegar|balsamic vinegar|sherry vinegar|champagne vinegar|malt vinegar|cider vinegar|white vinegar|distilled vinegar|balsamic|vinegar|'
    -- Tomato products / pastas-sauces
    || 'sun dried tomatoes|sundried tomatoes|sun-dried tomatoes|sun dried tomato|sundried tomato|fire roasted tomatoes|fire-roasted tomatoes|crushed tomatoes|diced tomatoes|stewed tomatoes|whole tomatoes|canned tomatoes|canned tomato|tomato sauce|tomato paste|tomato puree|marinara sauce|marinara|pasta sauce|pizza sauce|salsa de tomate|pasta de tomate|pure de tomate|'
    -- Asian sauces / pastes
    || 'low sodium soy sauce|soy sauce|tamari|fish sauce|oyster sauce|hoisin sauce|hoisin|sriracha sauce|sriracha|gochujang|sambal oelek|doubanjiang|miso paste|white miso|red miso|miso|red curry paste|green curry paste|yellow curry paste|massaman curry paste|curry paste|harissa|mole paste|mole|salsa de soja|salsa de soya|salsa de pescado|salsa de ostras|'
    -- Other sauces / condiments
    || 'worcestershire sauce|worcestershire|hot sauce|tabasco|cholula|salsa verde|salsa roja|pico de gallo|honey mustard|dijon mustard|whole grain mustard|stone ground mustard|yellow mustard|dijon|mustard|mostaza|mayonnaise|mayonesa|mayo|ketchup|bbq sauce|barbecue sauce|pesto|nutella|chocolate spread|mantequilla de mani|mantequilla de cacahuete|peanut butter|almond butter|cashew butter|sunbutter|tahini|jam|jelly|preserves|preserve|marmalade|mermelada|jalea|conserva|'
    -- Flours
    || 'all purpose flour|whole wheat flour|whole-wheat flour|self rising flour|self-rising flour|bread flour|cake flour|pastry flour|almond flour|coconut flour|oat flour|rice flour|chickpea flour|tapioca flour|corn flour|harina de trigo|harina para todo uso|harina integral|harina de almendra|harina de coco|harina de maiz|harina|flour|cornmeal|corn meal|polenta|semolina|masa harina|masa|sémola|'
    -- Rice / grains
    || 'arroz basmati|arroz integral|arroz blanco|arroz jazmin|long grain rice|short grain rice|jasmine rice|basmati rice|arborio rice|sushi rice|brown rice|white rice|wild rice|basmati|arborio|arroz|rice|rolled oats|old fashioned oats|old-fashioned oats|steel cut oats|steel-cut oats|quick oats|instant oats|oats|oat|quinoa|pearl barley|barley|cebada|bulgur wheat|bulgur|israeli couscous|pearl couscous|couscous|cuscus|farro|millet|mijo|buckwheat|kasha|alforfon|amaranth|amaranto|avena|'
    -- Pasta
    || 'angel hair pasta|angel hair|elbow macaroni|pasta shells|lasagna noodles|lasagna noodle|egg noodles|egg noodle|rice noodles|rice noodle|ramen noodles|ramen noodle|soba noodles|soba noodle|udon noodles|udon noodle|cellophane noodles|cellophane noodle|vermicelli|spaghetti|spaghettini|capellini|penne|rigatoni|ziti|fusilli|rotini|farfalle|bowtie pasta|bowtie|macaroni|linguine|fettuccine|tagliatelle|pappardelle|lasagna|lasagne|orzo|ditalini|ramen|soba|udon|gnocchi|noquis|ravioli|tortellini|pasta|espagueti|espaguetis|fideos|fideo|'
    -- Bread products
    || 'english muffin|english muffins|whole grain bread|whole wheat bread|sourdough bread|white bread|bread crumbs|breadcrumbs|breadcrumb|panko breadcrumbs|panko|hamburger bun|hamburger buns|hot dog bun|hot dog buns|dinner roll|dinner rolls|corn tortilla|corn tortillas|flour tortilla|flour tortillas|pita bread|pan rallado|pan integral|pan blanco|sourdough|baguette|ciabatta|pita|naan|tortillas|tortilla|buns|bun|rolls|roll|croutons|crouton|picatostes|picatoste|panecillos|panecillo|bollos|bollo|bagels|bagel|bread|pan|'
    -- Beans / legumes
    || 'black eyed peas|black-eyed peas|black eyed pea|black-eyed pea|garbanzo beans|garbanzo bean|kidney beans|kidney bean|pinto beans|pinto bean|black beans|black bean|white beans|white bean|navy beans|navy bean|lima beans|lima bean|butter beans|butter bean|great northern beans|great northern|red lentils|green lentils|french lentils|red lentil|green lentil|french lentil|split peas|split pea|cannellini beans|cannellini bean|cannellini|chickpeas|chickpea|garbanzos|garbanzo|lentils|lentil|lentejas|lenteja|frijoles negros|frijoles pintos|frijoles|frijol|alubias|alubia|judias|judia|habas|haba|beans|bean|soybeans|soybean|soja|soya|edamame|tofu|tempeh|seitan|'
    -- Broth / stock / canned
    || 'vegetable broth|vegetable stock|chicken broth|chicken stock|beef broth|beef stock|veggie broth|bone broth|caldo de pollo|caldo de res|caldo de verduras|caldo|broth|stock|bouillon cube|bouillon cubes|bouillon|dashi stock|dashi|canned tuna|canned salmon|canned corn|canned beans|tuna en lata|atun en lata|coconut cream|coconut milk|'
    -- Sweeteners
    || 'sweetened condensed milk|condensed milk|evaporated milk|leche condensada|leche evaporada|dulce de leche|cajeta|maple syrup|pure maple syrup|jarabe de arce|agave nectar|agave syrup|agave|corn syrup|light corn syrup|dark corn syrup|simple syrup|granulated sugar|powdered sugar|confectioners sugar|icing sugar|cane sugar|brown sugar|light brown sugar|dark brown sugar|raw sugar|turbinado sugar|turbinado|demerara sugar|demerara|muscovado|white sugar|azucar morena|azucar glas|azucar en polvo|azucar|sugar|raw honey|clover honey|manuka honey|honey|miel|blackstrap molasses|molasses|melaza|stevia|monk fruit|sweetener|artificial sweetener|panela|piloncillo|sirope|jarabe|'
    -- Baking essentials
    || 'baking soda|baking powder|polvo para hornear|polvo de hornear|bicarbonato de sodio|bicarbonato|active dry yeast|instant yeast|fresh yeast|rapid rise yeast|levadura seca|levadura fresca|levadura|yeast|cornstarch|corn starch|maicena|fecula de maiz|almidon de maiz|arrowroot powder|arrowroot|unflavored gelatin|gelatin|gelatina|agar agar|agar-agar|agar|cream of tartar|xanthan gum|lecithin|dry milk|powdered milk|milk powder|dulce de leche|'
    -- Cocoa / chocolate / vanilla / coffee / tea
    || 'unsweetened cocoa|dutch process cocoa|cocoa powder|cacao en polvo|cocoa|cacao|semisweet chocolate|semi-sweet chocolate|bittersweet chocolate|unsweetened chocolate|baking chocolate|chocolate chips|chocolate chip|dark chocolate|milk chocolate|white chocolate|chocolate negro|chocolate con leche|chocolate blanco|chocolate|pure vanilla extract|vanilla extract|extracto de vainilla|vanilla paste|vanilla bean|vanilla beans|vainilla|vanilla|almond extract|peppermint extract|mint extract|rum extract|lemon extract|orange extract|espresso powder|instant coffee|ground coffee|coffee beans|coffee bean|espresso|coffee|cafe|matcha powder|matcha|green tea|black tea|herbal tea|chai|te verde|te negro|tea|te|'
    -- Dried fruits
    || 'dried cranberries|dried cranberry|dried apricots|dried apricot|dried cherries|dried cherry|dried mango|dried figs|dried fig|dried dates|dried date|medjool dates|medjool date|medjool|raisins|raisin|golden raisins|sultanas|pasas|pasa|prunes|prune|ciruelas pasas|ciruela pasa|craisins|craisin|orejones|orejon|datiles|datil|dates|date|shredded coconut|coconut flakes|dried coconut|desiccated coconut|coco rallado|coco deshidratado|'
    -- Pickles / olives / jarred
    || 'kalamata olives|kalamata olive|green olives|green olive|black olives|black olive|aceituna kalamata|aceitunas|aceituna|olives|olive|caperberries|caperberry|capers|caper|alcaparras|alcaparra|pickled jalapenos|pickled jalapeno|jarred jalapenos|jarred jalapeno|banana peppers|banana pepper|dill pickles|dill pickle|bread and butter pickles|bread and butter pickle|pickles|pickle|cornichons|cornichon|gherkins|gherkin|pepinillos|pepinillo|sauerkraut|chucrut|kimchi|tomates secos|tomate seco|'
    -- Crackers / cookies / snacks
    || 'graham crackers|graham cracker|saltines|saltine|crackers|cracker|cookies|cookie|biscotti|shortbread|biscuits|biscuit|galletas|galleta|tortilla chips|tortilla chip|potato chips|potato chip|chips|chip|pretzels|pretzel|popcorn kernels|popcorn kernel|popcorn|palomitas|granola bars|granola bar|granola|papas fritas|totopos|'
    -- Nuts / seeds
    || 'sliced almonds|slivered almonds|almonds|almond|walnuts|walnut|pecans|pecan|hazelnuts|hazelnut|peanuts|peanut|pistachios|pistachio|cashews|cashew|macadamia nuts|macadamia nut|macadamia|brazil nuts|brazil nut|pine nuts|pine nut|sunflower seeds|sunflower seed|pumpkin seeds|pumpkin seed|sesame seeds|sesame seed|ground flax|flaxseed|flax seeds|flax seed|chia seeds|chia seed|hemp hearts|hemp seeds|hemp seed|poppy seeds|poppy seed|nueces|nuez|almendras|almendra|avellanas|avellana|cacahuetes|cacahuete|mani|pistachos|pistacho|anacardos|anacardo|maranones|maranon|pinones|pinon|semillas de girasol|semilla de girasol|semillas de calabaza|semilla de calabaza|semillas de sesamo|semilla de sesamo|semillas de lino|semilla de lino|semillas de chia|semilla de chia|semillas de amapola|semilla de amapola|pepitas|pepita|nuts|nut|'
    -- Wine / spirits (cooking)
    || 'dry white wine|dry red wine|cooking wine|white wine|red wine|rose wine|vino tinto|vino blanco|vino para cocinar|vino|wine|dry sherry|sherry|jerez|port wine|port|oporto|dry vermouth|vermouth|vermut|marsala wine|marsala|cognac|brandy|dark rum|light rum|rum|ron|vodka|sake|mirin|stout|ale|lager|beer|cerveza|whisky|whiskey|scotch|bourbon|tequila|mezcal|'
    -- Dough / pastry / asian wrappers
    || 'puff pastry|hojaldre|phyllo dough|filo dough|phyllo|filo|masa filo|pie crusts|pie crust|pie shells|pie shell|pizza dough|masa de pizza|wonton wrappers|wonton wrapper|spring roll wrappers|spring roll wrapper|eggroll wrappers|eggroll wrapper'
    || ')\y'
  );


-- ── SPICES ─────────────────────────────────────────────────
-- Bare "pepper" is intentionally OMITTED — it conflicts with vegetables
-- compounds (bell pepper, jalapeno pepper, etc.). Only spice-specific
-- pepper forms claim rows here.

UPDATE shopping_list_items
SET category = 'spices', updated_at = now()
WHERE category = 'other'
  AND lower(unaccent(replace(ingredient_name, '-', ' '))) ~ (
    '\y('
    -- Pepper forms (no bare "pepper")
    || 'freshly ground black pepper|freshly ground pepper|cracked pepper|ground pepper|whole peppercorns|whole peppercorn|black peppercorns|black peppercorn|peppercorns|peppercorn|black pepper|white pepper|pink pepper|green peppercorns|green peppercorn|pimienta negra|pimienta blanca|pimienta molida|pimienta|'
    -- Salts
    || 'pink himalayan salt|himalayan salt|pink salt|kosher salt|sea salt|table salt|iodized salt|flaky salt|flaked salt|maldon salt|maldon|fleur de sel|rock salt|garlic salt|onion salt|celery salt|seasoning salt|seasoned salt|sal marina|sal de mar|sal gruesa|sal rosa|sal|salt|'
    -- Ground / specific spices
    || 'ground cinnamon|cinnamon sticks|cinnamon stick|ceylon cinnamon|cinnamon|canela molida|canela|ground cumin|cumin seeds|cumin seed|cumin|comino molido|comino|ground coriander|coriander seeds|coriander seed|coriander|smoked paprika|sweet paprika|hot paprika|spanish paprika|hungarian paprika|paprika|pimenton ahumado|pimenton dulce|pimenton picante|pimenton|ground turmeric|turmeric powder|curcuma molida|ground ginger|ginger powder|ginger paste|jengibre molido|jengibre en polvo|ground nutmeg|whole nutmeg|nutmeg|nuez moscada|ground cloves|whole cloves|clavos de olor|clavo molido|clavos|clavo|cloves|clove|ground allspice|allspice berries|allspice|pimienta de jamaica|ground cardamom|cardamom pods|cardamom pod|cardamom|cardamomo|ground mace|mace|fennel seeds|fennel seed|mustard seeds|mustard seed|yellow mustard seed|brown mustard seed|caraway seeds|caraway seed|caraway|saffron threads|saffron thread|saffron|azafran|ground sumac|sumac|star anise|anise seeds|anise seed|anise|anis estrellado|anis|fenugreek seeds|fenugreek seed|fenugreek|fenogreco|asafoetida|asafetida|hing|garam masala|madras curry powder|curry powder|ancho chili powder|chipotle chili powder|chipotle powder|chili powder|chile powder|polvo de chile|chile en polvo|ground cayenne|cayenne pepper|cayenne|crushed red pepper flakes|crushed red pepper|red pepper flakes|chili flakes|chili flake|granulated garlic|garlic powder|ajo en polvo|ajo molido|granulated onion|onion powder|cebolla en polvo|achiote|annatto powder|annatto|adobo seasoning|adobo|sazon goya|sazon|sazonador|'
    -- Seasoning blends
    || 'italian seasoning|herbes de provence|herbs de provence|za atar|zaatar|jerk seasoning|taco seasoning|ranch seasoning|old bay seasoning|old bay|cajun seasoning|creole seasoning|chinese five spice|five spice powder|five spice|five-spice|pumpkin pie spice|apple pie spice|everything bagel seasoning|everything seasoning|lemon pepper seasoning|lemon pepper|msg|ajinomoto|accent|'
    -- Dried herbs (bare names default here)
    || 'dried basil|dried oregano|mexican oregano|oregano seco|oregano|dried thyme|tomillo seco|tomillo|dried rosemary|romero seco|romero|dried sage|salvia|dried marjoram|marjoram|mejorana|dried dill|dill weed|eneldo seco|eneldo|dried mint|hierbabuena|menta|dried tarragon|estragon|tarragon|dried bay leaves|dried bay leaf|bay leaves|bay leaf|hojas de laurel|hoja de laurel|laurel|dried lavender|lavender|savory|chervil|basil|thyme|rosemary|sage|dill|'
    -- Other
    || 'wasabi paste|wasabi|prepared horseradish|horseradish|rabano picante|chili paste|chile paste|garlic paste'
    || ')\y'
  );


-- ── DAIRY ──────────────────────────────────────────────────

UPDATE shopping_list_items
SET category = 'dairy', updated_at = now()
WHERE category = 'other'
  AND lower(unaccent(replace(ingredient_name, '-', ' '))) ~ (
    '\y('
    -- Milks
    || 'whole milk|skim milk|two percent milk|one percent milk|almond milk|oat milk|soy milk|rice milk|cashew milk|hemp milk|half and half|leche entera|leche descremada|leche de almendra|leche de avena|leche de soja|leche de soya|leche de arroz|leche|milk|'
    -- Creams
    || 'heavy whipping cream|whipping cream|heavy cream|light cream|double cream|single cream|sour cream|crema agria|crema espesa|crema de leche|media crema|crema|nata para montar|nata|cream|'
    -- Butter
    || 'unsalted butter|salted butter|margarine|margarina|mantequilla clarificada|mantequilla|manteca|ghee|clarified butter|butter|'
    -- Cheese
    || 'cream cheese|queso crema|cottage cheese|requeson|cheddar cheese|sharp cheddar|mild cheddar|cheddar|fresh mozzarella|buffalo mozzarella|mozzarella|parmigiano reggiano|parmigiano|reggiano|parmesan|pecorino romano|pecorino|romano|ricotta|queso ricota|feta cheese|feta|brie|camembert|swiss cheese|swiss|gruyere|emmental|manchego|queso manchego|queso fresco|queso blanco|queso oaxaca|queso chihuahua|queso panela|monterey jack|jack cheese|pepper jack|colby jack|colby|blue cheese|queso azul|gorgonzola|roquefort|stilton|asiago|fontina|havarti|mascarpone|paneer|halloumi|burrata|provolone|cheese|queso|'
    -- Yogurt / cultured
    || 'greek yogurt|plain yogurt|vanilla yogurt|yogur griego|yogur natural|yogurt|yoghurt|yogur|buttermilk|suero de mantequilla|suero de leche|kefir|creme fraiche|'
    -- Eggs
    || 'extra large eggs|extra large egg|large eggs|large egg|egg whites|egg white|egg yolks|egg yolk|duck eggs|duck egg|quail eggs|quail egg|eggs|egg|huevos|huevo|claras de huevo|clara de huevo|yemas de huevo|yema de huevo|claras|clara|yemas|yema'
    || ')\y'
  );


-- ── MEAT ───────────────────────────────────────────────────

UPDATE shopping_list_items
SET category = 'meat', updated_at = now()
WHERE category = 'other'
  AND lower(unaccent(replace(ingredient_name, '-', ' '))) ~ (
    '\y('
    -- Beef
    || 'ground beef|lean ground beef|chuck roast|beef chuck|beef roast|beef tenderloin|tenderloin|filet mignon|ribeye steak|rib eye steak|ribeye|rib eye|sirloin steak|top sirloin|sirloin|brisket|beef short ribs|short ribs|short rib|beef stew meat|stew meat|stewing beef|flank steak|skirt steak|hanger steak|flat iron steak|porterhouse steak|porterhouse|t bone steak|t bone|beef patties|beef patty|hamburger meat|hamburger|oxtails|oxtail|beef cheek|carne de res|carne molida|carne picada|bistecs|bistec|bifes|bife|asado|arrachera|milanesas|milanesa|costillas|costilla|vacuno|res|falda|steak|beef|'
    -- Pork
    || 'pork tenderloin|pork shoulder|pork belly|pork loin|pork chops|pork chop|pork butt|boston butt|baby back ribs|baby back rib|spare ribs|spare rib|pork ribs|pork rib|ground pork|carne de cerdo|carne de puerco|lomo de cerdo|costilla de cerdo|costillas de cerdo|cerdo|puerco|spiral ham|cooked ham|jamon serrano|jamon iberico|jamon|prosciutto|thick cut bacon|turkey bacon|bacon|tocino|pancetta|panceta|italian sausage|breakfast sausage|sweet sausage|hot sausage|sausage|salchichas|salchicha|longanizas|longaniza|salchichon|spanish chorizo|mexican chorizo|chorizo|genoa salami|soppressata|salami|hot dogs|hot dog|frankfurters|frankfurter|wieners|wiener|kielbasa|andouille sausage|andouille|capicola|ham|pork|'
    -- Poultry
    || 'boneless skinless chicken breast|boneless chicken breast|boneless chicken thigh|boneless chicken thighs|chicken breasts|chicken breast|chicken thighs|chicken thigh|chicken wings|chicken wing|chicken drumsticks|chicken drumstick|chicken legs|chicken leg|whole chicken|rotisserie chicken|ground chicken|drumsticks|drumstick|pollo entero|pollo molido|pechugas de pollo|pechuga de pollo|pechugas|pechuga|muslos de pollo|muslo de pollo|muslos|muslo|alas de pollo|ala de pollo|alas|ala|pollo|chicken|'
    || 'whole turkey|turkey breast|ground turkey|pavo molido|pavo|turkey|whole duck|duck breast|duck legs|duck leg|pato|patos|duck|goose|cornish game hen|cornish hens|cornish hen|'
    -- Lamb / game / veal
    || 'leg of lamb|lamb shoulder|lamb shanks|lamb shank|lamb chops|lamb chop|ground lamb|cordero molido|chuleta de cordero|cordero|lamb|mutton|carnero|venison|venado|rabbit|conejo|bison|buffalo|bisonte|veal chop|ground veal|veal|ternera|'
    -- Processed
    || 'pepperoni|mortadella|mortadela|pastrami|corned beef|bologna|liverwurst|deli turkey|deli ham|sliced turkey|sliced ham|deli meat'
    || ')\y'
  );


-- ── SEAFOOD ────────────────────────────────────────────────

UPDATE shopping_list_items
SET category = 'seafood', updated_at = now()
WHERE category = 'other'
  AND lower(unaccent(replace(ingredient_name, '-', ' '))) ~ (
    '\y('
    -- Fish
    || 'smoked salmon|salmon fillets|salmon fillet|salmon ahumado|salmon|tuna steaks|tuna steak|ahi tuna|tuna|atun|cod fillets|cod fillet|cod|bacalao|halibut|fletan|fletán|tilapia|rainbow trout|trout|trucha|truchas|chilean sea bass|striped bass|sea bass|bass|lubina|robalo|red snapper|snapper|dorada|mahi mahi|mahi-mahi|mahi|swordfish|pez espada|mackerel|caballa|anchovies|anchovy|anchoas|anchoa|sardines|sardine|sardinas|sardina|pickled herring|herring|arenque|haddock|pollock|catfish|monkfish|perch|flounder|dover sole|sole|branzino|lox|gravlax|fish fillets|fish fillet|fish|pescado|mero|'
    -- Shellfish
    || 'jumbo shrimp|shrimp|camarones|camaron|gambas|gamba|langostinos|langostino|prawns|prawn|lobster tails|lobster tail|lobster|langostas|langosta|crab meat|crabmeat|lump crab|king crab|crab|cangrejos|cangrejo|jaibas|jaiba|crawfish|crayfish|'
    -- Mollusks
    || 'clams|clam|almejas|almeja|mussels|mussel|mejillones|mejillon|oysters|oyster|ostras|ostra|ostiones|ostion|sea scallops|sea scallop|bay scallops|bay scallop|scallops|scallop|vieiras|vieira|callo de hacha|squid|calamares|calamar|calamari|octopus|pulpos|pulpo|'
    -- Other
    || 'salmon roe|tobiko|caviar|roe|surimi|imitation crab'
    || ')\y'
  );


-- ── FRUITS ─────────────────────────────────────────────────

UPDATE shopping_list_items
SET category = 'fruits', updated_at = now()
WHERE category = 'other'
  AND lower(unaccent(replace(ingredient_name, '-', ' '))) ~ (
    '\y('
    -- Pome / quince
    || 'apples|apple|manzanas|manzana|pears|pear|peras|pera|quince|membrillo|'
    -- Citrus
    || 'mandarin orange|grapefruits|grapefruit|toronja|toronjas|pomelo|pomelos|clementines|clementine|tangerines|tangerine|mandarinas|mandarina|mandarins|mandarin|oranges|orange|naranjas|naranja|lemons|lemon|limones|limon|limes|lime|limas|lima|'
    -- Berries
    || 'strawberries|strawberry|fresas|fresa|raspberries|raspberry|frambuesas|frambuesa|blueberries|blueberry|blackberries|blackberry|zarzamoras|zarzamora|moras|mora|cranberries|cranberry|arandanos|arandano|gooseberries|gooseberry|grosellas|grosella|currants|currant|berries|berry|'
    -- Stone
    || 'peaches|peach|melocotones|melocoton|duraznos|durazno|nectarines|nectarine|nectarinas|nectarina|plums|plum|ciruelas|ciruela|apricots|apricot|albaricoques|albaricoque|chabacanos|chabacano|sweet cherry|sour cherry|cherries|cherry|cerezas|cereza|'
    -- Tropical
    || 'bananas|banana|platanos|platano|mangoes|mangos|mango|pineapples|pineapple|pina|ananas|papayas|papaya|passion fruit|passionfruit|maracuya|fruta de la pasion|guavas|guava|guayabas|guayaba|dragon fruit|dragonfruit|pitaya|pitahaya|kiwifruit|kiwis|kiwi|coconuts|coconut|cocos|coco|lychees|lychee|longan|rambutan|'
    -- Melons
    || 'watermelon|sandias|sandia|cantaloupe|honeydew|melon cantalupo|melon de miel|melons|melon|'
    -- Grapes / figs / fresh dates
    || 'grapes|grape|uvas|uva|fresh figs|fresh fig|figs|fig|higos|higo|fresh dates|fresh date|datiles frescos|datil fresco|'
    -- Other
    || 'pomegranates|pomegranate|granadas|granada|persimmons|persimmon|caquis|caqui|rhubarb|ruibarbo|starfruit|star fruit|carambola'
    || ')\y'
  );


-- ── VEGETABLES (run last — the most permissive bucket) ─────

UPDATE shopping_list_items
SET category = 'vegetables', updated_at = now()
WHERE category = 'other'
  AND lower(unaccent(replace(ingredient_name, '-', ' '))) ~ (
    '\y('
    -- Alliums
    || 'green onions|green onion|spring onions|spring onion|scallions|scallion|leeks|leek|shallots|shallot|garlic cloves|garlic clove|dientes de ajo|diente de ajo|chives|chive|ramps|ramp|cebollas|cebolla|cebolleta|cebolletas|cebollin|cebollino|puerros|puerro|chalotas|chalota|onions|onion|garlic|ajos|ajo|'
    -- Brassicas
    || 'brussel sprouts|brussel sprout|brussels sprouts|brussels sprout|coles de bruselas|broccolini|broccoli|brocoli|brocolis|cauliflower|coliflor|coliflores|red cabbage|green cabbage|napa cabbage|savoy cabbage|cabbage|repollo|repollos|coles|col|kale|collard greens|collards|collard|berza|bok choy|pak choi|arugula|rocket|rucula|watercress|berros|berro|mustard greens|turnip greens|'
    -- Greens / lettuces
    || 'romaine lettuce|butter lettuce|bibb lettuce|iceberg lettuce|romaine|lechuga romana|iceberg|lettuce|lechugas|lechuga|baby spinach|spinach|espinacas|espinaca|swiss chard|chard|acelgas|acelga|endive|endivia|escarole|escarola|radicchio|achicoria|mesclun|mixed greens|salad mix|'
    -- Roots / carrot family
    || 'baby carrots|baby carrot|carrots|carrot|zanahorias|zanahoria|parsnips|parsnip|chirivia|celery stalks|celery stalk|celery|apio|celeriac|celery root|apionabo|apio nabo|fennel bulb|fennel|hinojo|'
    -- Tomato / peppers
    || 'cherry tomatoes|cherry tomato|grape tomatoes|grape tomato|plum tomatoes|plum tomato|roma tomatoes|roma tomato|beefsteak tomatoes|beefsteak tomato|tomatoes|tomato|tomates|tomate|jitomates|jitomate|tomatillos|tomatillo|bell peppers|bell pepper|red pepper|green pepper|yellow pepper|orange pepper|capsicum|pimientos|pimiento|morron|jalapenos|jalapeno|serrano|poblano|habanero|anaheim|fresno pepper|thai chile|thai chili|chiles|chile|chilies|chilis|chili|aji amarillo|ajies|aji|'
    -- Cucurbits
    || 'persian cucumber|cucumbers|cucumber|pepinos|pepino|zucchinis|zucchini|courgettes|courgette|calabacines|calabacin|zapallito|yellow squash|summer squash|butternut squash|butternut|acorn squash|spaghetti squash|delicata squash|kabocha squash|kabocha|pumpkins|pumpkin|calabazas|calabaza|zapallo|auyama|'
    -- Tubers
    || 'baby potatoes|baby potato|russet potatoes|russet potato|russet|yukon gold|red potatoes|red potato|fingerling potatoes|fingerling potato|fingerling|potatoes|potato|papas|papa|patatas|patata|sweet potatoes|sweet potato|yams|yam|batatas|batata|boniato|camotes|camote|turnips|turnip|nabos|nabo|name|beetroot|beets|beet|remolachas|remolacha|betabeles|betabel|radishes|radish|rabanos|rabano|rabanitos|rabanito|rutabagas|rutabaga|daikon radish|daikon|jicama|yuca|mandioca|cassava|taro|'
    -- Other
    || 'eggplants|eggplant|aubergines|aubergine|berenjenas|berenjena|asparagus|esparragos|esparrago|artichoke hearts|artichoke heart|artichokes|artichoke|alcachofas|alcachofa|button mushroom|cremini mushrooms|cremini mushroom|cremini|portobello|portabello|shiitake|oyster mushroom|mushrooms|mushroom|hongos|hongo|champinones|champinon|setas|seta|corn on the cob|sweet corn|corn|maiz|choclo|elotes|elote|sugar snap peas|sugar snap pea|snap peas|snap pea|snow peas|snow pea|peas|pea|guisantes|guisante|arvejas|arveja|chicharos|chicharo|string beans|string bean|green beans|green bean|judias verdes|judia verde|ejotes|ejote|vainitas|vainita|fresh edamame|okra|gombo|quingombo|plantains|plantain|platano verde|bean sprouts|bean sprout|sprouts|sprout|brotes de soja|brote de soja|water chestnuts|water chestnut|castana de agua|bamboo shoots|bamboo shoot|brote de bambu|fresh ginger|ginger root|ginger|jengibre|fresh turmeric|curcuma|galangal|galanga|avocados|avocado|aguacates|aguacate|paltas|palta|'
    -- Fresh herbs
    || 'fresh basil|fresh flat leaf parsley|fresh italian parsley|fresh parsley|fresh cilantro|fresh coriander|fresh mint|fresh dill|fresh chives|fresh thyme|fresh rosemary|fresh oregano|fresh sage|fresh tarragon|fresh marjoram|albahaca fresca|perejil fresco|cilantro fresco|menta fresca|hierbabuena fresca|eneldo fresco|tomillo fresco|romero fresco|oregano fresco|salvia fresca|lemongrass|lemon grass|hierba limon|citronela|kaffir lime leaves|kaffir lime leaf|curry leaves|curry leaf|cilantro|parsley|perejil'
    || ')\y'
  );


-- ── Step 3: verification (read-only — safe to run anytime) ──
-- Inspect the result; rows still in 'other' need manual recategorization
-- via the chip picker in the app.

-- SELECT category, count(*) FROM shopping_list_items GROUP BY category ORDER BY count DESC;
-- SELECT ingredient_name FROM shopping_list_items WHERE category = 'other' ORDER BY ingredient_name LIMIT 50;


-- ── Reversal (commented — uncomment only to undo) ──────────
-- ALTER TABLE shopping_list_items DROP COLUMN category;
