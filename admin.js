/* Espace administrateur. La sécurité réelle vient de Supabase (connexion + règles RLS) :
   ce code ne fait que présenter les écrans. Sans compte administrateur, la base refuse toute écriture. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const C = window.BYB_CONFIG;

  /* mini-constructeur d'éléments : le texte est toujours inséré comme texte, jamais comme HTML */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "class") e.className = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach((c) => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }

  if (!window.supabase || !window.supabase.createClient) {
    $("boot").textContent = "Impossible de charger le module de connexion. Vérifie ta connexion internet puis recharge la page.";
    return;
  }
  const sb = window.supabase.createClient(C.supabaseUrl, C.publishableKey);

  const state = { settings: null, products: [], editing: null, newPhoto: null, photoRemoved: false, armed: false };
  const money = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n) + " " + ((state.settings && state.settings.currency) || "$");
  const photoUrl = (p) => (p ? C.supabaseUrl + "/storage/v1/object/public/" + C.bucket + "/" + p : "");
  const statusOf = (s) => (s <= 0 ? "out" : s <= 3 ? "low" : "ok");
  const LABEL = { ok: "En stock", low: "Dernières pièces", out: "Épuisé" };

  function setMsg(el, text, good) {
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.toggle("good", !!good);
  }
  function friendly(err) {
    const m = String((err && err.message) || err || "");
    if (/JWT|expired|not authenticated/i.test(m)) return "Ta session a expiré. Reconnecte-toi.";
    if (/row-level security|permission denied|violates row/i.test(m)) return "Action refusée : ce compte n'est pas autorisé à modifier la boutique.";
    if (/Failed to fetch|NetworkError|network/i.test(m)) return "Pas de connexion internet. Réessaie.";
    return "Une erreur est survenue : " + m;
  }
  function show(which) {
    $("boot").hidden = true;
    $("login").hidden = which !== "login";
    $("panel").hidden = which !== "panel";
  }

  /* ---------- connexion ---------- */
  async function start() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return show("login");
    await enter();
  }
  async function enter() {
    const { data, error } = await sb.rpc("is_admin");
    if (error || data !== true) {
      await sb.auth.signOut();
      show("login");
      setMsg($("loginMsg"), error ? friendly(error) : "Ce compte n'est pas administrateur de la boutique.");
      return;
    }
    try { await loadAll(); } catch (e) { show("panel"); setMsg($("panelMsg"), friendly(e)); return; }
    show("panel");
    render();
  }
  $("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setMsg($("loginMsg"), "");
    $("loginBtn").disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    $("loginBtn").disabled = false;
    if (error) {
      setMsg($("loginMsg"), /invalid/i.test(error.message) ? "E-mail ou mot de passe incorrect." : friendly(error));
      return;
    }
    $("password").value = "";
    await enter();
  });
  $("btnLogout").addEventListener("click", async () => { await sb.auth.signOut(); });
  sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") { state.products = []; show("login"); } });

  /* ---------- données ---------- */
  async function loadAll() {
    const [s, p] = await Promise.all([
      sb.from("shop_settings").select("*").eq("id", 1).single(),
      sb.from("products").select("*").order("created_at", { ascending: false })
    ]);
    if (s.error) throw s.error;
    if (p.error) throw p.error;
    state.settings = s.data;
    state.products = p.data;
  }

  /* ---------- liste ---------- */
  function render() {
    const list = $("plist");
    list.replaceChildren();
    $("admCount").textContent = state.products.length + (state.products.length > 1 ? " produits" : " produit");
    state.products.forEach((p) => {
      const st = statusOf(p.stock);
      const thumb = h("div", { class: "thumb", style: "--h:" + (Number(p.hue) || 150) },
        p.photo_path ? h("img", { src: photoUrl(p.photo_path), alt: "", loading: "lazy" }) : String(p.name).trim().charAt(0).toUpperCase());
      const meta = h("div", { class: "meta" },
        h("span", { class: "nm" }, p.name),
        h("span", { class: "sub" }, (p.category || "Sans catégorie") + " · " + money(p.price)),
        h("span", null, h("span", { class: "pill " + st }, LABEL[st])));
      const dec = h("button", { type: "button", "aria-label": "Retirer 1 en stock", onclick: () => changeStock(p, p.stock - 1) }, "−");
      const inc = h("button", { type: "button", "aria-label": "Ajouter 1 en stock", onclick: () => changeStock(p, p.stock + 1) }, "+");
      const stepper = h("div", { class: "stepper" }, dec, h("output", null, String(p.stock)), inc);
      const quick = p.stock > 0
        ? h("button", { class: "btn ghost small", type: "button", onclick: () => changeStock(p, 0) }, "Marquer épuisé")
        : h("button", { class: "btn ghost small", type: "button", onclick: () => changeStock(p, 1) }, "Remettre en stock");
      const edit = h("button", { class: "btn small", type: "button", onclick: () => openProduct(p) }, "Modifier");
      list.append(h("li", { class: "prow" }, thumb, meta, h("div", { class: "controls" }, stepper, quick, edit)));
    });
    if (!state.products.length) list.append(h("li", { class: "hint" }, "Aucun produit pour l'instant. Touche « Ajouter un produit »."));
  }
  async function changeStock(p, next) {
    if (next < 0) return;
    setMsg($("panelMsg"), "");
    const { data, error } = await sb.from("products").update({ stock: next }).eq("id", p.id).select();
    if (error || !data || !data.length) return setMsg($("panelMsg"), error ? friendly(error) : "Modification refusée par la base de données.");
    Object.assign(p, data[0]);
    render();
  }

  /* ---------- photo : recadrage carré + compression avant envoi ---------- */
  async function toJpeg(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) {
      bmp = await new Promise((res, rej) => {
        const im = new Image(); const u = URL.createObjectURL(file);
        im.onload = () => { URL.revokeObjectURL(u); res(im); };
        im.onerror = () => rej(new Error("Image illisible"));
        im.src = u;
      });
    }
    const w = bmp.width, hgt = bmp.height, side = Math.min(w, hgt), SIZE = 600;
    const cv = document.createElement("canvas");
    cv.width = cv.height = Math.min(SIZE, side);
    cv.getContext("2d").drawImage(bmp, (w - side) / 2, (hgt - side) / 2, side, side, 0, 0, cv.width, cv.height);
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Compression impossible"))), "image/jpeg", 0.8));
  }
  function paintPhoto() {
    const prev = $("photoPrev");
    prev.replaceChildren();
    let src = "";
    if (state.newPhoto) src = state.newPhoto.url;
    else if (state.editing && state.editing.photo_path && !state.photoRemoved) src = photoUrl(state.editing.photo_path);
    if (src) prev.append(h("img", { src, alt: "" })); else prev.textContent = "Pas de photo";
    $("photoClear").hidden = !src;
  }
  $("photoInput").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setMsg($("productMsg"), "");
    try {
      const blob = await toJpeg(f);
      if (state.newPhoto) URL.revokeObjectURL(state.newPhoto.url);
      state.newPhoto = { blob, url: URL.createObjectURL(blob) };
      state.photoRemoved = false;
      paintPhoto();
    } catch (err) { setMsg($("productMsg"), "Cette photo n'a pas pu être lue. Essaie une autre image."); }
  });
  $("photoClear").addEventListener("click", () => {
    if (state.newPhoto) { URL.revokeObjectURL(state.newPhoto.url); state.newPhoto = null; }
    state.photoRemoved = true;
    paintPhoto();
  });

  /* ---------- fiche produit ---------- */
  function disarm() { state.armed = false; const b = $("productDelete"); b.classList.remove("armed"); b.textContent = "Supprimer ce produit"; }
  function openProduct(p) {
    state.editing = p || null; state.newPhoto = null; state.photoRemoved = false; disarm();
    $("productTitle").textContent = p ? "Modifier le produit" : "Nouveau produit";
    $("pName").value = p ? p.name : "";
    $("pCat").value = p ? (p.category || "") : "";
    $("pPrice").value = p ? p.price : "";
    $("pStock").value = p ? p.stock : 1;
    $("pDesc").value = p ? (p.description || "") : "";
    document.querySelectorAll(".cur").forEach((e) => { e.textContent = (state.settings && state.settings.currency) || "$"; });
    $("catList").replaceChildren(...Array.from(new Set(state.products.map((x) => x.category).filter(Boolean))).map((c) => h("option", { value: c })));
    $("productDelete").hidden = !p;
    setMsg($("productMsg"), "");
    paintPhoto();
    $("productDlg").showModal();
  }
  $("btnAdd").addEventListener("click", () => openProduct(null));
  $("productCancel").addEventListener("click", () => $("productDlg").close());
  $("productDlg").addEventListener("close", () => { if (state.newPhoto) { URL.revokeObjectURL(state.newPhoto.url); state.newPhoto = null; } });

  async function removePhotoFile(path) { if (path) await sb.storage.from(C.bucket).remove([path]).catch(() => {}); }

  $("productForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = $("pName").value.trim();
    const price = Number($("pPrice").value);
    const stock = Number($("pStock").value);
    if (!name) return setMsg($("productMsg"), "Le nom est obligatoire.");
    if (!isFinite(price) || price < 0 || $("pPrice").value === "") return setMsg($("productMsg"), "Entre un prix valide (0 ou plus).");
    if (!Number.isInteger(stock) || stock < 0) return setMsg($("productMsg"), "Le stock doit être un nombre entier, 0 ou plus.");
    setMsg($("productMsg"), "");
    $("productSave").disabled = true;
    const old = state.editing;
    let uploaded = null;
    try {
      let photo_path = old ? old.photo_path : null;
      if (state.newPhoto) {
        uploaded = crypto.randomUUID() + ".jpg";
        const up = await sb.storage.from(C.bucket).upload(uploaded, state.newPhoto.blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) { uploaded = null; throw up.error; }
        photo_path = uploaded;
      } else if (state.photoRemoved) photo_path = null;
      const hue = old && old.hue != null ? old.hue : Array.from(name).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
      const row = { name, category: $("pCat").value.trim(), description: $("pDesc").value.trim(), price, stock, photo_path, hue };
      const q = old ? sb.from("products").update(row).eq("id", old.id) : sb.from("products").insert(row);
      const { data, error } = await q.select();
      if (error) throw error;
      if (!data || !data.length) throw new Error("Enregistrement refusé par la base de données.");
      const oldPath = old ? old.photo_path : null;
      if (old) Object.assign(old, data[0]); else state.products.unshift(data[0]);
      if (oldPath && oldPath !== data[0].photo_path) await removePhotoFile(oldPath);
      $("productDlg").close();
      render();
    } catch (e) {
      if (uploaded) await removePhotoFile(uploaded);
      setMsg($("productMsg"), friendly(e));
    } finally { $("productSave").disabled = false; }
  });

  $("productDelete").addEventListener("click", async () => {
    const p = state.editing; if (!p) return;
    if (!state.armed) {
      state.armed = true; $("productDelete").classList.add("armed"); $("productDelete").textContent = "Touche encore pour confirmer la suppression";
      return;
    }
    $("productDelete").disabled = true;
    const { data, error } = await sb.from("products").delete().eq("id", p.id).select();
    $("productDelete").disabled = false;
    if (error || !data || !data.length) return setMsg($("productMsg"), error ? friendly(error) : "Suppression refusée par la base de données.");
    await removePhotoFile(p.photo_path);
    state.products = state.products.filter((x) => x.id !== p.id);
    $("productDlg").close();
    render();
  });

  /* ---------- réglages ---------- */
  function svcRow(v) {
    const t = h("input", { maxlength: "80", placeholder: "Titre du service", value: (v && v.title) || "" });
    const x = h("textarea", { maxlength: "240", placeholder: "Description" });
    x.value = (v && v.text) || "";
    const row = h("div", { class: "svc-edit" }, t, x,
      h("button", { class: "btn danger small", type: "button", onclick: () => row.remove() }, "Retirer ce service"));
    row._get = () => ({ title: t.value.trim(), text: x.value.trim() });
    return row;
  }
  $("btnSettings").addEventListener("click", () => {
    const s = state.settings, c = s.club || {};
    $("sName").value = s.name || ""; $("sWa").value = s.whatsapp || ""; $("sCur").value = s.currency || "$";
    $("sWTitle").value = s.welcome_title || ""; $("sWelcome").value = s.welcome || ""; $("sHours").value = s.hours || "";
    $("cTitle").value = c.title || ""; $("cText").value = c.text || ""; $("cPerks").value = (c.perks || []).join("\n");
    $("cBtn").value = c.button || ""; $("cMsg").value = c.message || "";
    $("svcEdit").replaceChildren(...(Array.isArray(s.services) ? s.services : []).map(svcRow));
    setMsg($("settingsMsg"), "");
    $("settingsDlg").showModal();
  });
  $("svcAdd").addEventListener("click", () => $("svcEdit").append(svcRow(null)));
  $("settingsCancel").addEventListener("click", () => $("settingsDlg").close());
  $("settingsForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const wa = $("sWa").value.replace(/\D/g, "");
    if (!$("sName").value.trim()) return setMsg($("settingsMsg"), "Le nom de la boutique est obligatoire.");
    if (wa && (wa.length < 8 || wa.length > 15)) return setMsg($("settingsMsg"), "Numéro WhatsApp invalide : indicatif du pays + numéro, entre 8 et 15 chiffres.");
    const row = {
      name: $("sName").value.trim(), whatsapp: wa, currency: $("sCur").value.trim() || "$",
      welcome_title: $("sWTitle").value.trim(), welcome: $("sWelcome").value.trim(), hours: $("sHours").value.trim(),
      club: {
        title: $("cTitle").value.trim(), text: $("cText").value.trim(),
        perks: $("cPerks").value.split("\n").map((x) => x.trim()).filter(Boolean),
        button: $("cBtn").value.trim(), message: $("cMsg").value.trim()
      },
      services: Array.from($("svcEdit").children).map((r) => r._get()).filter((v) => v.title)
    };
    setMsg($("settingsMsg"), "");
    $("settingsSave").disabled = true;
    const { data, error } = await sb.from("shop_settings").update(row).eq("id", 1).select();
    $("settingsSave").disabled = false;
    if (error || !data || !data.length) return setMsg($("settingsMsg"), error ? friendly(error) : "Enregistrement refusé par la base de données.");
    state.settings = data[0];
    $("settingsDlg").close();
    render();
  });

  start().catch((e) => { show("login"); setMsg($("loginMsg"), friendly(e)); });
})();
