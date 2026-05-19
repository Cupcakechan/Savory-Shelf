// Pure lexical categorizer for shopping-list items. No I/O, no AI, no async.
// Given an ingredient name in English or Spanish, returns one of eight kitchen
// categories. Unknown inputs fall back to 'other'. Used by:
//   - lib/shopping-aggregator.ts (sets category on inserts)
//   - app/shopping-list/[id]/page.tsx (grouped rendering, picker, custom-item add)
//
// Matching is whitespace-bounded substring against a longest-key-first
// dictionary, so compound terms ("tomato sauce" → pantry) beat bare singles
// ("tomato" → vegetables). Pluralized forms common to each language are listed
// explicitly rather than algorithmically derived — small dictionary cost,
// large reliability win.
//
// SECURITY NOTE: the dictionary is hardcoded; no user-controlled regex is
// compiled at runtime. The matcher uses plain String methods (`===`,
// `startsWith`, `endsWith`, `includes`) on already-normalized text. Spanish
// diacritics are NFD-decomposed and stripped via a fixed `[\u0300-\u036f]`
// range, which is a Unicode-defined block, not user input. There is no PII
// flow, no logging of ingredient text, and no network or filesystem access.

export type Category =
  | 'vegetables'
  | 'fruits'
  | 'dairy'
  | 'meat'
  | 'seafood'
  | 'pantry'
  | 'spices'
  | 'other'

/** Display labels — used by section headers, the chip, and the picker. */
export const CATEGORY_LABELS: Record<Category, string> = {
  vegetables: 'Vegetables',
  fruits:     'Fruits',
  dairy:      'Dairy',
  meat:       'Meat',
  seafood:    'Seafood',
  pantry:     'Pantry',
  spices:     'Spices',
  other:      'Other',
}

/** Render order — used by the shopping list page and the print view. */
export const CATEGORY_ORDER: readonly Category[] = [
  'vegetables', 'fruits', 'dairy', 'meat', 'seafood', 'pantry', 'spices', 'other',
] as const

// ── Dictionary ────────────────────────────────────────────
//
// Keys are normalized exactly the way `normalize()` produces them:
// lowercase, no accents, letters and single spaces only. EN and ES entries
// coexist in one table; bilingual coverage is intentional for users
// importing Spanish-language recipes without translating.

