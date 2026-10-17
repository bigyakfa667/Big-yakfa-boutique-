/*
  Accès aux données de la boutique (page publique) : LECTURE SEULE depuis Supabase.
  loadCatalog() renvoie : { example, shop, club, services, products }
  Les règles de sécurité de la base autorisent le public à lire, jamais à écrire.
*/
async function loadCatalog() {
  const c = window.BYB_CONFIG;
  const headers = { apikey: c.publishableKey, Accept: "application/json" };
  const get = async (path) => {
    const r = await fetch(c.supabaseUrl + "/rest/v1/" + path, { headers, cache: "no-store" });
    if (!r.ok) throw new Error("Lecture impossible (code " + r.status + ")");
    return r.json();
  };
  const [settingsRows, rows] = await Promise.all([
    get("shop_settings?select=*&id=eq.1"),
    get("products?select=*&order=created_at.desc")
  ]);
  const s = settingsRows[0] || {};
  const photoUrl = (path) => path ? c.supabaseUrl + "/storage/v1/object/public/" + c.bucket + "/" + path : "";
  return {
    example: false,
    shop: {
      name: s.name || "Big Yakfa Business",
      welcomeTitle: s.welcome_title || "",
      welcome: s.welcome || "",
      whatsapp: s.whatsapp || "",
      currency: s.currency || "$",
      hours: s.hours || ""
    },
    club: s.club || null,
    services: Array.isArray(s.services) ? s.services : [],
    products: rows.map((p) => ({
      id: p.id,
      name: p.name,
      cat: p.category || "",
      description: p.description || "",
      price: Number(p.price),
      stock: Number(p.stock),
      hue: p.hue,
      photo: photoUrl(p.photo_path)
    }))
  };
}
