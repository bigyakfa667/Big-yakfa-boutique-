/*
  Réglages de connexion à la base de données (Supabase).
  Ces deux valeurs sont PUBLIQUES par conception : elles ne donnent que les droits
  prévus par les règles de sécurité (lecture du catalogue). Elles ne permettent
  jamais de modifier quoi que ce soit sans être connecté comme administrateur.
  Ne jamais mettre ici la clé « secret » ni « service_role ».
*/
window.BYB_CONFIG = {
  supabaseUrl: "https://xsxvqjeorlvhnvnvvser.supabase.co",
  publishableKey: "sb_publishable_DdvryQ2ypWgbC8IPDFoA8g_v0hpGQfQ",
  bucket: "product-photos"
};