const DICT: Record<string, Category> = {
  // ── VEGETABLES ──────────────────────────────────────────

  // Alliums (EN)
  'onion': 'vegetables', 'onions': 'vegetables',
  'green onion': 'vegetables', 'green onions': 'vegetables',
  'scallion': 'vegetables', 'scallions': 'vegetables',
  'spring onion': 'vegetables', 'spring onions': 'vegetables',
  'leek': 'vegetables', 'leeks': 'vegetables',
  'shallot': 'vegetables', 'shallots': 'vegetables',
  'garlic': 'vegetables', 'garlic clove': 'vegetables', 'garlic cloves': 'vegetables',
  'chive': 'vegetables', 'chives': 'vegetables',
  'ramp': 'vegetables', 'ramps': 'vegetables',
  // Alliums (ES)
  'cebolla': 'vegetables', 'cebollas': 'vegetables',
  'cebolla verde': 'vegetables', 'cebolleta': 'vegetables', 'cebolletas': 'vegetables',
  'cebollin': 'vegetables', 'cebollino': 'vegetables',
  'puerro': 'vegetables', 'puerros': 'vegetables',
  'chalota': 'vegetables', 'chalotas': 'vegetables',
  'ajo': 'vegetables', 'ajos': 'vegetables',
  'diente de ajo': 'vegetables', 'dientes de ajo': 'vegetables',

  // Brassicas (EN)
  'broccoli': 'vegetables', 'broccolini': 'vegetables',
  'cauliflower': 'vegetables',
  'cabbage': 'vegetables', 'red cabbage': 'vegetables', 'green cabbage': 'vegetables', 'napa cabbage': 'vegetables', 'savoy cabbage': 'vegetables',
  'brussels sprout': 'vegetables', 'brussels sprouts': 'vegetables', 'brussel sprout': 'vegetables', 'brussel sprouts': 'vegetables',
  'kale': 'vegetables',
  'collard': 'vegetables', 'collards': 'vegetables', 'collard greens': 'vegetables',
  'bok choy': 'vegetables', 'pak choi': 'vegetables',
  'arugula': 'vegetables', 'rocket': 'vegetables',
  'watercress': 'vegetables',
  'mustard greens': 'vegetables', 'turnip greens': 'vegetables',
  // Brassicas (ES)
  'brocoli': 'vegetables', 'brocolis': 'vegetables',
  'coliflor': 'vegetables', 'coliflores': 'vegetables',
  'repollo': 'vegetables', 'repollos': 'vegetables',
  'col': 'vegetables', 'coles': 'vegetables',
  'coles de bruselas': 'vegetables',
  'berza': 'vegetables', 'rucula': 'vegetables', 'berro': 'vegetables', 'berros': 'vegetables',

  // Greens & lettuces (EN)
  'lettuce': 'vegetables', 'romaine': 'vegetables', 'romaine lettuce': 'vegetables',
  'iceberg': 'vegetables', 'iceberg lettuce': 'vegetables',
  'butter lettuce': 'vegetables', 'bibb lettuce': 'vegetables',
  'spinach': 'vegetables', 'baby spinach': 'vegetables',
  'chard': 'vegetables', 'swiss chard': 'vegetables',
  'endive': 'vegetables', 'escarole': 'vegetables', 'radicchio': 'vegetables',
  'mesclun': 'vegetables', 'mixed greens': 'vegetables', 'salad mix': 'vegetables',
  // Greens & lettuces (ES)
  'lechuga': 'vegetables', 'lechugas': 'vegetables',
  'romana': 'vegetables', 'lechuga romana': 'vegetables',
  'espinaca': 'vegetables', 'espinacas': 'vegetables',
  'acelga': 'vegetables', 'acelgas': 'vegetables',
  'escarola': 'vegetables', 'endivia': 'vegetables', 'achicoria': 'vegetables',

  // Carrots / celery / fennel (EN+ES)
  'carrot': 'vegetables', 'carrots': 'vegetables', 'baby carrot': 'vegetables', 'baby carrots': 'vegetables',
  'parsnip': 'vegetables', 'parsnips': 'vegetables',
  'celery': 'vegetables', 'celery stalk': 'vegetables', 'celery stalks': 'vegetables',
  'celeriac': 'vegetables', 'celery root': 'vegetables',
  'fennel': 'vegetables', 'fennel bulb': 'vegetables',
  'zanahoria': 'vegetables', 'zanahorias': 'vegetables',
  'chirivia': 'vegetables', 'apio': 'vegetables', 'apionabo': 'vegetables', 'apio nabo': 'vegetables',
  'hinojo': 'vegetables',

  // Tomatoes / peppers (EN+ES)
  // Note: bare "pepper" → spices (black pepper assumption). "bell pepper" → vegetables.
  'tomato': 'vegetables', 'tomatoes': 'vegetables',
  'cherry tomato': 'vegetables', 'cherry tomatoes': 'vegetables',
  'grape tomato': 'vegetables', 'grape tomatoes': 'vegetables',
  'plum tomato': 'vegetables', 'plum tomatoes': 'vegetables',
  'roma tomato': 'vegetables', 'roma tomatoes': 'vegetables',
  'beefsteak tomato': 'vegetables', 'beefsteak tomatoes': 'vegetables',
  'bell pepper': 'vegetables', 'bell peppers': 'vegetables',
  'red pepper': 'vegetables', 'green pepper': 'vegetables', 'yellow pepper': 'vegetables', 'orange pepper': 'vegetables',
  'capsicum': 'vegetables',
  'jalapeno': 'vegetables', 'jalapenos': 'vegetables', 'jalapeno pepper': 'vegetables',
  'serrano': 'vegetables', 'serrano pepper': 'vegetables',
  'poblano': 'vegetables', 'poblano pepper': 'vegetables',
  'habanero': 'vegetables', 'habanero pepper': 'vegetables',
  'anaheim': 'vegetables', 'anaheim pepper': 'vegetables',
  'chile': 'vegetables', 'chiles': 'vegetables', 'chili': 'vegetables', 'chilies': 'vegetables', 'chilis': 'vegetables',
  'fresno pepper': 'vegetables', 'thai chile': 'vegetables', 'thai chili': 'vegetables',
  'tomate': 'vegetables', 'tomates': 'vegetables',
  'jitomate': 'vegetables', 'jitomates': 'vegetables',
  'tomatillo': 'vegetables', 'tomatillos': 'vegetables',
  'pimiento': 'vegetables', 'pimientos': 'vegetables',
  'morron': 'vegetables', 'pimiento morron': 'vegetables',
  'aji': 'vegetables', 'ajies': 'vegetables', 'aji amarillo': 'vegetables',

  // Cucurbits / squash (EN+ES)
  'cucumber': 'vegetables', 'cucumbers': 'vegetables', 'persian cucumber': 'vegetables',
  'zucchini': 'vegetables', 'zucchinis': 'vegetables', 'courgette': 'vegetables', 'courgettes': 'vegetables',
  'yellow squash': 'vegetables', 'summer squash': 'vegetables',
  'butternut': 'vegetables', 'butternut squash': 'vegetables',
  'acorn squash': 'vegetables', 'spaghetti squash': 'vegetables', 'delicata squash': 'vegetables',
  'kabocha': 'vegetables', 'kabocha squash': 'vegetables',
  'pumpkin': 'vegetables', 'pumpkins': 'vegetables',
  'pepino': 'vegetables', 'pepinos': 'vegetables',
  'calabacin': 'vegetables', 'calabacines': 'vegetables', 'zapallito': 'vegetables',
  'calabaza': 'vegetables', 'calabazas': 'vegetables', 'zapallo': 'vegetables', 'auyama': 'vegetables',

  // Roots & tubers (EN+ES)
  'potato': 'vegetables', 'potatoes': 'vegetables', 'baby potato': 'vegetables', 'baby potatoes': 'vegetables',
  'russet': 'vegetables', 'russet potato': 'vegetables', 'russet potatoes': 'vegetables',
  'yukon gold': 'vegetables', 'red potato': 'vegetables', 'red potatoes': 'vegetables',
  'fingerling': 'vegetables', 'fingerling potato': 'vegetables', 'fingerling potatoes': 'vegetables',
  'sweet potato': 'vegetables', 'sweet potatoes': 'vegetables', 'yam': 'vegetables', 'yams': 'vegetables',
  'turnip': 'vegetables', 'turnips': 'vegetables',
  'beet': 'vegetables', 'beets': 'vegetables', 'beetroot': 'vegetables',
  'radish': 'vegetables', 'radishes': 'vegetables',
  'rutabaga': 'vegetables', 'rutabagas': 'vegetables',
  'daikon': 'vegetables', 'daikon radish': 'vegetables',
  'jicama': 'vegetables',
  'yuca': 'vegetables', 'mandioca': 'vegetables', 'cassava': 'vegetables',
  'taro': 'vegetables',
  'papa': 'vegetables', 'papas': 'vegetables',
  'patata': 'vegetables', 'patatas': 'vegetables',
  'batata': 'vegetables', 'batatas': 'vegetables', 'boniato': 'vegetables', 'camote': 'vegetables', 'camotes': 'vegetables',
  'name': 'vegetables', 'nabo': 'vegetables', 'nabos': 'vegetables',
  'remolacha': 'vegetables', 'remolachas': 'vegetables', 'betabel': 'vegetables', 'betabeles': 'vegetables',
  'rabano': 'vegetables', 'rabanos': 'vegetables', 'rabanito': 'vegetables', 'rabanitos': 'vegetables',

  // Other common vegetables (EN+ES)
  'eggplant': 'vegetables', 'eggplants': 'vegetables', 'aubergine': 'vegetables', 'aubergines': 'vegetables',
  'asparagus': 'vegetables',
  'artichoke': 'vegetables', 'artichokes': 'vegetables', 'artichoke heart': 'vegetables', 'artichoke hearts': 'vegetables',
  'mushroom': 'vegetables', 'mushrooms': 'vegetables',
  'button mushroom': 'vegetables', 'cremini': 'vegetables', 'cremini mushroom': 'vegetables', 'cremini mushrooms': 'vegetables',
  'portobello': 'vegetables', 'portabello': 'vegetables', 'shiitake': 'vegetables', 'oyster mushroom': 'vegetables',
  'corn': 'vegetables', 'sweet corn': 'vegetables', 'corn on the cob': 'vegetables',
  'pea': 'vegetables', 'peas': 'vegetables', 'snap pea': 'vegetables', 'snap peas': 'vegetables', 'sugar snap pea': 'vegetables', 'sugar snap peas': 'vegetables', 'snow pea': 'vegetables', 'snow peas': 'vegetables',
  'green bean': 'vegetables', 'green beans': 'vegetables', 'string bean': 'vegetables', 'string beans': 'vegetables',
  'fresh edamame': 'vegetables',
  'okra': 'vegetables',
  'plantain': 'vegetables', 'plantains': 'vegetables',
  'bean sprout': 'vegetables', 'bean sprouts': 'vegetables', 'sprout': 'vegetables', 'sprouts': 'vegetables',
  'water chestnut': 'vegetables', 'water chestnuts': 'vegetables',
  'bamboo shoot': 'vegetables', 'bamboo shoots': 'vegetables',
  'ginger': 'vegetables', 'fresh ginger': 'vegetables', 'ginger root': 'vegetables',
  'turmeric': 'vegetables', 'fresh turmeric': 'vegetables',
  'galangal': 'vegetables',
  'avocado': 'vegetables', 'avocados': 'vegetables',
  'olive': 'vegetables', // raw olives — but jarred go to pantry via "olives"
  'berenjena': 'vegetables', 'berenjenas': 'vegetables',
  'esparrago': 'vegetables', 'esparragos': 'vegetables',
  'alcachofa': 'vegetables', 'alcachofas': 'vegetables',
  'hongo': 'vegetables', 'hongos': 'vegetables', 'champinon': 'vegetables', 'champinones': 'vegetables', 'seta': 'vegetables', 'setas': 'vegetables',
  'maiz': 'vegetables', 'choclo': 'vegetables', 'elote': 'vegetables', 'elotes': 'vegetables',
  'guisante': 'vegetables', 'guisantes': 'vegetables', 'arveja': 'vegetables', 'arvejas': 'vegetables', 'chicharo': 'vegetables', 'chicharos': 'vegetables',
  'judia verde': 'vegetables', 'judias verdes': 'vegetables', 'ejote': 'vegetables', 'ejotes': 'vegetables', 'vainita': 'vegetables', 'vainitas': 'vegetables',
  'gombo': 'vegetables', 'quingombo': 'vegetables',
  'platano verde': 'vegetables',
  'brote de soja': 'vegetables', 'brotes de soja': 'vegetables',
  'jengibre': 'vegetables', 'curcuma': 'vegetables',
  'aguacate': 'vegetables', 'aguacates': 'vegetables', 'palta': 'vegetables', 'paltas': 'vegetables',

  // Fresh herbs (EN+ES) — fresh form → vegetables; bare form defaults to spices (see below)
  'fresh basil': 'vegetables',
  'fresh parsley': 'vegetables', 'fresh flat leaf parsley': 'vegetables', 'fresh flat-leaf parsley': 'vegetables', 'fresh italian parsley': 'vegetables',
  'fresh cilantro': 'vegetables', 'fresh coriander': 'vegetables',
  'fresh mint': 'vegetables',
  'fresh dill': 'vegetables',
  'fresh chives': 'vegetables',
  'fresh thyme': 'vegetables',
  'fresh rosemary': 'vegetables',
  'fresh oregano': 'vegetables',
  'fresh sage': 'vegetables',
  'fresh tarragon': 'vegetables',
  'fresh marjoram': 'vegetables',
  'lemongrass': 'vegetables', 'lemon grass': 'vegetables',
  'kaffir lime leaf': 'vegetables', 'kaffir lime leaves': 'vegetables',
  'curry leaf': 'vegetables', 'curry leaves': 'vegetables',
  'albahaca fresca': 'vegetables', 'perejil fresco': 'vegetables', 'cilantro fresco': 'vegetables',
  'menta fresca': 'vegetables', 'hierbabuena fresca': 'vegetables', 'eneldo fresco': 'vegetables',
  'tomillo fresco': 'vegetables', 'romero fresco': 'vegetables', 'oregano fresco': 'vegetables', 'salvia fresca': 'vegetables',
  'hierba limon': 'vegetables', 'citronela': 'vegetables',
  // Cilantro alone — almost always fresh in recipes; classify as vegetables (override the herb-default).
  'cilantro': 'vegetables', 'parsley': 'vegetables',


  // ── FRUITS ──────────────────────────────────────────────

  'apple': 'fruits', 'apples': 'fruits',
  'pear': 'fruits', 'pears': 'fruits',
  'quince': 'fruits', 'quinces': 'fruits',
  'manzana': 'fruits', 'manzanas': 'fruits',
  'pera': 'fruits', 'peras': 'fruits',
  'membrillo': 'fruits',

  // Citrus
  'orange': 'fruits', 'oranges': 'fruits',
  'lemon': 'fruits', 'lemons': 'fruits',
  'lime': 'fruits', 'limes': 'fruits',
  'grapefruit': 'fruits', 'grapefruits': 'fruits',
  'mandarin': 'fruits', 'mandarins': 'fruits', 'mandarin orange': 'fruits',
  'clementine': 'fruits', 'clementines': 'fruits',
  'tangerine': 'fruits', 'tangerines': 'fruits',
  'naranja': 'fruits', 'naranjas': 'fruits',
  'limon': 'fruits', 'limones': 'fruits', 'lima': 'fruits', 'limas': 'fruits',
  'toronja': 'fruits', 'toronjas': 'fruits', 'pomelo': 'fruits', 'pomelos': 'fruits',
  'mandarina': 'fruits', 'mandarinas': 'fruits',

  // Berries
  'strawberry': 'fruits', 'strawberries': 'fruits',
  'raspberry': 'fruits', 'raspberries': 'fruits',
  'blueberry': 'fruits', 'blueberries': 'fruits',
  'blackberry': 'fruits', 'blackberries': 'fruits',
  'cranberry': 'fruits', 'cranberries': 'fruits',
  'gooseberry': 'fruits', 'gooseberries': 'fruits',
  'currant': 'fruits', 'currants': 'fruits',
  'berry': 'fruits', 'berries': 'fruits',
  'fresa': 'fruits', 'fresas': 'fruits',
  'frambuesa': 'fruits', 'frambuesas': 'fruits',
  'arandano': 'fruits', 'arandanos': 'fruits',
  'mora': 'fruits', 'moras': 'fruits', 'zarzamora': 'fruits', 'zarzamoras': 'fruits',
  'grosella': 'fruits', 'grosellas': 'fruits',

  // Stone fruits
  'peach': 'fruits', 'peaches': 'fruits',
  'nectarine': 'fruits', 'nectarines': 'fruits',
  'plum': 'fruits', 'plums': 'fruits',
  'apricot': 'fruits', 'apricots': 'fruits',
  'cherry': 'fruits', 'cherries': 'fruits', 'sweet cherry': 'fruits', 'sour cherry': 'fruits',
  'melocoton': 'fruits', 'melocotones': 'fruits', 'durazno': 'fruits', 'duraznos': 'fruits',
  'nectarina': 'fruits', 'nectarinas': 'fruits',
  'ciruela': 'fruits', 'ciruelas': 'fruits',
  'albaricoque': 'fruits', 'albaricoques': 'fruits', 'chabacano': 'fruits', 'chabacanos': 'fruits',
  'cereza': 'fruits', 'cerezas': 'fruits',

  // Tropical
  'banana': 'fruits', 'bananas': 'fruits',
  'mango': 'fruits', 'mangoes': 'fruits', 'mangos': 'fruits',
  'pineapple': 'fruits', 'pineapples': 'fruits',
  'papaya': 'fruits', 'papayas': 'fruits',
  'passion fruit': 'fruits', 'passionfruit': 'fruits',
  'guava': 'fruits', 'guavas': 'fruits',
  'dragon fruit': 'fruits', 'dragonfruit': 'fruits',
  'kiwi': 'fruits', 'kiwis': 'fruits', 'kiwifruit': 'fruits',
  'coconut': 'fruits', 'coconuts': 'fruits',
  'lychee': 'fruits', 'lychees': 'fruits',
  'longan': 'fruits', 'rambutan': 'fruits',
  'platano': 'fruits', 'platanos': 'fruits',
  'pina': 'fruits', 'ananas': 'fruits',
  'maracuya': 'fruits', 'fruta de la pasion': 'fruits',
  'guayaba': 'fruits', 'guayabas': 'fruits',
  'pitaya': 'fruits', 'pitahaya': 'fruits',
  'coco': 'fruits', 'cocos': 'fruits',

  // Melons
  'watermelon': 'fruits',
  'cantaloupe': 'fruits',
  'honeydew': 'fruits',
  'melon': 'fruits', 'melons': 'fruits',
  'sandia': 'fruits', 'sandias': 'fruits',
  'melon cantalupo': 'fruits', 'melon de miel': 'fruits',

  // Grapes & figs & fresh dates
  'grape': 'fruits', 'grapes': 'fruits',
  'fig': 'fruits', 'figs': 'fruits',
  'fresh date': 'fruits', 'fresh dates': 'fruits',
  'uva': 'fruits', 'uvas': 'fruits',
  'higo': 'fruits', 'higos': 'fruits',
  'datil fresco': 'fruits', 'datiles frescos': 'fruits',

  // Other
  'pomegranate': 'fruits', 'pomegranates': 'fruits',
  'persimmon': 'fruits', 'persimmons': 'fruits',
  'rhubarb': 'fruits',
  'starfruit': 'fruits', 'star fruit': 'fruits',
  'granada': 'fruits', 'granadas': 'fruits',
  'caqui': 'fruits', 'caquis': 'fruits',
  'ruibarbo': 'fruits',
  'carambola': 'fruits',


  // ── DAIRY ───────────────────────────────────────────────

  // Milks
  'milk': 'dairy',
  'whole milk': 'dairy', 'skim milk': 'dairy', 'two percent milk': 'dairy', 'one percent milk': 'dairy',
  'almond milk': 'dairy', 'oat milk': 'dairy', 'soy milk': 'dairy', 'rice milk': 'dairy', 'cashew milk': 'dairy', 'hemp milk': 'dairy',
  'coconut milk': 'dairy',
  'half and half': 'dairy',
  'cream': 'dairy', 'heavy cream': 'dairy', 'heavy whipping cream': 'dairy', 'whipping cream': 'dairy', 'light cream': 'dairy',
  'double cream': 'dairy', 'single cream': 'dairy',
  'leche': 'dairy', 'leche entera': 'dairy', 'leche descremada': 'dairy',
  'leche de almendra': 'dairy', 'leche de avena': 'dairy', 'leche de soja': 'dairy', 'leche de soya': 'dairy', 'leche de coco': 'dairy', 'leche de arroz': 'dairy',
  'media crema': 'dairy', 'crema': 'dairy', 'crema espesa': 'dairy', 'crema de leche': 'dairy',
  'nata': 'dairy', 'nata para montar': 'dairy',

  // Butter & dairy fats
  'butter': 'dairy', 'unsalted butter': 'dairy', 'salted butter': 'dairy',
  'margarine': 'dairy',
  'ghee': 'dairy', 'clarified butter': 'dairy',
  'mantequilla': 'dairy', 'manteca': 'dairy', 'margarina': 'dairy', 'mantequilla clarificada': 'dairy',

  // Cheese
  'cheese': 'dairy',
  'cheddar': 'dairy', 'sharp cheddar': 'dairy', 'mild cheddar': 'dairy',
  'mozzarella': 'dairy', 'fresh mozzarella': 'dairy', 'buffalo mozzarella': 'dairy',
  'parmesan': 'dairy', 'parmigiano': 'dairy', 'parmigiano reggiano': 'dairy', 'reggiano': 'dairy',
  'pecorino': 'dairy', 'pecorino romano': 'dairy', 'romano': 'dairy',
  'ricotta': 'dairy',
  'cream cheese': 'dairy',
  'cottage cheese': 'dairy',
  'feta': 'dairy', 'feta cheese': 'dairy',
  'brie': 'dairy', 'camembert': 'dairy',
  'swiss': 'dairy', 'swiss cheese': 'dairy', 'gruyere': 'dairy', 'emmental': 'dairy',
  'manchego': 'dairy',
  'queso fresco': 'dairy', 'queso blanco': 'dairy', 'queso oaxaca': 'dairy', 'queso chihuahua': 'dairy', 'queso panela': 'dairy',
  'monterey jack': 'dairy', 'jack cheese': 'dairy', 'pepper jack': 'dairy', 'colby': 'dairy', 'colby jack': 'dairy',
  'blue cheese': 'dairy', 'gorgonzola': 'dairy', 'roquefort': 'dairy', 'stilton': 'dairy',
  'asiago': 'dairy', 'fontina': 'dairy', 'havarti': 'dairy', 'mascarpone': 'dairy',
  'paneer': 'dairy', 'halloumi': 'dairy', 'burrata': 'dairy', 'provolone': 'dairy',
  'queso': 'dairy', 'queso cheddar': 'dairy', 'queso mozzarella': 'dairy', 'queso parmesano': 'dairy',
  'requeson': 'dairy', 'queso ricota': 'dairy', 'queso crema': 'dairy', 'queso azul': 'dairy', 'queso feta': 'dairy', 'queso suizo': 'dairy', 'queso manchego': 'dairy',

  // Yogurt & cultured
  'yogurt': 'dairy', 'yoghurt': 'dairy',
  'greek yogurt': 'dairy', 'plain yogurt': 'dairy', 'vanilla yogurt': 'dairy',
  'sour cream': 'dairy',
  'buttermilk': 'dairy',
  'kefir': 'dairy',
  'creme fraiche': 'dairy',
  'yogur': 'dairy', 'yogur griego': 'dairy', 'yogur natural': 'dairy',
  'crema agria': 'dairy', 'suero de leche': 'dairy', 'suero de mantequilla': 'dairy',

  // Eggs (dairy aisle)
  'egg': 'dairy', 'eggs': 'dairy',
  'large egg': 'dairy', 'large eggs': 'dairy', 'extra large egg': 'dairy', 'extra large eggs': 'dairy',
  'egg white': 'dairy', 'egg whites': 'dairy', 'egg yolk': 'dairy', 'egg yolks': 'dairy',
  'duck egg': 'dairy', 'duck eggs': 'dairy', 'quail egg': 'dairy', 'quail eggs': 'dairy',
  'huevo': 'dairy', 'huevos': 'dairy', 'clara de huevo': 'dairy', 'claras de huevo': 'dairy',
  'yema de huevo': 'dairy', 'yemas de huevo': 'dairy', 'clara': 'dairy', 'yema': 'dairy',


  // ── MEAT ────────────────────────────────────────────────

  // Beef
  'beef': 'meat', 'ground beef': 'meat', 'lean ground beef': 'meat',
  'beef chuck': 'meat', 'chuck roast': 'meat', 'beef roast': 'meat',
  'steak': 'meat', 'ribeye': 'meat', 'rib eye': 'meat', 'rib eye steak': 'meat', 'ribeye steak': 'meat',
  'sirloin': 'meat', 'sirloin steak': 'meat', 'top sirloin': 'meat',
  'tenderloin': 'meat', 'beef tenderloin': 'meat', 'filet mignon': 'meat',
  'brisket': 'meat',
  'short rib': 'meat', 'short ribs': 'meat', 'beef short ribs': 'meat',
  'beef stew meat': 'meat', 'stew meat': 'meat', 'stewing beef': 'meat',
  'flank steak': 'meat', 'skirt steak': 'meat', 'hanger steak': 'meat', 'flat iron steak': 'meat',
  't bone': 'meat', 't bone steak': 'meat', 'porterhouse': 'meat', 'porterhouse steak': 'meat',
  'hamburger': 'meat', 'hamburger meat': 'meat', 'beef patty': 'meat', 'beef patties': 'meat',
  'oxtail': 'meat', 'oxtails': 'meat', 'beef cheek': 'meat',
  'carne de res': 'meat', 'carne molida': 'meat', 'carne picada': 'meat',
  'bistec': 'meat', 'bistecs': 'meat', 'bife': 'meat', 'bifes': 'meat',
  'costilla': 'meat', 'costillas': 'meat',
  'lomo': 'meat', 'vacuno': 'meat', 'res': 'meat',
  'asado': 'meat', 'chuleta': 'meat', 'chuletas': 'meat', 'falda': 'meat',
  'arrachera': 'meat', 'milanesa': 'meat', 'milanesas': 'meat',

  // Pork
  'pork': 'meat', 'ground pork': 'meat',
  'pork chop': 'meat', 'pork chops': 'meat',
  'pork loin': 'meat', 'pork tenderloin': 'meat',
  'pork shoulder': 'meat', 'pork butt': 'meat', 'boston butt': 'meat',
  'pork belly': 'meat',
  'ham': 'meat', 'cooked ham': 'meat', 'spiral ham': 'meat',
  'prosciutto': 'meat',
  'bacon': 'meat', 'thick cut bacon': 'meat', 'turkey bacon': 'meat',
  'pancetta': 'meat',
  'sausage': 'meat', 'italian sausage': 'meat', 'breakfast sausage': 'meat', 'sweet sausage': 'meat', 'hot sausage': 'meat',
  'salami': 'meat', 'genoa salami': 'meat', 'soppressata': 'meat',
  'chorizo': 'meat', 'spanish chorizo': 'meat', 'mexican chorizo': 'meat',
  'hot dog': 'meat', 'hot dogs': 'meat', 'frankfurter': 'meat', 'frankfurters': 'meat', 'wiener': 'meat', 'wieners': 'meat',
  'kielbasa': 'meat', 'andouille': 'meat', 'andouille sausage': 'meat',
  'pork rib': 'meat', 'pork ribs': 'meat', 'spare rib': 'meat', 'spare ribs': 'meat', 'baby back rib': 'meat', 'baby back ribs': 'meat',
  'capicola': 'meat',
  'cerdo': 'meat', 'puerco': 'meat', 'carne de cerdo': 'meat', 'carne de puerco': 'meat',
  'jamon': 'meat', 'jamon serrano': 'meat', 'jamon iberico': 'meat',
  'tocino': 'meat', 'panceta': 'meat',
  'salchicha': 'meat', 'salchichas': 'meat', 'salchichon': 'meat', 'longaniza': 'meat', 'longanizas': 'meat',
  'costilla de cerdo': 'meat', 'costillas de cerdo': 'meat', 'lomo de cerdo': 'meat',

  // Poultry
  'chicken': 'meat', 'whole chicken': 'meat',
  'chicken breast': 'meat', 'chicken breasts': 'meat', 'boneless chicken breast': 'meat', 'boneless skinless chicken breast': 'meat',
  'chicken thigh': 'meat', 'chicken thighs': 'meat', 'boneless chicken thigh': 'meat', 'boneless chicken thighs': 'meat',
  'chicken wing': 'meat', 'chicken wings': 'meat',
  'chicken drumstick': 'meat', 'chicken drumsticks': 'meat', 'drumstick': 'meat', 'drumsticks': 'meat',
  'chicken leg': 'meat', 'chicken legs': 'meat',
  'ground chicken': 'meat',
  'turkey': 'meat', 'whole turkey': 'meat', 'ground turkey': 'meat', 'turkey breast': 'meat',
  'duck': 'meat', 'whole duck': 'meat', 'duck breast': 'meat', 'duck leg': 'meat', 'duck legs': 'meat',
  'goose': 'meat',
  'cornish hen': 'meat', 'cornish hens': 'meat', 'cornish game hen': 'meat',
  'rotisserie chicken': 'meat',
  'pollo': 'meat', 'pollo entero': 'meat', 'pollo molido': 'meat',
  'pechuga': 'meat', 'pechugas': 'meat', 'pechuga de pollo': 'meat', 'pechugas de pollo': 'meat',
  'muslo': 'meat', 'muslos': 'meat', 'muslo de pollo': 'meat', 'muslos de pollo': 'meat',
  'ala': 'meat', 'alas': 'meat', 'ala de pollo': 'meat', 'alas de pollo': 'meat',
  'pavo': 'meat', 'pavo molido': 'meat', 'pato': 'meat', 'patos': 'meat',

  // Lamb / game / veal
  'lamb': 'meat', 'lamb chop': 'meat', 'lamb chops': 'meat',
  'ground lamb': 'meat', 'leg of lamb': 'meat', 'lamb shoulder': 'meat', 'lamb shank': 'meat', 'lamb shanks': 'meat',
  'mutton': 'meat',
  'venison': 'meat',
  'rabbit': 'meat',
  'bison': 'meat', 'buffalo': 'meat',
  'veal': 'meat', 'veal chop': 'meat', 'ground veal': 'meat',
  'cordero': 'meat', 'cordero molido': 'meat', 'chuleta de cordero': 'meat',
  'carnero': 'meat', 'venado': 'meat', 'conejo': 'meat', 'bisonte': 'meat', 'ternera': 'meat',

  // Processed / cured (mainly meat counter / deli)
  'pepperoni': 'meat',
  'mortadella': 'meat', 'mortadela': 'meat',
  'pastrami': 'meat',
  'corned beef': 'meat',
  'bologna': 'meat',
  'liverwurst': 'meat',
  'deli meat': 'meat', 'deli turkey': 'meat', 'deli ham': 'meat', 'sliced turkey': 'meat', 'sliced ham': 'meat',


  // ── SEAFOOD ─────────────────────────────────────────────

  'fish': 'seafood', 'fish fillet': 'seafood', 'fish fillets': 'seafood',
  'salmon': 'seafood', 'salmon fillet': 'seafood', 'salmon fillets': 'seafood',
  'tuna': 'seafood', 'tuna steak': 'seafood', 'tuna steaks': 'seafood', 'ahi tuna': 'seafood',
  'cod': 'seafood', 'cod fillet': 'seafood', 'cod fillets': 'seafood',
  'halibut': 'seafood',
  'tilapia': 'seafood',
  'trout': 'seafood', 'rainbow trout': 'seafood',
  'sea bass': 'seafood', 'bass': 'seafood', 'striped bass': 'seafood', 'chilean sea bass': 'seafood',
  'snapper': 'seafood', 'red snapper': 'seafood',
  'mahi mahi': 'seafood', 'mahi-mahi': 'seafood',
  'swordfish': 'seafood',
  'mackerel': 'seafood',
  'anchovy': 'seafood', 'anchovies': 'seafood',
  'sardine': 'seafood', 'sardines': 'seafood',
  'herring': 'seafood', 'pickled herring': 'seafood',
  'haddock': 'seafood', 'pollock': 'seafood',
  'catfish': 'seafood',
  'monkfish': 'seafood',
  'perch': 'seafood',
  'flounder': 'seafood', 'sole': 'seafood', 'dover sole': 'seafood',
  'branzino': 'seafood',
  'mahi': 'seafood',
  'smoked salmon': 'seafood', 'lox': 'seafood', 'gravlax': 'seafood',
  // Shellfish
  'shrimp': 'seafood', 'jumbo shrimp': 'seafood',
  'prawn': 'seafood', 'prawns': 'seafood',
  'lobster': 'seafood', 'lobster tail': 'seafood', 'lobster tails': 'seafood',
  'crab': 'seafood', 'crabmeat': 'seafood', 'crab meat': 'seafood', 'lump crab': 'seafood', 'king crab': 'seafood',
  'crawfish': 'seafood', 'crayfish': 'seafood',
  // Mollusks
  'clam': 'seafood', 'clams': 'seafood',
  'mussel': 'seafood', 'mussels': 'seafood',
  'oyster': 'seafood', 'oysters': 'seafood',
  'scallop': 'seafood', 'scallops': 'seafood', 'sea scallop': 'seafood', 'sea scallops': 'seafood', 'bay scallop': 'seafood', 'bay scallops': 'seafood',
  'squid': 'seafood', 'calamari': 'seafood',
  'octopus': 'seafood',
  // Other / ES
  'caviar': 'seafood', 'roe': 'seafood', 'salmon roe': 'seafood', 'tobiko': 'seafood',
  'surimi': 'seafood', 'imitation crab': 'seafood',
  'pescado': 'seafood',
  'salmon ahumado': 'seafood',
  'atun': 'seafood',
  'bacalao': 'seafood',
  'fletán': 'seafood', 'fletan': 'seafood',
  'mero': 'seafood',
  'trucha': 'seafood', 'truchas': 'seafood',
  'lubina': 'seafood', 'robalo': 'seafood', 'dorada': 'seafood',
  'pez espada': 'seafood',
  'caballa': 'seafood',
  'anchoa': 'seafood', 'anchoas': 'seafood',
  'sardina': 'seafood', 'sardinas': 'seafood',
  'arenque': 'seafood',
  'camaron': 'seafood', 'camarones': 'seafood', 'gamba': 'seafood', 'gambas': 'seafood', 'langostino': 'seafood', 'langostinos': 'seafood',
  'langosta': 'seafood', 'langostas': 'seafood',
  'cangrejo': 'seafood', 'cangrejos': 'seafood', 'jaiba': 'seafood', 'jaibas': 'seafood',
  'almeja': 'seafood', 'almejas': 'seafood',
  'mejillon': 'seafood', 'mejillones': 'seafood',
  'ostra': 'seafood', 'ostras': 'seafood', 'ostion': 'seafood', 'ostiones': 'seafood',
  'vieira': 'seafood', 'vieiras': 'seafood', 'callo de hacha': 'seafood',
  'calamar': 'seafood', 'calamares': 'seafood',
  'pulpo': 'seafood', 'pulpos': 'seafood',


  // ── PANTRY ──────────────────────────────────────────────

  // Flours
  'flour': 'pantry',
  'all purpose flour': 'pantry', 'all-purpose flour': 'pantry',
  'bread flour': 'pantry', 'cake flour': 'pantry', 'pastry flour': 'pantry', 'self rising flour': 'pantry', 'self-rising flour': 'pantry',
  'whole wheat flour': 'pantry', 'whole-wheat flour': 'pantry',
  'almond flour': 'pantry', 'coconut flour': 'pantry', 'oat flour': 'pantry', 'rice flour': 'pantry', 'chickpea flour': 'pantry', 'tapioca flour': 'pantry',
  'cornmeal': 'pantry', 'corn meal': 'pantry', 'polenta': 'pantry', 'semolina': 'pantry',
  'masa': 'pantry', 'masa harina': 'pantry',
  'harina': 'pantry', 'harina de trigo': 'pantry', 'harina para todo uso': 'pantry', 'harina integral': 'pantry',
  'harina de almendra': 'pantry', 'harina de coco': 'pantry', 'harina de maiz': 'pantry',
  'sémola': 'pantry', 'semola': 'pantry',

  // Rice & grains
  'rice': 'pantry',
  'white rice': 'pantry', 'brown rice': 'pantry', 'basmati': 'pantry', 'basmati rice': 'pantry', 'jasmine rice': 'pantry',
  'wild rice': 'pantry', 'arborio': 'pantry', 'arborio rice': 'pantry', 'short grain rice': 'pantry', 'long grain rice': 'pantry',
  'sushi rice': 'pantry',
  'quinoa': 'pantry',
  'barley': 'pantry', 'pearl barley': 'pantry',
  'oat': 'pantry', 'oats': 'pantry', 'rolled oats': 'pantry', 'old fashioned oats': 'pantry', 'old-fashioned oats': 'pantry',
  'steel cut oats': 'pantry', 'steel-cut oats': 'pantry', 'quick oats': 'pantry', 'instant oats': 'pantry',
  'bulgur': 'pantry', 'bulgur wheat': 'pantry',
  'couscous': 'pantry', 'pearl couscous': 'pantry', 'israeli couscous': 'pantry',
  'farro': 'pantry',
  'millet': 'pantry',
  'buckwheat': 'pantry', 'kasha': 'pantry',
  'amaranth': 'pantry',
  'arroz': 'pantry', 'arroz blanco': 'pantry', 'arroz integral': 'pantry', 'arroz basmati': 'pantry', 'arroz jazmin': 'pantry',
  'cebada': 'pantry', 'avena': 'pantry', 'cuscus': 'pantry', 'mijo': 'pantry', 'alforfon': 'pantry',

  // Pasta
  'pasta': 'pantry',
  'spaghetti': 'pantry', 'spaghettini': 'pantry', 'capellini': 'pantry', 'angel hair': 'pantry', 'angel hair pasta': 'pantry',
  'penne': 'pantry', 'rigatoni': 'pantry', 'ziti': 'pantry', 'fusilli': 'pantry', 'rotini': 'pantry', 'farfalle': 'pantry', 'bowtie': 'pantry', 'bowtie pasta': 'pantry',
  'macaroni': 'pantry', 'elbow macaroni': 'pantry', 'shells': 'pantry', 'pasta shells': 'pantry',
  'linguine': 'pantry', 'fettuccine': 'pantry', 'tagliatelle': 'pantry', 'pappardelle': 'pantry',
  'lasagna': 'pantry', 'lasagne': 'pantry', 'lasagna noodle': 'pantry', 'lasagna noodles': 'pantry',
  'orzo': 'pantry', 'ditalini': 'pantry',
  'ramen': 'pantry', 'ramen noodle': 'pantry', 'ramen noodles': 'pantry',
  'soba': 'pantry', 'soba noodle': 'pantry', 'soba noodles': 'pantry',
  'udon': 'pantry', 'udon noodle': 'pantry', 'udon noodles': 'pantry',
  'rice noodle': 'pantry', 'rice noodles': 'pantry', 'vermicelli': 'pantry', 'cellophane noodle': 'pantry', 'cellophane noodles': 'pantry',
  'gnocchi': 'pantry',
  'ravioli': 'pantry', 'tortellini': 'pantry',
  'egg noodle': 'pantry', 'egg noodles': 'pantry',
  'fideos': 'pantry', 'fideo': 'pantry',
  'espagueti': 'pantry', 'espaguetis': 'pantry',
  'noquis': 'pantry',

  // Bread products
  'bread': 'pantry', 'white bread': 'pantry', 'whole grain bread': 'pantry', 'whole wheat bread': 'pantry',
  'sourdough': 'pantry', 'sourdough bread': 'pantry',
  'baguette': 'pantry',
  'ciabatta': 'pantry',
  'pita': 'pantry', 'pita bread': 'pantry',
  'naan': 'pantry',
  'tortilla': 'pantry', 'tortillas': 'pantry',
  'corn tortilla': 'pantry', 'corn tortillas': 'pantry',
  'flour tortilla': 'pantry', 'flour tortillas': 'pantry',
  'bun': 'pantry', 'buns': 'pantry', 'hamburger bun': 'pantry', 'hamburger buns': 'pantry', 'hot dog bun': 'pantry', 'hot dog buns': 'pantry',
  'roll': 'pantry', 'rolls': 'pantry', 'dinner roll': 'pantry', 'dinner rolls': 'pantry',
  'crouton': 'pantry', 'croutons': 'pantry',
  'breadcrumb': 'pantry', 'breadcrumbs': 'pantry', 'bread crumbs': 'pantry', 'panko': 'pantry', 'panko breadcrumbs': 'pantry',
  'english muffin': 'pantry', 'english muffins': 'pantry',
  'bagel': 'pantry', 'bagels': 'pantry',
  'pan': 'pantry', 'pan blanco': 'pantry', 'pan integral': 'pantry', 'pan rallado': 'pantry',
  'bollo': 'pantry', 'bollos': 'pantry', 'panecillo': 'pantry', 'panecillos': 'pantry', 'picatoste': 'pantry', 'picatostes': 'pantry',

  // Beans / legumes
  'bean': 'pantry', 'beans': 'pantry',
  'black bean': 'pantry', 'black beans': 'pantry',
  'kidney bean': 'pantry', 'kidney beans': 'pantry',
  'pinto bean': 'pantry', 'pinto beans': 'pantry',
  'white bean': 'pantry', 'white beans': 'pantry', 'navy bean': 'pantry', 'navy beans': 'pantry',
  'cannellini': 'pantry', 'cannellini bean': 'pantry', 'cannellini beans': 'pantry',
  'great northern': 'pantry', 'great northern bean': 'pantry', 'great northern beans': 'pantry',
  'chickpea': 'pantry', 'chickpeas': 'pantry', 'garbanzo': 'pantry', 'garbanzos': 'pantry', 'garbanzo bean': 'pantry', 'garbanzo beans': 'pantry',
  'lentil': 'pantry', 'lentils': 'pantry', 'red lentil': 'pantry', 'red lentils': 'pantry', 'green lentil': 'pantry', 'green lentils': 'pantry', 'french lentil': 'pantry', 'french lentils': 'pantry',
  'split pea': 'pantry', 'split peas': 'pantry',
  'lima bean': 'pantry', 'lima beans': 'pantry', 'butter bean': 'pantry', 'butter beans': 'pantry',
  'black eyed pea': 'pantry', 'black eyed peas': 'pantry', 'black-eyed pea': 'pantry', 'black-eyed peas': 'pantry',
  'soybean': 'pantry', 'soybeans': 'pantry', 'edamame': 'pantry',
  'tofu': 'pantry', 'firm tofu': 'pantry', 'silken tofu': 'pantry', 'soft tofu': 'pantry', 'extra firm tofu': 'pantry',
  'tempeh': 'pantry', 'seitan': 'pantry',
  'frijol': 'pantry', 'frijoles': 'pantry', 'frijoles negros': 'pantry', 'frijoles pintos': 'pantry',
  'alubia': 'pantry', 'alubias': 'pantry', 'judia': 'pantry', 'judias': 'pantry',
  'lenteja': 'pantry', 'lentejas': 'pantry',
  'haba': 'pantry', 'habas': 'pantry', 'soja': 'pantry', 'soya': 'pantry',

  // Canned goods / sauces & stocks
  'canned tomato': 'pantry', 'canned tomatoes': 'pantry', 'diced tomatoes': 'pantry', 'crushed tomatoes': 'pantry', 'whole tomatoes': 'pantry', 'stewed tomatoes': 'pantry', 'fire roasted tomatoes': 'pantry', 'fire-roasted tomatoes': 'pantry',
  'tomato sauce': 'pantry',
  'tomato paste': 'pantry',
  'marinara': 'pantry', 'marinara sauce': 'pantry', 'pasta sauce': 'pantry', 'pizza sauce': 'pantry',
  'tomato puree': 'pantry',
  'salsa de tomate': 'pantry', 'pasta de tomate': 'pantry', 'pure de tomate': 'pantry',
  'broth': 'pantry', 'stock': 'pantry',
  'chicken broth': 'pantry', 'chicken stock': 'pantry',
  'beef broth': 'pantry', 'beef stock': 'pantry',
  'vegetable broth': 'pantry', 'vegetable stock': 'pantry', 'veggie broth': 'pantry',
  'bone broth': 'pantry',
  'dashi': 'pantry', 'dashi stock': 'pantry',
  'caldo': 'pantry', 'caldo de pollo': 'pantry', 'caldo de res': 'pantry', 'caldo de verduras': 'pantry',
  'bouillon': 'pantry', 'bouillon cube': 'pantry', 'bouillon cubes': 'pantry',
  'canned beans': 'pantry', 'canned corn': 'pantry', 'canned tuna': 'pantry', 'canned salmon': 'pantry',
  'tuna en lata': 'pantry', 'atun en lata': 'pantry',
  'coconut cream': 'pantry',

  // Oils
  'oil': 'pantry',
  'olive oil': 'pantry', 'extra virgin olive oil': 'pantry', 'evoo': 'pantry',
  'vegetable oil': 'pantry',
  'canola oil': 'pantry',
  'sunflower oil': 'pantry', 'safflower oil': 'pantry',
  'sesame oil': 'pantry', 'toasted sesame oil': 'pantry',
  'peanut oil': 'pantry',
  'coconut oil': 'pantry',
  'avocado oil': 'pantry',
  'grapeseed oil': 'pantry',
  'walnut oil': 'pantry',
  'truffle oil': 'pantry',
  'cooking spray': 'pantry', 'pam': 'pantry',
  'aceite': 'pantry', 'aceite de oliva': 'pantry', 'aceite de oliva extra virgen': 'pantry',
  'aceite vegetal': 'pantry', 'aceite de canola': 'pantry', 'aceite de girasol': 'pantry',
  'aceite de sesamo': 'pantry', 'aceite de cacahuete': 'pantry', 'aceite de coco': 'pantry', 'aceite de aguacate': 'pantry',

  // Vinegars
  'vinegar': 'pantry',
  'balsamic': 'pantry', 'balsamic vinegar': 'pantry',
  'red wine vinegar': 'pantry', 'white wine vinegar': 'pantry',
  'rice vinegar': 'pantry', 'rice wine vinegar': 'pantry',
  'apple cider vinegar': 'pantry', 'cider vinegar': 'pantry',
  'sherry vinegar': 'pantry',
  'white vinegar': 'pantry', 'distilled vinegar': 'pantry',
  'champagne vinegar': 'pantry', 'malt vinegar': 'pantry',
  'vinagre': 'pantry', 'vinagre balsamico': 'pantry', 'vinagre de manzana': 'pantry', 'vinagre de arroz': 'pantry',

  // Sweeteners
  'sugar': 'pantry', 'white sugar': 'pantry', 'granulated sugar': 'pantry', 'cane sugar': 'pantry',
  'brown sugar': 'pantry', 'light brown sugar': 'pantry', 'dark brown sugar': 'pantry',
  'powdered sugar': 'pantry', 'confectioners sugar': 'pantry', "confectioner's sugar": 'pantry', 'icing sugar': 'pantry',
  'raw sugar': 'pantry', 'turbinado': 'pantry', 'turbinado sugar': 'pantry', 'demerara': 'pantry', 'demerara sugar': 'pantry', 'muscovado': 'pantry',
  'honey': 'pantry', 'raw honey': 'pantry', 'clover honey': 'pantry', 'manuka honey': 'pantry',
  'maple syrup': 'pantry', 'pure maple syrup': 'pantry',
  'agave': 'pantry', 'agave syrup': 'pantry', 'agave nectar': 'pantry',
  'molasses': 'pantry', 'blackstrap molasses': 'pantry',
  'corn syrup': 'pantry', 'light corn syrup': 'pantry', 'dark corn syrup': 'pantry',
  'simple syrup': 'pantry',
  'stevia': 'pantry', 'monk fruit': 'pantry', 'sweetener': 'pantry', 'artificial sweetener': 'pantry',
  'azucar': 'pantry', 'azucar morena': 'pantry', 'azucar glas': 'pantry', 'azucar en polvo': 'pantry',
  'miel': 'pantry', 'jarabe de arce': 'pantry', 'melaza': 'pantry', 'sirope': 'pantry', 'jarabe': 'pantry',
  'panela': 'pantry', 'piloncillo': 'pantry',

  // Sauces & condiments
  'soy sauce': 'pantry', 'low sodium soy sauce': 'pantry', 'tamari': 'pantry',
  'fish sauce': 'pantry',
  'oyster sauce': 'pantry',
  'hoisin sauce': 'pantry', 'hoisin': 'pantry',
  'sriracha': 'pantry', 'sriracha sauce': 'pantry',
  'hot sauce': 'pantry', 'tabasco': 'pantry', 'cholula': 'pantry', 'frank\'s red hot': 'pantry',
  'salsa': 'pantry', 'salsa verde': 'pantry', 'salsa roja': 'pantry', 'pico de gallo': 'pantry',
  'ketchup': 'pantry',
  'mustard': 'pantry', 'dijon mustard': 'pantry', 'dijon': 'pantry', 'yellow mustard': 'pantry', 'whole grain mustard': 'pantry', 'stone ground mustard': 'pantry', 'honey mustard': 'pantry',
  'mayo': 'pantry', 'mayonnaise': 'pantry',
  'worcestershire': 'pantry', 'worcestershire sauce': 'pantry',
  'bbq sauce': 'pantry', 'barbecue sauce': 'pantry',
  'peanut butter': 'pantry', 'almond butter': 'pantry', 'cashew butter': 'pantry', 'sunbutter': 'pantry', 'tahini': 'pantry',
  'jam': 'pantry', 'jelly': 'pantry', 'preserve': 'pantry', 'preserves': 'pantry', 'marmalade': 'pantry',
  'nutella': 'pantry', 'chocolate spread': 'pantry',
  'gochujang': 'pantry', 'sambal oelek': 'pantry', 'doubanjiang': 'pantry',
  'harissa': 'pantry',
  'mole': 'pantry', 'mole paste': 'pantry',
  'pesto': 'pantry',
  'salsa de soja': 'pantry', 'salsa de soya': 'pantry', 'salsa de pescado': 'pantry', 'salsa de ostras': 'pantry',
  'salsa picante': 'pantry', 'mostaza': 'pantry', 'mayonesa': 'pantry',
  'mantequilla de mani': 'pantry', 'mantequilla de cacahuete': 'pantry',
  'mermelada': 'pantry', 'jalea': 'pantry', 'conserva': 'pantry',

  // Crackers / cookies / chips
  'cracker': 'pantry', 'crackers': 'pantry', 'saltine': 'pantry', 'saltines': 'pantry', 'graham cracker': 'pantry', 'graham crackers': 'pantry',
  'cookie': 'pantry', 'cookies': 'pantry', 'shortbread': 'pantry', 'biscotti': 'pantry',
  'biscuit': 'pantry', 'biscuits': 'pantry',
  'chip': 'pantry', 'chips': 'pantry', 'potato chip': 'pantry', 'potato chips': 'pantry', 'tortilla chip': 'pantry', 'tortilla chips': 'pantry',
  'pretzel': 'pantry', 'pretzels': 'pantry',
  'popcorn': 'pantry', 'popcorn kernel': 'pantry', 'popcorn kernels': 'pantry',
  'granola': 'pantry', 'granola bar': 'pantry', 'granola bars': 'pantry',
  'galleta': 'pantry', 'galletas': 'pantry',
  'papas fritas': 'pantry', 'totopos': 'pantry', 'palomitas': 'pantry',

  // Nuts & seeds (shelved with pantry — most are dry/jarred/canned)
  'nut': 'pantry', 'nuts': 'pantry',
  'almond': 'pantry', 'almonds': 'pantry', 'slivered almonds': 'pantry', 'sliced almonds': 'pantry',
  'walnut': 'pantry', 'walnuts': 'pantry',
  'pecan': 'pantry', 'pecans': 'pantry',
  'hazelnut': 'pantry', 'hazelnuts': 'pantry',
  'peanut': 'pantry', 'peanuts': 'pantry',
  'pistachio': 'pantry', 'pistachios': 'pantry',
  'cashew': 'pantry', 'cashews': 'pantry',
  'macadamia': 'pantry', 'macadamia nut': 'pantry', 'macadamia nuts': 'pantry',
  'brazil nut': 'pantry', 'brazil nuts': 'pantry',
  'pine nut': 'pantry', 'pine nuts': 'pantry',
  'sunflower seed': 'pantry', 'sunflower seeds': 'pantry',
  'pumpkin seed': 'pantry', 'pumpkin seeds': 'pantry', 'pepita': 'pantry', 'pepitas': 'pantry',
  'sesame seed': 'pantry', 'sesame seeds': 'pantry',
  'flax seed': 'pantry', 'flax seeds': 'pantry', 'flaxseed': 'pantry', 'ground flax': 'pantry',
  'chia seed': 'pantry', 'chia seeds': 'pantry',
  'hemp seed': 'pantry', 'hemp seeds': 'pantry', 'hemp hearts': 'pantry',
  'poppy seed': 'pantry', 'poppy seeds': 'pantry',
  'nuez': 'pantry', 'nueces': 'pantry', 'almendra': 'pantry', 'almendras': 'pantry',
  'avellana': 'pantry', 'avellanas': 'pantry',
  'cacahuete': 'pantry', 'cacahuetes': 'pantry', 'mani': 'pantry',
  'pistacho': 'pantry', 'pistachos': 'pantry',
  'anacardo': 'pantry', 'anacardos': 'pantry', 'maranon': 'pantry', 'maranones': 'pantry',
  'pinon': 'pantry', 'pinones': 'pantry',
  'semilla de girasol': 'pantry', 'semillas de girasol': 'pantry',
  'semilla de calabaza': 'pantry', 'semillas de calabaza': 'pantry',
  'semilla de sesamo': 'pantry', 'semillas de sesamo': 'pantry',
  'semilla de lino': 'pantry', 'semillas de lino': 'pantry',
  'semilla de chia': 'pantry', 'semillas de chia': 'pantry',
  'semilla de amapola': 'pantry', 'semillas de amapola': 'pantry',

  // Baking essentials
  'baking soda': 'pantry',
  'baking powder': 'pantry',
  'yeast': 'pantry', 'active dry yeast': 'pantry', 'instant yeast': 'pantry', 'fresh yeast': 'pantry', 'rapid rise yeast': 'pantry',
  'cornstarch': 'pantry', 'corn starch': 'pantry',
  'arrowroot': 'pantry', 'arrowroot powder': 'pantry',
  'gelatin': 'pantry', 'unflavored gelatin': 'pantry',
  'agar': 'pantry', 'agar agar': 'pantry', 'agar-agar': 'pantry',
  'cream of tartar': 'pantry',
  'xanthan gum': 'pantry',
  'lecithin': 'pantry',
  'dry milk': 'pantry', 'powdered milk': 'pantry', 'milk powder': 'pantry',
  'evaporated milk': 'pantry',
  'condensed milk': 'pantry', 'sweetened condensed milk': 'pantry', 'leche condensada': 'pantry', 'leche evaporada': 'pantry',
  'dulce de leche': 'pantry', 'cajeta': 'pantry',
  'bicarbonato': 'pantry', 'bicarbonato de sodio': 'pantry',
  'polvo para hornear': 'pantry', 'polvo de hornear': 'pantry',
  'levadura': 'pantry', 'levadura seca': 'pantry', 'levadura fresca': 'pantry',
  'maicena': 'pantry', 'fecula de maiz': 'pantry', 'almidon de maiz': 'pantry',
  'gelatina': 'pantry',

  // Chocolate / cocoa / extracts / coffee / tea
  'cocoa': 'pantry', 'cocoa powder': 'pantry', 'unsweetened cocoa': 'pantry', 'dutch process cocoa': 'pantry',
  'chocolate': 'pantry', 'dark chocolate': 'pantry', 'milk chocolate': 'pantry', 'white chocolate': 'pantry',
  'chocolate chip': 'pantry', 'chocolate chips': 'pantry', 'semisweet chocolate': 'pantry', 'semi-sweet chocolate': 'pantry', 'bittersweet chocolate': 'pantry',
  'baking chocolate': 'pantry', 'unsweetened chocolate': 'pantry',
  'vanilla extract': 'pantry', 'pure vanilla extract': 'pantry', 'vanilla': 'pantry', 'vanilla bean': 'pantry', 'vanilla beans': 'pantry', 'vanilla paste': 'pantry',
  'almond extract': 'pantry', 'mint extract': 'pantry', 'peppermint extract': 'pantry', 'rum extract': 'pantry', 'lemon extract': 'pantry', 'orange extract': 'pantry',
  'coffee': 'pantry', 'espresso': 'pantry', 'espresso powder': 'pantry', 'instant coffee': 'pantry', 'ground coffee': 'pantry', 'coffee beans': 'pantry', 'coffee bean': 'pantry',
  'tea': 'pantry', 'green tea': 'pantry', 'black tea': 'pantry', 'herbal tea': 'pantry', 'matcha': 'pantry', 'matcha powder': 'pantry', 'chai': 'pantry',
  'cacao': 'pantry', 'cacao en polvo': 'pantry',
  'chocolate negro': 'pantry', 'chocolate con leche': 'pantry', 'chocolate blanco': 'pantry',
  'extracto de vainilla': 'pantry', 'vainilla': 'pantry',
  'cafe': 'pantry', 'te': 'pantry', 'te verde': 'pantry', 'te negro': 'pantry',

  // Dried fruits
  'raisin': 'pantry', 'raisins': 'pantry', 'golden raisins': 'pantry', 'sultanas': 'pantry',
  'prune': 'pantry', 'prunes': 'pantry',
  'dried apricot': 'pantry', 'dried apricots': 'pantry',
  'dried cherry': 'pantry', 'dried cherries': 'pantry',
  'dried cranberry': 'pantry', 'dried cranberries': 'pantry', 'craisin': 'pantry', 'craisins': 'pantry',
  'dried mango': 'pantry', 'dried fig': 'pantry', 'dried figs': 'pantry', 'dried date': 'pantry', 'dried dates': 'pantry', 'date': 'pantry', 'dates': 'pantry',
  'medjool': 'pantry', 'medjool date': 'pantry', 'medjool dates': 'pantry',
  'shredded coconut': 'pantry', 'coconut flakes': 'pantry', 'dried coconut': 'pantry', 'desiccated coconut': 'pantry',
  'pasa': 'pantry', 'pasas': 'pantry', 'ciruela pasa': 'pantry', 'ciruelas pasas': 'pantry',
  'orejon': 'pantry', 'orejones': 'pantry',
  'datil': 'pantry', 'datiles': 'pantry',
  'coco rallado': 'pantry', 'coco deshidratado': 'pantry',

  // Pickles / jarred / olives
  'pickle': 'pantry', 'pickles': 'pantry', 'dill pickle': 'pantry', 'dill pickles': 'pantry', 'bread and butter pickle': 'pantry', 'bread and butter pickles': 'pantry',
  'gherkin': 'pantry', 'gherkins': 'pantry', 'cornichon': 'pantry', 'cornichons': 'pantry',
  'sauerkraut': 'pantry',
  'kimchi': 'pantry',
  'olives': 'pantry', 'kalamata olive': 'pantry', 'kalamata olives': 'pantry', 'green olive': 'pantry', 'green olives': 'pantry', 'black olive': 'pantry', 'black olives': 'pantry',
  'caper': 'pantry', 'capers': 'pantry', 'caperberry': 'pantry', 'caperberries': 'pantry',
  'sundried tomato': 'pantry', 'sun dried tomato': 'pantry', 'sun-dried tomato': 'pantry', 'sundried tomatoes': 'pantry', 'sun-dried tomatoes': 'pantry',
  'jarred jalapeno': 'pantry', 'jarred jalapenos': 'pantry', 'pickled jalapeno': 'pantry', 'pickled jalapenos': 'pantry',
  'banana pepper': 'pantry', 'banana peppers': 'pantry',
  'pepinillo': 'pantry', 'pepinillos': 'pantry',
  'chucrut': 'pantry',
  'aceituna': 'pantry', 'aceitunas': 'pantry', 'aceituna kalamata': 'pantry',
  'alcaparra': 'pantry', 'alcaparras': 'pantry',
  'tomate seco': 'pantry', 'tomates secos': 'pantry',

  // Wine & spirits (cooking)
  'wine': 'pantry', 'red wine': 'pantry', 'white wine': 'pantry', 'rose': 'pantry', 'rose wine': 'pantry', 'cooking wine': 'pantry', 'dry white wine': 'pantry', 'dry red wine': 'pantry',
  'sake': 'pantry',
  'mirin': 'pantry',
  'sherry': 'pantry', 'dry sherry': 'pantry',
  'port': 'pantry', 'port wine': 'pantry',
  'vermouth': 'pantry', 'dry vermouth': 'pantry',
  'marsala': 'pantry', 'marsala wine': 'pantry',
  'brandy': 'pantry', 'cognac': 'pantry',
  'rum': 'pantry', 'dark rum': 'pantry', 'light rum': 'pantry',
  'vodka': 'pantry',
  'beer': 'pantry', 'lager': 'pantry', 'ale': 'pantry', 'stout': 'pantry',
  'bourbon': 'pantry', 'whiskey': 'pantry', 'whisky': 'pantry', 'scotch': 'pantry',
  'tequila': 'pantry', 'mezcal': 'pantry',
  'vino': 'pantry', 'vino tinto': 'pantry', 'vino blanco': 'pantry', 'vino para cocinar': 'pantry',
  'jerez': 'pantry', 'oporto': 'pantry', 'vermut': 'pantry',
  'cerveza': 'pantry', 'ron': 'pantry',

  // Frozen / refrigerated convenience dough (close to pantry shelf-stable)
  'puff pastry': 'pantry',
  'phyllo': 'pantry', 'filo': 'pantry', 'phyllo dough': 'pantry', 'filo dough': 'pantry',
  'pie crust': 'pantry', 'pie crusts': 'pantry', 'pie shell': 'pantry', 'pie shells': 'pantry',
  'pizza dough': 'pantry',
  'wonton wrapper': 'pantry', 'wonton wrappers': 'pantry',
  'eggroll wrapper': 'pantry', 'eggroll wrappers': 'pantry', 'spring roll wrapper': 'pantry', 'spring roll wrappers': 'pantry',
  'hojaldre': 'pantry', 'masa filo': 'pantry', 'masa de pizza': 'pantry',

  // Miso / asian pantry pastes
  'miso': 'pantry', 'miso paste': 'pantry', 'white miso': 'pantry', 'red miso': 'pantry',
  'curry paste': 'pantry', 'red curry paste': 'pantry', 'green curry paste': 'pantry', 'yellow curry paste': 'pantry', 'massaman curry paste': 'pantry',


  // ── SPICES ──────────────────────────────────────────────

  // Salts
  'salt': 'spices', 'sea salt': 'spices', 'kosher salt': 'spices', 'table salt': 'spices', 'iodized salt': 'spices',
  'flaky salt': 'spices', 'flaked salt': 'spices', 'maldon': 'spices', 'maldon salt': 'spices', 'fleur de sel': 'spices',
  'rock salt': 'spices', 'himalayan salt': 'spices', 'pink salt': 'spices', 'pink himalayan salt': 'spices',
  'garlic salt': 'spices', 'onion salt': 'spices', 'celery salt': 'spices', 'seasoning salt': 'spices', 'seasoned salt': 'spices', 'lemon pepper': 'spices',
  'sal': 'spices', 'sal de mar': 'spices', 'sal marina': 'spices', 'sal gruesa': 'spices', 'sal rosa': 'spices',

  // Pepper / peppercorns
  'pepper': 'spices', 'black pepper': 'spices', 'white pepper': 'spices', 'pink pepper': 'spices', 'green peppercorn': 'spices', 'green peppercorns': 'spices',
  'ground pepper': 'spices', 'cracked pepper': 'spices', 'freshly ground pepper': 'spices', 'freshly ground black pepper': 'spices',
  'peppercorn': 'spices', 'peppercorns': 'spices', 'black peppercorn': 'spices', 'black peppercorns': 'spices', 'whole peppercorn': 'spices', 'whole peppercorns': 'spices',
  'pimienta': 'spices', 'pimienta negra': 'spices', 'pimienta blanca': 'spices', 'pimienta molida': 'spices',

  // Common ground spices
  'cinnamon': 'spices', 'ground cinnamon': 'spices', 'cinnamon stick': 'spices', 'cinnamon sticks': 'spices', 'ceylon cinnamon': 'spices',
  'cumin': 'spices', 'ground cumin': 'spices', 'cumin seed': 'spices', 'cumin seeds': 'spices', 'comino': 'spices', 'comino molido': 'spices',
  'coriander': 'spices', 'ground coriander': 'spices', 'coriander seed': 'spices', 'coriander seeds': 'spices',
  'paprika': 'spices', 'smoked paprika': 'spices', 'sweet paprika': 'spices', 'hot paprika': 'spices', 'spanish paprika': 'spices', 'hungarian paprika': 'spices',
  'pimenton': 'spices', 'pimenton ahumado': 'spices', 'pimenton dulce': 'spices', 'pimenton picante': 'spices',
  'ground turmeric': 'spices', 'turmeric powder': 'spices', 'curcuma molida': 'spices',
  'ginger powder': 'spices', 'ground ginger': 'spices', 'jengibre molido': 'spices', 'jengibre en polvo': 'spices',
  'nutmeg': 'spices', 'ground nutmeg': 'spices', 'whole nutmeg': 'spices', 'nuez moscada': 'spices',
  'clove': 'spices', 'cloves': 'spices', 'ground cloves': 'spices', 'whole cloves': 'spices', 'clavo': 'spices', 'clavos': 'spices', 'clavo molido': 'spices', 'clavos de olor': 'spices',
  'allspice': 'spices', 'ground allspice': 'spices', 'allspice berries': 'spices', 'pimienta de jamaica': 'spices',
  'cardamom': 'spices', 'ground cardamom': 'spices', 'cardamom pod': 'spices', 'cardamom pods': 'spices', 'cardamomo': 'spices',
  'mace': 'spices', 'ground mace': 'spices',
  'fennel seed': 'spices', 'fennel seeds': 'spices',
  'mustard seed': 'spices', 'mustard seeds': 'spices', 'yellow mustard seed': 'spices', 'brown mustard seed': 'spices',
  'caraway': 'spices', 'caraway seed': 'spices', 'caraway seeds': 'spices',
  'saffron': 'spices', 'saffron thread': 'spices', 'saffron threads': 'spices', 'azafran': 'spices',
  'sumac': 'spices', 'ground sumac': 'spices',
  'star anise': 'spices', 'anise': 'spices', 'anise seed': 'spices', 'anise seeds': 'spices', 'anis': 'spices', 'anis estrellado': 'spices',
  'fenugreek': 'spices', 'fenugreek seed': 'spices', 'fenugreek seeds': 'spices', 'fenogreco': 'spices',
  'asafoetida': 'spices', 'asafetida': 'spices', 'hing': 'spices',
  'garam masala': 'spices',
  'curry powder': 'spices', 'madras curry powder': 'spices',
  'chili powder': 'spices', 'chile powder': 'spices', 'ancho chili powder': 'spices', 'chipotle powder': 'spices', 'chipotle chili powder': 'spices',
  'cayenne': 'spices', 'cayenne pepper': 'spices', 'ground cayenne': 'spices',
  'red pepper flakes': 'spices', 'crushed red pepper': 'spices', 'crushed red pepper flakes': 'spices', 'chili flakes': 'spices', 'chili flake': 'spices',
  'garlic powder': 'spices', 'granulated garlic': 'spices', 'ajo en polvo': 'spices', 'ajo molido': 'spices',
  'onion powder': 'spices', 'granulated onion': 'spices', 'cebolla en polvo': 'spices',
  'achiote': 'spices', 'annatto': 'spices', 'annatto powder': 'spices',
  'msg': 'spices', 'ajinomoto': 'spices', 'accent': 'spices',

  // Seasoning blends
  'italian seasoning': 'spices',
  'herbes de provence': 'spices', 'herbs de provence': 'spices',
  'zaatar': 'spices', 'za atar': 'spices',
  'jerk seasoning': 'spices',
  'taco seasoning': 'spices',
  'ranch seasoning': 'spices',
  'old bay': 'spices', 'old bay seasoning': 'spices',
  'cajun seasoning': 'spices', 'creole seasoning': 'spices',
  'chinese five spice': 'spices', 'five spice': 'spices', 'five-spice': 'spices', 'five spice powder': 'spices',
  'pumpkin pie spice': 'spices', 'apple pie spice': 'spices',
  'everything bagel seasoning': 'spices', 'everything seasoning': 'spices',
  'lemon pepper seasoning': 'spices',
  'adobo': 'spices', 'adobo seasoning': 'spices', 'sazon': 'spices', 'sazon goya': 'spices',
  'sazonador': 'spices',

  // Dried herbs (bare names default here; "fresh X" → vegetables already)
  'basil': 'spices', 'dried basil': 'spices', 'albahaca': 'spices',
  'oregano': 'spices', 'dried oregano': 'spices', 'mexican oregano': 'spices', 'oregano seco': 'spices',
  'thyme': 'spices', 'dried thyme': 'spices', 'tomillo': 'spices', 'tomillo seco': 'spices',
  'rosemary': 'spices', 'dried rosemary': 'spices', 'romero': 'spices', 'romero seco': 'spices',
  'sage': 'spices', 'dried sage': 'spices', 'salvia': 'spices',
  'marjoram': 'spices', 'mejorana': 'spices',
  'dill': 'spices', 'dried dill': 'spices', 'dill weed': 'spices', 'eneldo': 'spices', 'eneldo seco': 'spices',
  'mint': 'spices', 'dried mint': 'spices', 'hierbabuena': 'spices', 'menta': 'spices',
  'tarragon': 'spices', 'dried tarragon': 'spices', 'estragon': 'spices',
  'bay leaf': 'spices', 'bay leaves': 'spices', 'dried bay leaf': 'spices', 'dried bay leaves': 'spices', 'laurel': 'spices', 'hoja de laurel': 'spices', 'hojas de laurel': 'spices',
  'savory': 'spices', 'lavender': 'spices', 'dried lavender': 'spices',
  'chervil': 'spices',

  // Pastes that read as spice/seasoning more than pantry
  'ginger paste': 'spices', 'garlic paste': 'spices', 'chili paste': 'spices', 'chile paste': 'spices',
  'wasabi': 'spices', 'wasabi paste': 'spices',
  'horseradish': 'spices', 'prepared horseradish': 'spices', 'rabano picante': 'spices',
}

