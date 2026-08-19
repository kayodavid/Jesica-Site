const REQUEST_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const requestBuckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(ip) {
  const now = Date.now();
  const current = (requestBuckets.get(ip) || []).filter(timestamp => now - timestamp < REQUEST_WINDOW_MS);
  if (current.length >= MAX_REQUESTS_PER_WINDOW) {
    requestBuckets.set(ip, current);
    return true;
  }
  current.push(now);
  requestBuckets.set(ip, current);
  return false;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getNutrient(nutriments, key) {
  const value = nutriments?.[`${key}_100g`] ?? nutriments?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map(tag => cleanText(tag).replace(/^[a-z]{2}:/i, '').replace(/-/g, ' '))
    .filter(Boolean)
    .slice(0, 8);
}

function mapProduct(code, product) {
  const nutriments = product?.nutriments || {};
  const productName = cleanText(product?.product_name_pt) || cleanText(product?.product_name) || 'Produto sem nome cadastrado';
  return {
    code,
    name: productName,
    brand: cleanText(product?.brands),
    quantity: cleanText(product?.quantity),
    imageUrl: cleanText(product?.image_front_url) || cleanText(product?.image_url),
    ingredients: cleanText(product?.ingredients_text_pt) || cleanText(product?.ingredients_text),
    allergens: normalizeTags(product?.allergens_tags),
    nutritionGrade: cleanText(product?.nutrition_grades).toUpperCase(),
    novaGroup: Number.isFinite(Number(product?.nova_group)) ? Number(product.nova_group) : null,
    nutrients: {
      energyKcal: getNutrient(nutriments, 'energy-kcal'),
      carbohydrates: getNutrient(nutriments, 'carbohydrates'),
      sugars: getNutrient(nutriments, 'sugars'),
      proteins: getNutrient(nutriments, 'proteins'),
      fat: getNutrient(nutriments, 'fat'),
      saturatedFat: getNutrient(nutriments, 'saturated-fat'),
      fiber: getNutrient(nutriments, 'fiber'),
      sodium: getNutrient(nutriments, 'sodium'),
      salt: getNutrient(nutriments, 'salt')
    },
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`,
    consultedAt: new Date().toISOString()
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  const rawCode = Array.isArray(req.query?.code) ? req.query.code[0] : req.query?.code;
  const code = String(rawCode || '').replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(code)) {
    return res.status(400).json({ error: 'Informe um código de barras válido com 8 a 14 dígitos.' });
  }

  if (isRateLimited(getClientIp(req))) {
    return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto e tente novamente.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v3.6/product/${encodeURIComponent(code)}.json`, {
      headers: {
        'User-Agent': 'JessicaMeloNutri/1.0 (contato@jessicamelonutri.com.br)',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6'
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Open Food Facts respondeu com status ${response.status}`);
    const data = await response.json();
    const found = data?.status === 'success' && data?.result?.id === 'product_found' && data?.product;
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    if (!found) return res.status(404).json({ error: 'Produto não encontrado na base consultada.', code });
    return res.status(200).json({ product: mapProduct(code, data.product) });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'A consulta demorou mais do que o esperado. Tente novamente.' : 'Não foi possível consultar o produto neste momento.';
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
}
