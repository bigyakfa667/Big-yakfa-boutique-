/*
  Accès aux données de la boutique.
  Pour l'instant, le catalogue est lu dans le fichier catalog.json.
  Étape suivante : ce fichier sera remplacé par une version qui lit Supabase.
  Le reste du site (app.js) ne changera pas, car il appelle seulement loadCatalog().

  loadCatalog() renvoie : { example, shop, club, services, products }
*/
async function loadCatalog() {
  const response = await fetch("catalog.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Catalogue introuvable (code " + response.status + ")");
  return response.json();
}
