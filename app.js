/* Page publique de la boutique : affichage seulement. Aucune modification possible ici. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let data;
  try {
    data = await loadCatalog();
  } catch (e) {
    $("grid").innerHTML = '<p class="fail">Le catalogue n\'a pas pu se charger. Vérifie ta connexion puis recharge la page.</p>';
    $("count").textContent = "";
    return;
  }

  const shop = data.shop || {};
  const products = Array.isArray(data.products) ? data.products : [];
  const money = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n) + " " + (shop.currency || "$");
  const waNumber = String(shop.whatsapp || "").replace(/\D/g, "");
  const wa = (text) => "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(text);
  const status = (p) => (p.stock <= 0 ? "out" : p.stock <= 3 ? "low" : "ok");
  const LABEL = { ok: "En stock", low: "Dernières pièces", out: "Épuisé" };
  const state = { q: "", cat: "Tous", inStock: false };
  /* minuscules et sans accents, pour que « serum » trouve « Sérum » */
  const plain = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  /* en-tête */
  $("shopName").textContent = shop.name || "";
  $("welcomeTitle").textContent = shop.welcomeTitle || "";
  $("welcomeText").textContent = shop.welcome || "";
  $("welcomeTitle").hidden = !shop.welcomeTitle;
  $("exampleNote").hidden = !data.example;
  $("hours").textContent = shop.hours || "";
  $("hours").hidden = !shop.hours;
  $("waMain").href = wa("Bonjour, j'ai vu votre catalogue.");
  $("waFoot").href = wa("Bonjour, j'ai une question sur vos produits.");

  /* club de fidélité */
  const club = data.club;
  if (club && club.title) {
    $("clubTitle").textContent = club.title;
    $("clubText").textContent = club.text || "";
    $("clubPerks").innerHTML = (club.perks || []).map((p) => "<li>" + esc(p) + "</li>").join("");
    $("waClub").textContent = club.button || "Rejoindre";
    $("waClub").href = wa(club.message || "Bonjour, je veux rejoindre le club.");
    $("club").hidden = false;
  }

  /* services */
  const services = data.services || [];
  $("svcList").innerHTML = services.map((v) => '<li class="svc"><h3>' + esc(v.title) + "</h3><p>" + esc(v.text) + "</p></li>").join("");
  $("services").hidden = !services.length;

  /* filtres */
  const cats = Array.from(new Set(products.map((p) => p.cat).filter(Boolean)));
  function renderChips() {
    $("chips").innerHTML = ["Tous"].concat(cats).map((c) =>
      '<button type="button" class="chip" data-cat="' + esc(c) + '" aria-pressed="' + (state.cat === c) + '">' + esc(c) + "</button>"
    ).join("") + '<button type="button" class="chip stock" data-stock="1" aria-pressed="' + state.inStock + '">En stock seulement</button>';
  }

  /* produits */
  function cardHTML(p) {
    const s = status(p), out = s === "out";
    const tile = p.photo
      ? '<img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" loading="lazy">'
      : '<b aria-hidden="true">' + esc(String(p.name).trim().charAt(0).toUpperCase()) + "</b>";
    const msg = out
      ? 'Bonjour, prévenez-moi quand "' + p.name + '" sera de nouveau disponible.'
      : "Bonjour, je veux commander : " + p.name + " (" + money(p.price) + ").";
    return '<article class="card ' + (out ? "out" : "") + '">' +
      '<div class="tile" style="--h:' + (Number(p.hue) || 150) + '">' + tile + '<span class="badge ' + s + '">' + LABEL[s] + "</span></div>" +
      '<div class="info">' +
        '<span class="cat">' + esc(p.cat) + "</span>" +
        '<h3 class="name">' + esc(p.name) + "</h3>" +
        (p.description ? '<p class="desc">' + esc(p.description) + "</p>" : "") +
        '<span class="price">' + money(p.price) + "</span>" +
        '<a class="btn ' + (out ? "ghost" : "") + '" href="' + wa(msg) + '" target="_blank" rel="noopener">' + (out ? "Me prévenir" : "Commander") + "</a>" +
      "</div></article>";
  }

  function renderGrid() {
    const q = plain(state.q.trim());
    const list = products.filter((p) =>
      (state.cat === "Tous" || p.cat === state.cat) &&
      (!state.inStock || p.stock > 0) &&
      (!q || plain(p.name + " " + p.cat + " " + (p.description || "")).includes(q)));
    $("count").textContent = list.length + (list.length > 1 ? " produits" : " produit");
    if (!list.length) {
      $("grid").innerHTML = products.length
        ? '<p class="empty">Aucun produit ne correspond. Essaie un autre mot ou écris-nous, on peut le chercher pour toi.</p>'
        : '<p class="empty">Le catalogue arrive bientôt.</p>';
      return;
    }
    $("grid").innerHTML = list.map(cardHTML).join("");
  }

  $("q").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.stock) state.inStock = !state.inStock; else state.cat = b.dataset.cat;
    renderChips(); renderGrid();
  });

  renderChips();
  renderGrid();
})();