// ── Pre-sorted keys (longest first) ───────────────────────
//
// Sorting at module load time so compound terms ("tomato sauce") beat their
// bare component ("tomato"). Done once; runtime matching is constant work.

const SORTED_KEYS: string[] = Object.keys(DICT).sort((a, b) => b.length - a.length)

// ── Normalization ─────────────────────────────────────────

/**
 * Lowercase, accent-strip, letters-and-spaces-only. Pure transformation —
 * no user-controlled regex compiled, no I/O. The `[\u0300-\u036f]` range is
 * the Unicode combining-marks block; after NFD decomposition it strips all
 * Latin diacritics (á é í ó ú ü ñ) used in Spanish and other Romance
 * languages, plus French/Portuguese/etc. as a bonus.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Whitespace-bounded substring match ────────────────────
//
// True only when `key` appears in `text` surrounded by string-or-whitespace
// boundaries. Prevents "egg" from matching inside "eggplant" while still
// catching "egg" inside "large egg" or "egg yolks".

function containsAsWord(text: string, key: string): boolean {
  if (text === key) return true
  if (text.startsWith(key + ' ')) return true
  if (text.endsWith(' ' + key)) return true
  if (text.includes(' ' + key + ' ')) return true
  return false
}

// ── Public API ────────────────────────────────────────────

/**
 * Classify an ingredient name into one of the eight categories.
 * Empty/whitespace input returns 'other'. Unknown items return 'other'.
 *
 * Match precedence: longest dictionary key first. Whitespace-bounded.
 * Case- and accent-insensitive via `normalize()`.
 */
export function categorize(name: string): Category {
  if (!name) return 'other'
  const text = normalize(name)
  if (!text) return 'other'

  for (const key of SORTED_KEYS) {
    if (containsAsWord(text, key)) return DICT[key]
  }
  return 'other'
}

/**
 * Type guard for runtime category values, e.g. when reading a DB column
 * whose contents aren't yet trusted. Used by the picker and the page.
 */
export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && v in CATEGORY_LABELS
}
